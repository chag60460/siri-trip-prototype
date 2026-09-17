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

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ROUNDS = 8;

interface Part { text?: string; functionCall?: { name: string; args: unknown }; functionResponse?: { name: string; response: object } }
interface Content { role: 'user' | 'model'; parts: Part[] }

function messageFor(status: number, detail: string): ChatError {
  if (status === 401 || status === 403) return new ChatError(503, 'The demo AI key was rejected. The case study and design screens are still available.');
  if (status === 404) return new ChatError(503, `The configured demo model is unavailable. Set GEMINI_MODEL to a model this key can use. ${detail}`.trim());
  if (status === 429) return new ChatError(429, 'The demo is busy right now. Wait a moment and send your message again.');
  if (status === 503) return new ChatError(503, 'The demo model is busy right now. Wait a few seconds and send your message again.');
  if (status === 400) return new ChatError(502, `The model rejected the request. ${detail}`.trim());
  return new ChatError(502, 'The model is temporarily unavailable. Please try again.');
}

export class GeminiBackend implements PlannerBackend {
  readonly model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  private readonly key = process.env.GEMINI_API_KEY ?? '';
  private started: Promise<void> | null = null;

  async ready(): Promise<void> {
    if (!this.key) throw new ChatError(503, 'The demo AI backend is not configured. The case study and design screens are still available.');
    if (!this.started) {
      this.started = fetch(`${ENDPOINT}/${encodeURIComponent(this.model)}`, { headers: { 'x-goog-api-key': this.key } })
        .then(async response => {
          if (response.ok) return;
          const detail = await response.text().catch(() => '');
          console.error(`Gemini model check failed for ${this.model} (${response.status}): ${detail.slice(0, 500)}`);
          throw messageFor(response.status, `Configured model: ${this.model}.`);
        })
        .catch(error => {
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
    const history: Content[] = [];
    const listeners = new Set<(text: string) => void>();
    let controller: AbortController | null = null;

    const runTool = (name: string, args: unknown): string => {
      switch (name) {
        case PREFERENCE_TOOL_NAME: return runPreferenceTool(args, present, reportInvalid);
        case DEMO_CALENDAR_TOOL_NAME: return runDemoCalendarTool(args, readCalendar);
        case DEMO_APP_TOOL_NAME: return runDemoAppTool(args, (app, kind) => readApp(app, kind));
        case DEMO_TRAVEL_TOOL_NAME: return runDemoTravelTool(args, readTravel);
        default: throw new TypeError(`Unknown tool: ${name}`);
      }
    };

    const round = async (signal: AbortSignal): Promise<Part[]> => {
      const body = {
        systemInstruction: { parts: [{ text: `${PERSONA.replace('powered by GitHub Copilot.', 'powered by a hosted AI model.')}\n\n${PREFERENCE_TOOL_INSTRUCTIONS}` }] },
        contents: history,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          ...(this.model.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      };
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          const payload = await response.json() as { candidates?: { content?: { parts?: Part[] } }[] };
          return payload.candidates?.[0]?.content?.parts ?? [];
        }
        const detail = await response.text().catch(() => '');
        const delay = retryDelay(response, attempt);
        if (delay !== null) {
          console.warn(`Gemini returned ${response.status}; retrying in ${delay}ms.`);
          await wait(delay, signal);
          continue;
        }
        console.error(`Gemini request failed (${response.status}): ${detail.slice(0, 500)}`);
        throw messageFor(response.status, detail.slice(0, 200));
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
        history.push({ role: 'user', parts: [{ text: prompt }] });
        let reply = '';
        for (let attempt = 0; attempt < MAX_TOOL_ROUNDS; attempt += 1) {
          const parts = await round(signal);
          const calls = parts.filter(part => part.functionCall);
          history.push({ role: 'model', parts });
          if (!calls.length) {
            reply = parts.map(part => part.text ?? '').join('');
            break;
          }
          history.push({
            role: 'user',
            parts: calls.map(part => {
              const call = part.functionCall!;
              try {
                return { functionResponse: { name: call.name, response: { result: runTool(call.name, call.args) } } };
              } catch (error) {
                return { functionResponse: { name: call.name, response: { error: error instanceof Error ? error.message : 'The tool call failed.' } } };
              }
            }),
          });
        }
        return reply;
      },
      abort: async () => {
        controller?.abort();
      },
      disconnect: async () => {
        controller?.abort();
        listeners.clear();
        history.length = 0;
      },
    };
  }

  async close(): Promise<void> {
    // Stateless HTTP backend: nothing to shut down.
  }
}
