import { CopilotClient } from '@github/copilot-sdk';
import type { CopilotSession, SessionConfig } from '@github/copilot-sdk';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { AIStatus, ChatEvent, ChatRequest } from '../src/chat-protocol.ts';
import { acceptedPreferenceProposal, hasUnconfirmedAnswer, preservePreferenceSources } from '../src/preferences.ts';
import type { PreferencePresentation, PreferenceQuestion, PreferenceValue } from '../src/preferences.ts';
import { parseDay } from '../src/dates.ts';
import type { DemoCalendarData } from '../src/demo-calendar.ts';
import { demoAppDetails, demoAppIds, isPreferenceDelegation } from '../src/demo-apps.ts';
import type { AppPreferenceKind, DemoAppId, DemoAppRead } from '../src/demo-apps.ts';
import { createMemoryFiles } from './memory-files.ts';
import { createPreferenceTool, PREFERENCE_TOOL_INSTRUCTIONS, PREFERENCE_TOOL_NAME } from './preference-tool.ts';
import { createDemoCalendarTool, DemoCalendarAccess, DemoCalendarAccessError, DEMO_CALENDAR_TOOL_NAME } from './demo-calendar-tool.ts';
import { createDemoAppTool, DemoAppAccess, DemoAppAccessError, DEMO_APP_TOOL_NAME, requestedAppAssistance } from './demo-app-tool.ts';
import type { AppAssistance } from './demo-app-tool.ts';
import { sendPreferenceReply } from './preference-reply.ts';
import { createDemoTravelOffers } from '../src/demo-travel.ts';
import type { DemoTravelOffers, DemoTravelSearch } from '../src/demo-travel.ts';
import { attachDemoTravelOffers, createDemoTravelTool, DemoTravelAccessError, DEMO_TRAVEL_TOOL_NAME } from './demo-travel-tool.ts';
import type { PlannerBackend, PlannerSession } from './planner-backend.ts';

export class ChatError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface PlannerService {
  status(): Promise<AIStatus>;
  stream(request: ChatRequest, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<void>;
  release(id: string): Promise<void>;
  close(): Promise<void>;
}

export const PERSONA = `You are a helpful, creative, conversational planning assistant in an independent Siri-style prototype, powered by GitHub Copilot.
The user initiates every conversation. Help with any kind of planning or thinking: events, learning, projects, meals, routines, travel, or other goals. Answer other reasonable requests naturally too.
There is no predetermined topic, canned response, or rigid questionnaire. Follow the structured display-tool contracts while personalizing the content to the user's actual request and conversation context.
For a trip-planning request, gather preferences before planning: dates, budget, lodging, food, and activities. A destination alone is not enough to draft a trip. For a destination-only request, start by asking about dates. Prefer the High-Fi order of dates, budget, activities, food, then lodging, while skipping preferences already answered.
During preference gathering, ask only one short question per reply, then wait for the user. Keep the entire reply to at most two short sentences and 40 words. Do not include an itinerary, recommendations, sample plans, lists of places, or a long introduction alongside the question.
Use preferences already supplied anywhere in the conversation, including attached dates. If one message answers several preferences, use all of them and ask only about what is still missing. Never ask again for a preference already answered. Choose the next useful question naturally rather than forcing a fixed sequence.
Accept flexible dates, no preference, undecided, or skip as answers, not reasons to keep asking. If the user explicitly asks for a rough plan now, asks to skip questions, or asks you to make assumptions, proceed and label those assumptions.
Once dates, budget, lodging, food, and activities are known or explicitly left flexible, produce a concise personalized plan without another confirmation question. Do not invent missing preferences or silently substitute defaults before gathering them.
For other planning topics, gather the relevant missing goals or constraints before a detailed plan, not travel-specific preferences. Answer clearly specified requests and narrower factual questions directly without unnecessary intake.
Be warm, direct, and concise enough for a phone conversation. Use readable Markdown, short paragraphs, and practical lists. Expand when the user asks for detail.
Use dates and constraints supplied by the user. Never fabricate personal calendar access, spending history, live prices, availability, bookings, completed actions, or external research. Tools may display preference controls and, only with explicit per-app permission, read the synthetic demo Calendar, Bank, or Maps. A separate read_demo_travel_offers tool reads public synthetic inventory for fictional flight and hotel offer cards. It needs no private-app permission and cannot purchase or reserve anything. You have no real calendar, bank account, location history, filesystem, terminal, browsing, or microphone access. Never present sample app data as the user's real information. Provide drafts and advice, not claims that you executed a plan.
Do not identify yourself as the real Apple Siri. Do not expose or invent internal reasoning; give the useful answer.`;

export function plannerSessionConfig(
  model: string, present: (value: PreferencePresentation) => void, readCalendar: () => DemoCalendarData,
  readApp: (app: DemoAppId, kind: AppPreferenceKind) => DemoAppRead,
  readTravel: (search: DemoTravelSearch) => DemoTravelOffers,
  reportInvalid?: (reason: string) => void,
): SessionConfig {
  return {
    clientName: 'siri-planner-web',
    model,
    workingDirectory: tmpdir(),
    availableTools: [`custom:${PREFERENCE_TOOL_NAME}`, `custom:${DEMO_CALENDAR_TOOL_NAME}`, `custom:${DEMO_APP_TOOL_NAME}`, `custom:${DEMO_TRAVEL_TOOL_NAME}`],
    excludedTools: ['builtin:*', 'mcp:*'],
    tools: [createPreferenceTool(present, reportInvalid), createDemoCalendarTool(readCalendar), createDemoAppTool(readApp), createDemoTravelTool(readTravel)],
    streaming: true,
    reasoningSummary: 'none',
    skipCustomInstructions: true,
    enableConfigDiscovery: false,
    enableOnDemandInstructionDiscovery: false,
    enableFileHooks: false,
    enableHostGitOperations: false,
    enableFileChangeTracking: false,
    enableSessionStore: false,
    enableSessionTelemetry: false,
    enableSkills: false,
    skipEmbeddingRetrieval: true,
    embeddingCacheStorage: 'in-memory',
    includedBuiltinSkills: [],
    pluginDirectories: [],
    mcpServers: {},
    memory: { enabled: false },
    infiniteSessions: { enabled: false },
    remoteSession: 'off',
    onPermissionRequest: () => ({ kind: 'reject', feedback: 'Only the preference renderer, permission-gated demo app readers, and synthetic travel inventory are permitted. All host and external access is denied.' }),
    createSessionFsProvider: () => createMemoryFiles(tmpdir()),
    systemMessage: {
      mode: 'customize',
      sections: {
        identity: { action: 'replace', content: PERSONA },
        tone: { action: 'replace', content: 'Be natural, helpful, and conversational. During preference gathering, ask one short question, then wait. Save detailed advice for the actual plan.' },
        tool_instructions: { action: 'replace', content: PREFERENCE_TOOL_INSTRUCTIONS },
        code_change_rules: { action: 'remove' },
        custom_instructions: { action: 'remove' },
        environment_context: { action: 'remove' },
      },
      content: `${PERSONA}\n\n${PREFERENCE_TOOL_INSTRUCTIONS}`,
    },
  };
}

interface PresentationTurn {
  signal: AbortSignal;
  today: number;
  emit: (event: ChatEvent) => void;
  calendarRead?: DemoCalendarData;
  appRead?: DemoAppRead;
  travelOffers?: DemoTravelOffers;
  appAssistance: AppAssistance | null;
  needsCalendarPermission: boolean;
  approved: PreferenceValue | null;
  value?: PreferencePresentation;
  issue?: string;
}

interface Lease {
  session: PlannerSession;
  busy: boolean;
  touched: number;
  presentation: {
    active: PresentationTurn | null; confirmed: PreferenceValue[]; question: PreferenceQuestion | null;
    planType?: PreferencePresentation['planType'];
  };
  calendar: DemoCalendarAccess;
  apps: DemoAppAccess;
}

export class Planner implements PlannerService {
  private readonly sessions = new Map<string, Lease>();
  private creating = 0;
  private readonly cleanup = setInterval(() => {
    for (const [id, lease] of this.sessions) {
      if (!lease.busy && Date.now() - lease.touched > 30 * 60_000) {
        void this.release(id).catch(() => console.error('Failed to close an expired chat session.'));
      }
    }
  }, 60_000).unref();

  private readonly backend: PlannerBackend;

  constructor(backend: PlannerBackend) {
    this.backend = backend;
  }

  async status(): Promise<AIStatus> {
    await this.backend.ready();
    return { ready: true, model: this.backend.model };
  }

  async stream(request: ChatRequest, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<void> {
    await this.backend.ready();
    signal.throwIfAborted();
    let id = request.sessionId;
    let lease = id ? this.sessions.get(id) : undefined;
    if (id && !lease) throw new ChatError(410, 'This chat expired or the server restarted. Start a new chat to continue.');
    if (!lease) {
      if (this.sessions.size + this.creating >= 12) throw new ChatError(429, 'Too many open chats. Close an unused chat and try again.');
      this.creating += 1;
      try {
        const presentation: Lease['presentation'] = { active: null, confirmed: [], question: null };
        const calendar = new DemoCalendarAccess();
        const apps = new DemoAppAccess();
        const session = await this.backend.createSession(incoming => {
          const turn = presentation.active;
          if (!turn || turn.signal.aborted) throw new Error('The preference request is no longer active.');
          if (turn.value) throw new Error('The preference card is already displayed. Wait for the user to answer.');
          const value = preservePreferenceSources(incoming, presentation.confirmed, turn.approved);
          if ((value.planType ?? presentation.planType) === 'trip' && value.question === null && !value.trip) {
            turn.issue = 'A completed trip needs the structured trip object with destination, summary, dates, and itinerary so the user can open booking options. Preserve confirmed choices. Only use planType="other" if the user changed to a non-travel goal.';
            throw new Error(turn.issue);
          }
          if (turn.needsCalendarPermission && (value.question?.kind !== 'dates' || value.question.mode !== 'permission')) {
            turn.issue = 'No on the dates card means the user wants you to choose dates, not skip them. First ask permission using a dates question with mode="permission". Do not advance to budget or other preferences yet.';
            throw new Error(turn.issue);
          }
          if (value.question?.kind === 'dates' && value.question.mode === 'permission' && calendar.consent === null && !turn.needsCalendarPermission) {
            turn.issue = 'First offer the user their own date choice using a dates question with mode="ask". Request demo Calendar permission only after they choose No or Choose for me on that date question.';
            throw new Error(turn.issue);
          }
          if (hasUnconfirmedAnswer(value, presentation.confirmed)) {
            turn.issue = 'The preference you are asking about is not newly confirmed. Remove it from preferences, or retain only its previously confirmed value while editing. Retry the same question without advancing to another preference.';
            throw new Error(turn.issue);
          }
          if (value.question?.kind === 'dates' && value.question.mode === 'permission' && calendar.consent !== null) {
            turn.issue = calendar.consent === 'granted'
              ? 'Demo Calendar access is already allowed. Read it instead of asking again.'
              : 'Demo Calendar access was denied. Do not ask again. Offer manual date selection or flexible dates.';
            throw new Error(turn.issue);
          }
          if (value.question?.kind === 'dates' && value.question.mode === 'proposal') {
            try {
              calendar.validateSelection(value.question.selection, turn.today);
            } catch (error) {
              if (!(error instanceof DemoCalendarAccessError)) throw error;
              turn.issue = error.message;
              throw error;
            }
          }
          try {
            apps.validatePresentation(value, turn.appAssistance, turn.appRead);
          } catch (error) {
            if (!(error instanceof DemoAppAccessError)) throw error;
            turn.issue = error.message;
            throw error;
          }
          try {
            turn.value = value.trip ? { ...value, trip: attachDemoTravelOffers(value.trip, turn.travelOffers) } : value;
          } catch (error) {
            if (!(error instanceof DemoTravelAccessError)) throw error;
            turn.issue = error.message;
            throw error;
          }
          turn.issue = undefined;
        }, () => {
          const turn = presentation.active;
          if (!turn || turn.signal.aborted) throw new Error('The Calendar request is no longer active.');
          if (turn.appAssistance || turn.appRead) throw new DemoCalendarAccessError('Finish the current Bank or Maps suggestion before reading dates.');
          const data = calendar.read(turn.today);
          turn.calendarRead = data;
          turn.emit({ type: 'calendar', calendar: data });
          return data;
        }, (app, kind) => {
          const turn = presentation.active;
          if (!turn || turn.signal.aborted) throw new Error('The demo app request is no longer active.');
          try {
            if (!turn.appAssistance) throw new DemoAppAccessError('First ask the user for this preference. Only read an app after they delegate that specific category, not after they approve a different category.');
            if (turn.calendarRead) throw new DemoAppAccessError('Finish the current Calendar date suggestion before reading another app.');
            if ((turn.appAssistance && (turn.appAssistance.app !== app || turn.appAssistance.kind !== kind))
              || (turn.appRead && (turn.appRead.data.app !== app || turn.appRead.kind !== kind))) {
              throw new DemoAppAccessError('Read only the app and category relevant to the current delegated preference. Finish that suggestion before looking at another category.');
            }
            const read = apps.read(app, kind, turn.today);
            turn.appRead = read;
            turn.emit({ type: 'app', read });
            return read;
          } catch (error) {
            if (!(error instanceof DemoAppAccessError)) throw error;
            turn.issue = error.message;
            throw error;
          }
        }, search => {
          const turn = presentation.active;
          if (!turn || turn.signal.aborted) throw new Error('The demo travel request is no longer active.');
          try {
            if (turn.value) throw new DemoTravelAccessError('The reply is already prepared. Wait for the next user request.');
            if (turn.needsCalendarPermission || turn.appAssistance || turn.calendarRead || turn.appRead) {
              throw new DemoTravelAccessError('Finish the current permission or preference proposal and wait for user approval before fetching final trip offers.');
            }
            const offers = createDemoTravelOffers(search, new Date(turn.today).toISOString().slice(0, 10));
            turn.travelOffers = offers;
            return offers;
          } catch (error) {
            if (!(error instanceof DemoTravelAccessError)) throw error;
            turn.issue = error.message;
            throw error;
          }
        }, reason => {
          const turn = presentation.active;
          if (turn && !turn.signal.aborted && !turn.value) turn.issue = reason;
        });
        id = randomUUID();
        lease = { session, busy: false, touched: Date.now(), presentation, calendar, apps };
        this.sessions.set(id, lease);
        if (signal.aborted) {
          await this.release(id);
          signal.throwIfAborted();
        }
      } finally {
        this.creating -= 1;
      }
    }
    if (!id || !lease) throw new ChatError(500, 'The chat session could not be created.');
    if (lease.busy) throw new ChatError(409, 'This chat is already generating a reply.');
    const today = parseDay(request.localDate);
    if (today === null) throw new ChatError(400, 'The local date is invalid.');
    if (request.calendarConsent) lease.calendar.setConsent(request.calendarConsent);
    if (request.appConsents) lease.apps.setConsents(request.appConsents);
    lease.busy = true;
    lease.touched = Date.now();
    const needsCalendarPermission = lease.calendar.consent === null
      && lease.presentation.question?.kind === 'dates' && lease.presentation.question.mode === 'ask'
      && isPreferenceDelegation(request.message);
    const appAssistance = requestedAppAssistance(lease.presentation.question, request.message);
    const approved = acceptedPreferenceProposal(lease.presentation.question, request.message);
    const presentation: PresentationTurn = { signal, today, emit, needsCalendarPermission, appAssistance, approved };
    lease.presentation.active = presentation;
    const { session } = lease;
    const abort = () => { void session.abort().catch(() => console.error('Failed to stop a model reply.')); };
    signal.addEventListener('abort', abort, { once: true });
    const unsubscribe = session.onDelta(text => {
      if (!signal.aborted && !presentation.appAssistance && !presentation.value?.question && !presentation.value?.trip) emit({ type: 'delta', text });
    });
    const assistancePermission = appAssistance ? lease.apps.consent(appAssistance.app) : null;
    const assistanceInstructions = !appAssistance
      ? 'No Bank or Maps preference is delegated in this turn. Do not request or read Bank/Maps automatically after an approval; continue with the user request or ask the next ordinary preference question. Calendar follows its separate permission flow.'
      : assistancePermission === 'granted'
        ? `${appAssistance.kind} is delegated and demo ${demoAppDetails[appAssistance.app].name} is ALREADY ALLOWED. Next call read_demo_app with app="${appAssistance.app}", preference="${appAssistance.kind}". Do not ask permission again or reuse another category. Then render an unconfirmed ${appAssistance.kind} proposal with app and suggestion.`
        : assistancePermission === 'denied'
          ? `${appAssistance.kind} is delegated but demo ${demoAppDetails[appAssistance.app].name} is DENIED. Do not read or ask again. Offer a general ${appAssistance.kind} proposal without app data and wait for approval.`
          : `${appAssistance.kind} is delegated but demo ${demoAppDetails[appAssistance.app].name} permission is NOT REQUESTED. Render a ${appAssistance.kind} permission question with app="${appAssistance.app}", then stop and wait. Do not read, confirm, or advance.`;
    const calendarInstructions = needsCalendarPermission
      ? 'The current No answer delegates DATE SELECTION. It does NOT deny Calendar permission, which has not been requested. Next call present_preferences with kind="dates", mode="permission", and app omitted or null. Ask to open the demo Calendar and wait. Do not choose dates or advance to budget yet.'
      : '';
    const approvalInstructions = approved
      ? `The user approved the current ${approved.kind} suggestion: ${approved.value}. Record it with source="siri", not "user". This approves only that preference. Ask the next missing preference normally, or supply the structured trip when intake is complete.`
      : '';
    try {
      emit({ type: 'session', sessionId: id });
      const prompt = `User-local date: ${request.localDate}. Time zone: ${request.timeZone}.\nDemo Calendar permission: ${lease.calendar.consent ?? 'not requested'}.\n${demoAppIds.map(app => `Demo ${demoAppDetails[app].name} permission: ${lease.apps.consent(app) ?? 'not requested'}.`).join('\n')}\nAll app data is synthetic; permissions apply only to the named demo app.\n\nUser message:\n${request.message}\n\nApplication interaction context (a No on an ordinary preference question is delegation, not permission denial):\n${calendarInstructions}\n${assistanceInstructions}\n${approvalInstructions}`;
      const result = await sendPreferenceReply(
        (text, timeout) => session.send(text, request.message, timeout),
        prompt,
        () => presentation.value ? undefined : presentation.issue
          ?? (presentation.appAssistance ? `Use present_preferences to complete the current permission question or proposal. ${assistanceInstructions}` : undefined),
        signal,
      );
      signal.throwIfAborted();
      if (presentation.issue && !presentation.value) {
        console.error('Preference card was rejected:', presentation.issue);
        throw new ChatError(502, 'Copilot could not prepare valid preference choices. Your previous choices are unchanged. Try again.');
      }
      if (presentation.calendarRead && !presentation.value) {
        throw new ChatError(502, 'Siri read the demo Calendar but could not prepare a date selection. Please try again or choose dates manually.');
      }
      if (!presentation.value && (presentation.appRead
        || (presentation.appAssistance && lease.apps.consent(presentation.appAssistance.app) !== 'denied'))) {
        throw new ChatError(502, 'Siri could not prepare the app permission or suggestion for review. Your previous choices are unchanged. Try again.');
      }
      const text = presentation.value?.question?.text ?? presentation.value?.trip?.summary ?? result;
      if (!text?.trim()) throw new ChatError(502, 'The model returned no reply. Please try again.');
      if (presentation.value) {
        lease.presentation.confirmed = presentation.value.preferences;
        lease.presentation.planType = presentation.value.planType ?? (presentation.value.trip ? 'trip' : lease.presentation.planType);
      }
      lease.presentation.question = presentation.value?.question ?? null;
      emit({ type: 'done', text, ...(presentation.value ? { presentation: presentation.value } : {}) });
    } catch (error) {
      await session.abort().catch(abortError => {
        console.error('Failed to stop a model reply after an error.', abortError);
      });
      throw error;
    } finally {
      unsubscribe();
      signal.removeEventListener('abort', abort);
      lease.presentation.active = null;
      lease.busy = false;
      lease.touched = Date.now();
    }
  }

  async release(id: string): Promise<void> {
    const lease = this.sessions.get(id);
    if (!lease) return;
    this.sessions.delete(id);
    if (lease.busy) await lease.session.abort();
    await lease.session.disconnect();
  }

  async close(): Promise<void> {
    clearInterval(this.cleanup);
    for (const id of this.sessions.keys()) await this.release(id);
    await this.backend.close();
  }
}

export class CopilotBackend implements PlannerBackend {
  private readonly client = new CopilotClient({
    mode: 'empty',
    useLoggedInUser: true,
    workingDirectory: tmpdir(),
    logLevel: 'error',
    enableRemoteSessions: false,
    sessionFs: { initialCwd: tmpdir(), sessionStatePath: '/state', conventions: 'posix', capabilities: { sqlite: false } },
  });
  readonly model = process.env.COPILOT_CHAT_MODEL || 'gpt-5.4-mini';
  private started: Promise<void> | null = null;

  async ready(): Promise<void> {
    if (!this.started) {
      this.started = this.client.start().then(async () => {
        const auth = await this.client.getAuthStatus();
        if (!auth.isAuthenticated) throw new ChatError(401, 'Sign in with the Copilot CLI, then reconnect the preview.');
        const models = await this.client.listModels();
        if (!models.some(model => model.id === this.model)) {
          throw new ChatError(503, `The configured Copilot model (${this.model}) is unavailable. Update COPILOT_CHAT_MODEL.`);
        }
      }).catch(error => {
        this.started = null;
        throw error;
      });
    }
    await this.started;
  }

  async createSession(
    present: Parameters<typeof plannerSessionConfig>[1], readCalendar: Parameters<typeof plannerSessionConfig>[2],
    readApp: Parameters<typeof plannerSessionConfig>[3], readTravel: Parameters<typeof plannerSessionConfig>[4],
    reportInvalid: (reason: string) => void,
  ): Promise<PlannerSession> {
    const session: CopilotSession = await this.client.createSession(
      plannerSessionConfig(this.model, present, readCalendar, readApp, readTravel, reportInvalid),
    );
    return {
      onDelta: listener => session.on('assistant.message_delta', event => listener(event.data.deltaContent)),
      send: async (prompt, displayPrompt, timeout) => {
        const result = await session.sendAndWait({ prompt, displayPrompt }, timeout);
        return result?.data.content ?? '';
      },
      abort: () => session.abort(),
      disconnect: () => session.disconnect(),
    };
  }

  async close(): Promise<void> {
    const errors = await this.client.stop();
    if (errors.length) throw new AggregateError(errors, 'The Copilot runtime did not stop cleanly.');
  }
}

export class CopilotPlanner extends Planner {
  constructor() {
    super(new CopilotBackend());
  }
}
