import type { PreferencePresentation } from '../src/preferences.ts';
import type { AppPreferenceKind, DemoAppId, DemoAppRead } from '../src/demo-apps.ts';
import type { DemoCalendarData } from '../src/demo-calendar.ts';
import type { DemoTravelOffers, DemoTravelSearch } from '../src/demo-travel.ts';
import { ChatError, PERSONA } from './copilot-planner.ts';
import type { PlannerBackend, PlannerSession } from './planner-backend.ts';
import { retryDelay, wait } from './planner-backend.ts';
import { TOOL_DECLARATIONS } from './tool-declarations.ts';
import { PREFERENCE_TOOL_INSTRUCTIONS, PREFERENCE_TOOL_NAME, runPreferenceTool } from './preference-tool.ts';
import { DEMO_CALENDAR_TOOL_NAME, runDemoCalendarTool } from './demo-calendar-tool.ts';
import { DEMO_APP_TOOL_NAME, runDemoAppTool } from './demo-app-tool.ts';
import { DEMO_TRAVEL_TOOL_NAME, runDemoTravelTool } from './demo-travel-tool.ts';

const MAX_TOOL_ROUNDS = 8;

// OpenAI-compatible providers validate strict JSON Schema, where nullability is a type union rather than `nullable`.
function toJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toJsonSchema);
  if (typeof value !== 'object' || value === null) return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (key !== 'nullable') result[key] = toJsonSchema(item);
  }
  if (source.nullable === true && typeof result.type === 'string') result.type = [result.type, 'null'];
  return result;
}

const TOOLS = TOOL_DECLARATIONS.map(tool => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: toJsonSchema(tool.parameters) },
}));

interface ToolCall { id?: string; function?: { name?: string; arguments?: string } }
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

function messageFor(status: number): ChatError {
  if (status === 401 || status === 403) return new ChatError(503, 'The demo AI key was rejected. The case study and design screens are still available.');
  if (status === 404) return new ChatError(503, 'The configured demo model is unavailable. Set AI_MODEL to a model this key can use.');
  if (status === 429) return new ChatError(429, 'The demo is busy right now. Wait a moment and send your message again.');
  if (status === 503) return new ChatError(503, 'The demo model is busy right now. Wait a few seconds and send your message again.');
  if (status === 400) return new ChatError(502, 'The model rejected the request. Please try again.');
  return new ChatError(502, 'The model is temporarily unavailable. Please try again.');
}

/** Any OpenAI-compatible chat-completions provider: Groq, OpenRouter, Cerebras, Mistral, xAI, OpenAI. */
export class OpenAIBackend implements PlannerBackend {
  readonly model = process.env.AI_MODEL ?? '';
  private readonly base = (process.env.AI_BASE_URL ?? '').replace(/\/+$/, '');
  private readonly key = process.env.AI_API_KEY ?? '';
  private started: Promise<void> | null = null;

  async ready(): Promise<void> {
    if (!this.base || !this.key || !this.model) {
      throw new ChatError(503, 'The demo AI backend is not configured. The case study and design screens are still available.');
    }
    if (!this.started) {
      this.started = (async () => {
        const response = await fetch(`${this.base}/models`, { headers: { Authorization: `Bearer ${this.key}` } });
        // Providers without a catalog endpoint are validated by the first chat request instead.
        if (!response.ok) return;
        const payload = await response.json() as { data?: { id?: string }[] };
        const ids = (payload.data ?? []).map(entry => entry.id).filter((id): id is string => Boolean(id));
        if (ids.length && !ids.includes(this.model)) {
          console.error(`AI_MODEL "${this.model}" is not available. Available: ${ids.join(', ')}`);
          throw new ChatError(503, `The configured demo model is unavailable. Set AI_MODEL to one this key can use, such as: ${ids.slice(0, 5).join(', ')}.`);
        }
      })().catch(error => {
        this.started = null;
        throw error;
      });
    }
    await this.started;
  }

  async createSession(
    present: (value: PreferencePresentation) => void,
    readCalendar: () => DemoCalendarData,
    readApp: (app: DemoAppId, kind: AppPreferenceKind) => DemoAppRead,
    readTravel: (search: DemoTravelSearch) => DemoTravelOffers,
    reportInvalid: (reason: string) => void,
  ): Promise<PlannerSession> {
    const history: Message[] = [{
      role: 'system',
      content: `${PERSONA.replace('powered by GitHub Copilot.', 'powered by a hosted AI model.')}\n\n${PREFERENCE_TOOL_INSTRUCTIONS}`,
    }];
    const listeners = new Set<(text: string) => void>();
    let controller: AbortController | null = null;

    const runTool = (name: string, args: unknown): string => {
      switch (name) {
        case PREFERENCE_TOOL_NAME: return runPreferenceTool(args, present, reportInvalid);
        case DEMO_CALENDAR_TOOL_NAME: return runDemoCalendarTool(args, readCalendar);
        case DEMO_APP_TOOL_NAME: return runDemoAppTool(args, readApp);
        case DEMO_TRAVEL_TOOL_NAME: return runDemoTravelTool(args, readTravel);
        default: throw new TypeError(`Unknown tool: ${name}`);
      }
    };

    const round = async (signal: AbortSignal): Promise<Message> => {
      const body = { model: this.model, messages: history, tools: TOOLS, tool_choice: 'auto', temperature: 0.7 };
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(`${this.base}/chat/completions`, {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          const payload = await response.json() as { choices?: { message?: Message }[] };
          return payload.choices?.[0]?.message ?? { role: 'assistant', content: '' };
        }
        const detail = await response.text().catch(() => '');
        const delay = retryDelay(response, attempt);
        if (response.status === 429) {
          const limits = ['requests', 'tokens'].map(unit => `${unit} ${response.headers.get(`x-ratelimit-remaining-${unit}`) ?? '?'}/${response.headers.get(`x-ratelimit-limit-${unit}`) ?? '?'}`);
          console.warn(`AI provider rate limit reached (${limits.join(', ')}).`);
        }
        if (delay !== null) {
          console.warn(`AI provider returned ${response.status}; retrying in ${delay}ms.`);
          await wait(delay, signal);
          continue;
        }
        console.error(`AI request failed (${response.status}): ${detail.slice(0, 500)}`);
        throw messageFor(response.status);
      }
    };

    return {
      onDelta: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      send: async (prompt, _displayPrompt, timeout) => {
        controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
        history.push({ role: 'user', content: prompt });
        let reply = '';
        for (let attempt = 0; attempt < MAX_TOOL_ROUNDS; attempt += 1) {
          const message = await round(signal);
          history.push(message);
          const calls = message.tool_calls ?? [];
          if (!calls.length) {
            reply = message.content ?? '';
            break;
          }
          for (const call of calls) {
            const name = call.function?.name ?? '';
            let content: string;
            try {
              content = runTool(name, JSON.parse(call.function?.arguments || '{}'));
            } catch (error) {
              content = error instanceof Error ? error.message : 'The tool call failed.';
            }
            history.push({ role: 'tool', tool_call_id: call.id, content });
          }
        }
        return reply;
      },
      abort: async () => {
        controller?.abort();
      },
      disconnect: async () => {
        controller?.abort();
        listeners.clear();
        history.length = 1;
      },
    };
  }

  async close(): Promise<void> {
    // Stateless HTTP backend: nothing to shut down.
  }
}
