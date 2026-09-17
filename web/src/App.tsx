import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, Ref, RefObject } from 'react';
import Markdown from 'react-markdown';
import { chatReducer, createChat } from './chat';
import type { Message } from './chat';
import { getAIStatus, releaseChat, streamChat } from './chat-client';
import { MAX_MESSAGE_LENGTH } from './chat-protocol';
import type { AIStatus } from './chat-protocol';
import { currentDay, formatRange, parseDateSelection } from './dates';
import type { DateRange } from './dates';
import { createDemoCalendar } from './demo-calendar';
import type { CalendarConsent, DemoCalendarData } from './demo-calendar';
import { appForPreference, createDemoAppData, demoAppDetails, demoAppIds, isAppPreferenceKind, isPreferenceDelegation } from './demo-apps';
import type { AppPreferenceKind, DemoAppConsent, DemoAppData, DemoAppId } from './demo-apps';
import { preferenceChoices, preferenceInputPlaceholder, preferenceKey, preferenceSummary } from './preferences';
import type { PreferenceAction, PreferenceQuestion } from './preferences';
import { DatePicker } from './DatePicker';
import { DemoCalendarView } from './DemoCalendarView';
import { DemoConnectedAppView } from './DemoConnectedAppView';
import { Icon, SiriOrb, StatusBar } from './Icons';
import { Modal } from './Modal';
import { screenNames, screens } from './navigation';
import type { Screen } from './navigation';
import { SwipePager } from './SwipePager';
import { HomeScreen, TodayScreen } from './SystemScreens';
import { TripPlanCard, TripPlanView } from './TripPlanView';
import type { TripPlanData, TripPlanSection } from './trip-plan';

const DEVICE_WIDTH = 426;
const DEVICE_HEIGHT = 898;

interface CalendarAppState {
  mode: 'browse' | 'select' | 'agent';
  origin: Screen;
  calendar: DemoCalendarData;
  initialRange: DateRange | null;
  suggestedRange: DateRange | null;
  activity: 'idle' | 'reading' | 'proposed';
  proposalText?: string;
  requestId: number | null;
}

interface ConnectedAppState {
  mode: 'browse' | 'agent';
  origin: Screen;
  data: DemoAppData;
  purpose: AppPreferenceKind | null;
  activity: 'idle' | 'reading' | 'proposed';
  suggestion?: string;
  proposalText?: string;
  requestId: number | null;
}

function usePhoneScale(embedded: boolean, footer: RefObject<HTMLElement | null>) {
  const calculate = () => {
    const width = document.documentElement.clientWidth;
    const byWidth = (width - (embedded ? 24 : width < 600 ? 20 : 64)) / DEVICE_WIDTH;
    const footerHeight = footer.current?.getBoundingClientRect().height ?? 164;
    // Embedded layout has 24px vertical padding and a 12px phone/footer gap.
    const byHeight = embedded ? (window.innerHeight - footerHeight - 36) / DEVICE_HEIGHT
      : width < 600 ? 1 : (window.innerHeight - (width >= 900 ? 48 : 264)) / DEVICE_HEIGHT;
    return Math.max(0.4, Math.min(1, byWidth, byHeight));
  };
  const [scale, setScale] = useState(calculate);
  useLayoutEffect(() => {
    const resize = () => setScale(calculate());
    const observer = embedded ? new ResizeObserver(resize) : null;
    if (footer.current) observer?.observe(footer.current);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [embedded, footer]);
  return scale;
}

function PreferenceInput({ label, placeholder, inputRef, onSubmit }: {
  label: string; placeholder: string; inputRef: Ref<HTMLInputElement>;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  return <form className="preference-entry" aria-label={`Answer ${label.toLowerCase()}`} data-swipe-ignore
    onSubmit={event => { event.preventDefault(); onSubmit(value); }}>
    <input ref={inputRef} type="text" aria-label={`${label} preference`} placeholder={placeholder}
      value={value} maxLength={MAX_MESSAGE_LENGTH} required autoComplete="off" enterKeyHint="send"
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
      }} />
    <button className="preference-send" type="submit" aria-label={`Send ${label.toLowerCase()} preference`}
      disabled={!value.trim()}><Icon name="send" /></button>
  </form>;
}

function ChatMessage({ message, active, busy, onChoice, onReply, onOpenPlan, preferenceInputRef }: {
  message: Message; active: boolean;
  busy: boolean;
  onChoice: (question: PreferenceQuestion, action: Exclude<PreferenceAction, 'type'>) => void;
  onReply: (text: string) => void; preferenceInputRef: Ref<HTMLInputElement>;
  onOpenPlan: (plan: TripPlanData, section: TripPlanSection) => void;
}) {
  const { question, trip } = message;
  if (message.kind === 'incoming' && !message.text) {
    return <div className="message message--typing" role="status" aria-label="Siri is thinking">
      <div className="bubble typing-dots" aria-hidden="true"><i /><i /><i /></div>
    </div>;
  }
  return <article className={`message message--${message.kind}${trip ? ' message--plan' : ''}`} aria-label={message.kind === 'outgoing' ? 'You' : 'Siri'}>
    {message.confirmations?.map(preference => <div className="message--fact" key={preferenceKey(preference)}>
      <div className="bubble"><p>{preferenceSummary(preference)}</p></div>
    </div>)}
    <div className={`bubble${message.question ? ' preference-bubble' : ''}`}>
      {question && <span className="preference-category">{question.label}</span>}
      {trip && <span className="preference-category">Suggested trip</span>}
      {question?.mode === 'proposal' && <span className="preference-source">
        {question.app ? `Based on demo ${demoAppDetails[question.app].name}`
          : question.kind === 'dates' ? 'Based on demo Calendar'
          : question.kind === 'budget' ? 'General estimate' : 'General suggestion'}
      </span>}
      {question?.mode === 'proposal' && question.suggestion && <strong className="preference-suggestion">{question.suggestion}</strong>}
      {message.kind === 'outgoing' || message.question ? <p>{message.text}</p> : <div className="message-markdown">
        <Markdown skipHtml disallowedElements={['img']} components={{
          a: ({ href, children }) => href && /^https?:\/\//i.test(href)
            ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
          pre: ({ children }) => <pre data-swipe-ignore>{children}</pre>,
        }}>{message.text}</Markdown>
      </div>}
      {question && active && <div className="reply-options" role="group"
        aria-label={`${question.label} choices`} data-preference-kind={question.kind}>
        {preferenceChoices(question).map(({ action, label }) => action === 'type'
          ? <PreferenceInput key={action} label={question.label} placeholder={preferenceInputPlaceholder(question)}
            inputRef={preferenceInputRef} onSubmit={onReply} />
          : <button key={action} type="button"
            title={action === 'delegate' ? `Let Siri choose ${question.label.toLowerCase()}` : undefined}
            onClick={() => onChoice(question, action)}>{label}</button>)}
      </div>}
      {message.interrupted && <span className="message-interrupted">Reply interrupted</span>}
    </div>
    {trip && <TripPlanCard plan={trip} disabled={busy || !!message.interrupted}
      onOpen={section => onOpenPlan(trip, section)} />}
    {trip && <p className="plan-disclaimer">Offers and prices are demo data. Book opens a demo checkout; nothing is reserved.</p>}
  </article>;
}

function VoicePreview({ onClose }: { onClose: () => void }) {
  return <section className="voice-preview" aria-label="Voice preview">
    <p>Voice is not connected</p>
    <SiriOrb />
    <div className="voice-controls">
      <button className="round-button" type="button" aria-label="Use keyboard" onClick={onClose}><Icon name="keyboard" /></button>
      <button className="voice-sample" type="button" aria-label="Microphone not connected" disabled><Icon name="microphone" /></button>
      <button className="round-button" type="button" aria-label="Close voice preview" onClick={onClose}><Icon name="close" /></button>
    </div>
    <span className="voice-disclaimer">Use the keyboard to send your own request. Nothing is recorded.</span>
  </section>;
}

export default function App() {
  const [embedded] = useState(() => window.parent !== window && new URLSearchParams(window.location.search).get('embed') === '1');
  const [state, dispatch] = useReducer(chatReducer, undefined, createChat);
  const [draft, setDraft] = useState('');
  const [dates, setDates] = useState<DateRange | null>(null);
  const [dialog, setDialog] = useState<'actions' | 'attachment-dates' | 'calendar-permission' | 'app-permission' | 'app-settings' | 'trip' | null>(null);
  const [planView, setPlanView] = useState<{ plan: TripPlanData; section: TripPlanSection } | null>(null);
  const [calendarApp, setCalendarApp] = useState<CalendarAppState | null>(null);
  const [connectedApp, setConnectedApp] = useState<ConnectedAppState | null>(null);
  const [appPermission, setAppPermission] = useState<{ app: DemoAppId; kind: AppPreferenceKind } | null>(null);
  const [voice, setVoice] = useState(false);
  const [connection, setConnection] = useState<AIStatus | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [screen, setScreen] = useState<Screen>(() => {
    const requested = new URLSearchParams(window.location.search).get('screen');
    return requested === 'siri' || requested === 'today' ? requested : 'home';
  });
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const preferenceInputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const screenRef = useRef(screen);
  const calendarAppRef = useRef(calendarApp);
  const connectedAppRef = useRef(connectedApp);
  const appReturnFocus = useRef<HTMLElement | null>(null);
  const appWasOpen = useRef(false);
  const permissionPrompted = useRef<number | null>(null);
  const restoreInputFocus = useRef(false);
  const followResponse = useRef(true);
  const footerRef = useRef<HTMLElement>(null);
  const scale = usePhoneScale(embedded, footerRef);
  const request = state.pending;
  const busy = request !== null;
  const modalOpen = screen === 'siri' && dialog !== null;
  const hasOpenApp = calendarApp !== null || connectedApp !== null;
  screenRef.current = screen;
  calendarAppRef.current = calendarApp;
  connectedAppRef.current = connectedApp;

  useLayoutEffect(() => {
    if (!embedded) return;
    const origin = document.referrer ? new URL(document.referrer).origin : 'null';
    // Hidden frames can defer passive effects, so notify the parent before paint.
    window.parent.postMessage({ type: 'siri-prototype:ready' }, origin === 'null' ? '*' : origin);
  }, [embedded]);

  const prepareAppFocus = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
      appReturnFocus.current = focused;
      focused.blur();
    }
  }, []);

  const changeScreen = useCallback((destination: Screen) => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('.swipe-page')) {
      focused.closest<HTMLElement>('.screen-pager')?.focus({ preventScroll: true });
    }
    restoreInputFocus.current = false;
    setScreen(destination);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setConnection(null);
    setConnectionError('');
    void getAIStatus(controller.signal).then(status => {
      if (!controller.signal.aborted) setConnection(status);
    }).catch(error => {
      if (!controller.signal.aborted) setConnectionError(error instanceof Error ? error.message : 'The AI connection failed.');
    });
    return () => controller.abort();
  }, [connectionAttempt]);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    void streamChat({
      message: request.text, sessionId: request.sessionId,
      localDate: new Date(currentDay()).toISOString().slice(0, 10),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(request.calendarConsent ? { calendarConsent: request.calendarConsent } : {}),
      ...(request.appConsents ? { appConsents: request.appConsents } : {}),
    }, event => {
      if (controller.signal.aborted) return;
      if (event.type === 'session') dispatch({ type: 'session', requestId: request.id, sessionId: event.sessionId });
      if (event.type === 'delta') dispatch({ type: 'delta', requestId: request.id, text: event.text });
      if (event.type === 'calendar') {
        if (request.calendarConsent !== 'granted') throw new Error('Demo Calendar access has not been allowed.');
        dispatch({ type: 'calendar', requestId: request.id, calendar: event.calendar });
        if (connectedAppRef.current) return;
        if (!calendarAppRef.current && screenRef.current === 'siri') prepareAppFocus();
        setCalendarApp(current => {
          if (current?.mode === 'browse' || current?.mode === 'select') return current;
          if (!current && screenRef.current !== 'siri') return null;
          return {
            mode: 'agent', origin: 'siri', calendar: event.calendar, initialRange: null,
            suggestedRange: null, activity: 'reading', requestId: request.id,
          };
        });
      }
      if (event.type === 'app') {
        const { data, kind } = event.read;
        if (request.appConsents?.[data.app] !== 'granted') throw new Error(`Demo ${demoAppDetails[data.app].name} access has not been allowed.`);
        dispatch({ type: 'app', requestId: request.id, read: event.read });
        if (calendarAppRef.current || connectedAppRef.current?.mode === 'browse') return;
        if (!connectedAppRef.current && screenRef.current === 'siri') prepareAppFocus();
        setConnectedApp(current => {
          if (current?.mode === 'browse' || (!current && screenRef.current !== 'siri')) return current;
          return { mode: 'agent', origin: 'siri', data, purpose: kind, activity: 'reading', requestId: request.id };
        });
      }
      if (event.type === 'done') {
        dispatch({ type: 'finish', requestId: request.id, text: event.text, presentation: event.presentation });
        const question = event.presentation?.question;
        const selection = question?.kind === 'dates' && question.mode === 'proposal' ? parseDateSelection(question.selection) : null;
        setCalendarApp(current => {
          if (current?.mode !== 'agent' || current.requestId !== request.id) return current;
          return selection ? { ...current, suggestedRange: selection, activity: 'proposed', proposalText: question?.text } : null;
        });
        setConnectedApp(current => {
          if (current?.mode !== 'agent' || current.requestId !== request.id) return current;
          return question?.mode === 'proposal' && question.app === current.data.app && question.suggestion
            ? { ...current, activity: 'proposed', suggestion: question.suggestion, proposalText: question.text } : null;
        });
      }
    }, controller.signal).catch(error => {
      if (!controller.signal.aborted) {
        dispatch({
          type: 'error', requestId: request.id,
          message: error instanceof Error ? error.message : 'Copilot could not complete this reply.',
        });
        setDraft(value => value || request.text);
      }
    });
    return () => {
      controller.abort();
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, [request, prepareAppFocus]);

  useEffect(() => {
    const last = state.messages.at(-1);
    if (!busy && !hasOpenApp && screen === 'siri' && last?.question?.mode === 'permission'
      && !last.interrupted && permissionPrompted.current !== last.id) {
      permissionPrompted.current = last.id;
      if (last.question.kind === 'dates') setDialog('calendar-permission');
      else if (last.question.app && isAppPreferenceKind(last.question.kind)) {
        setAppPermission({ app: last.question.app, kind: last.question.kind });
        setDialog('app-permission');
      }
    }
  }, [busy, hasOpenApp, screen, state.messages]);

  useEffect(() => {
    if (!hasOpenApp && appWasOpen.current) {
      const previous = appReturnFocus.current;
      const fallback = screen === 'siri' ? preferenceInputRef.current ?? inputRef.current : document.querySelector<HTMLElement>('.screen-pager');
      const focusNextReply = restoreInputFocus.current;
      (previous?.isConnected && !previous.closest('[inert]') ? previous : fallback)?.focus({ preventScroll: true });
      restoreInputFocus.current = focusNextReply;
    }
    appWasOpen.current = hasOpenApp;
  }, [hasOpenApp, screen]);

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (element) {
      element.style.height = '24px';
      element.style.height = `${Math.min(96, element.scrollHeight)}px`;
    }
  }, [draft, voice]);

  useLayoutEffect(() => {
    if (followResponse.current) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'instant' });
  }, [state.messages, voice, dates]);

  useEffect(() => {
    if (!busy && !modalOpen && !hasOpenApp && !voice && screen === 'siri'
      && state.messages.at(-1)?.question?.mode !== 'permission' && restoreInputFocus.current) {
      (preferenceInputRef.current ?? inputRef.current)?.focus({ preventScroll: true });
      restoreInputFocus.current = false;
    }
  }, [busy, modalOpen, hasOpenApp, voice, screen, state.messages]);

  const newChat = () => {
    const id = state.sessionId;
    activeRequest.current?.abort();
    dispatch({ type: 'reset' });
    setDraft('');
    setDates(null);
    setDialog(null);
    setCalendarApp(null);
    setConnectedApp(null);
    setAppPermission(null);
    setPlanView(null);
    permissionPrompted.current = null;
    setVoice(false);
    changeScreen('siri');
    followResponse.current = true;
    if (id) void releaseChat(id).catch(error => console.error('Could not release the previous chat session.', error));
  };

  const sendMessage = (text: string, permissions: { calendarConsent?: CalendarConsent; appConsent?: DemoAppConsent } = {}): boolean => {
    if (busy) {
      dispatch({ type: 'notice', message: 'Wait for the reply, or stop it before sending another message.' });
      return false;
    }
    if (!connection?.ready) {
      dispatch({ type: 'notice', message: connectionError || 'Copilot is connecting. Try again in a moment.' });
      return false;
    }
    dispatch({ type: 'submit', text, ...permissions });
    if (text.trim() && text.length <= MAX_MESSAGE_LENGTH) {
      followResponse.current = true;
      restoreInputFocus.current = true;
      const question = state.messages.at(-1)?.question;
      if (question && isPreferenceDelegation(text)) {
        if (question.kind === 'dates' && (question.mode === 'ask' || question.mode === 'proposal') && state.calendarConsent === 'granted') {
          openCalendar('agent', 'siri');
        } else if (isAppPreferenceKind(question.kind) && (question.mode === 'ask' || (question.mode === 'proposal' && question.app))) {
          const app = appForPreference(question.kind);
          if (app && state.appConsents[app] === 'granted') openConnectedApp('agent', app, question.kind, 'siri');
        }
      }
      return true;
    }
    return false;
  };

  const openCalendar = (mode: CalendarAppState['mode'], origin: Screen = screen) => {
    prepareAppFocus();
    setConnectedApp(null);
    setCalendarApp({
      mode, origin, calendar: mode === 'agent' && state.calendar ? state.calendar : createDemoCalendar(currentDay()),
      initialRange: mode === 'select' ? dates : null, suggestedRange: null, activity: 'idle',
      requestId: mode === 'agent' ? state.version + 1 : null,
    });
    setVoice(false);
  };

  const openConnectedApp = (mode: ConnectedAppState['mode'], app: DemoAppId, purpose: AppPreferenceKind | null, origin: Screen = screen) => {
    prepareAppFocus();
    setCalendarApp(null);
    setConnectedApp({
      mode, origin, data: createDemoAppData(app, currentDay()), purpose, activity: 'idle',
      requestId: mode === 'agent' ? state.version + 1 : null,
    });
    setVoice(false);
  };

  const closeConnectedApp = () => {
    if (connectedApp?.mode === 'agent' && request?.id === connectedApp.requestId) {
      activeRequest.current?.abort();
      dispatch({ type: 'stop' });
    }
    setConnectedApp(null);
  };

  const closeCalendar = () => {
    if (calendarApp?.mode === 'agent' && request?.id === calendarApp.requestId) {
      activeRequest.current?.abort();
      dispatch({ type: 'stop' });
    }
    setCalendarApp(null);
  };

  const decideCalendarPermission = (decision: CalendarConsent) => {
    const text = decision === 'granted'
      ? 'Allow demo Calendar access. Please open it and choose dates using its sample events.'
      : 'Do not allow demo Calendar access.';
    if (sendMessage(text, { calendarConsent: decision })) {
      setDialog(null);
      if (decision === 'granted') openCalendar('agent', 'siri');
    }
  };

  const decideAppPermission = (permission: { app: DemoAppId; kind: AppPreferenceKind }, decision: CalendarConsent) => {
    const name = demoAppDetails[permission.app].name;
    const text = decision === 'granted'
      ? `Allow demo ${name} access. Please read its sample data and suggest ${permission.kind} for my review.`
      : `Do not allow demo ${name} access. Offer a general ${permission.kind} suggestion without app data instead.`;
    if (sendMessage(text, { appConsent: { app: permission.app, consent: decision } })) {
      setDialog(null);
      setAppPermission(null);
      if (decision === 'granted') openConnectedApp('agent', permission.app, permission.kind, 'siri');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = [draft.trim(), dates ? `Dates: ${formatRange(dates)}` : ''].filter(Boolean).join('\n\n');
    if (sendMessage(text)) {
      setDraft('');
      setDates(null);
    }
  };

  const replyWithPreference = (text: string) => {
    setVoice(false);
    sendMessage(text);
  };

  const openPlan = (plan: TripPlanData, section: TripPlanSection) => {
    setPlanView({ plan, section });
    setDialog('trip');
    setVoice(false);
  };

  const choosePreference = (question: PreferenceQuestion, action: Exclude<PreferenceAction, 'type'>) => {
    setVoice(false);
    if (action === 'calendar') {
      openCalendar('select', 'siri');
    } else if (action === 'allow-calendar' || action === 'deny-calendar') {
      decideCalendarPermission(action === 'allow-calendar' ? 'granted' : 'denied');
    } else if (action === 'allow-app' || action === 'deny-app') {
      if (question.app && isAppPreferenceKind(question.kind)) {
        decideAppPermission({ app: question.app, kind: question.kind }, action === 'allow-app' ? 'granted' : 'denied');
      }
    } else {
      const selection = question.kind === 'dates' && action === 'accept' ? parseDateSelection(question.selection) : null;
      sendMessage(selection ? `Dates: ${formatRange(selection)}` : action === 'accept'
        ? question.suggestion ? `Use ${question.kind}: ${question.suggestion}` : 'Yes'
        : action === 'delegate' && (question.kind === 'budget' || question.kind === 'other') ? 'Choose for me' : 'No');
    }
  };

  const siriPage = <>
    <div className="screen-backdrop" aria-hidden="true" />
    <div className="screen-content">
      <header className="siri-navbar">
        <SiriOrb />
        <div className="siri-title"><h1>Siri</h1><p>
          {busy ? 'Thinking...' : connection?.ready ? 'Copilot connected' : connectionError ? 'Not connected' : 'Connecting to Copilot'}
        </p></div>
        <button type="button" className={`voice-toggle${voice ? ' active' : ''}`}
          aria-label="Toggle voice preview" aria-pressed={voice} disabled={busy} onClick={() => setVoice(current => !current)}>
          <Icon name="waveform" />
        </button>
      </header>
      <div className="conversation-scroll" ref={messagesRef} role="log" aria-label="Conversation"
        aria-live="polite" aria-relevant="additions" aria-busy={busy} tabIndex={0}
        onScroll={event => {
          const element = event.currentTarget;
          followResponse.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}>
        <div className="message-list">{state.messages.map(message => <ChatMessage key={message.id} message={message}
          active={!busy && !message.interrupted && message.id === state.messages.at(-1)?.id} busy={busy}
          onChoice={choosePreference} onReply={replyWithPreference} onOpenPlan={openPlan} preferenceInputRef={preferenceInputRef} />)}</div>
      </div>
      {connectionError && <div className="connection-error" role="alert">
        <p>{connectionError}</p>
        <button type="button" onClick={() => setConnectionAttempt(value => value + 1)}>Reconnect AI</button>
      </div>}
      {state.notice && !modalOpen && <p className="screen-notice" role="status">{state.notice}</p>}
      {dates && !voice && <div className="composer-dates" role="group" aria-label="Attached dates, not yet sent">
        <Icon name="calendar" /><span>{formatRange(dates, true)}</span>
        <button type="button" aria-label="Remove attached dates" onClick={() => setDates(null)}><Icon name="close" /></button>
      </div>}
      {voice ? <VoicePreview onClose={() => { setVoice(false); restoreInputFocus.current = true; }} />
        : <form className="composer" onSubmit={submit} aria-label="Send a message">
          <button type="button" className="composer-plus" aria-label="Conversation actions" aria-haspopup="dialog"
            disabled={busy} onClick={() => setDialog('actions')}><Icon name="plus" /></button>
          <div className="composer-capsule">
            <textarea ref={inputRef} rows={1} aria-label="Message Siri" placeholder="Ask Siri" value={draft}
              maxLength={MAX_MESSAGE_LENGTH} autoComplete="off" enterKeyHint="send"
              onFocus={() => { restoreInputFocus.current = false; }}
              onChange={event => {
                restoreInputFocus.current = false;
                setDraft(event.target.value);
                if (state.notice) dispatch({ type: 'dismiss-notice' });
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
              }} />
            {busy ? <button className="send-button stop-button" type="button" aria-label="Stop reply"
              onClick={() => { activeRequest.current?.abort(); dispatch({ type: 'stop' }); }}><Icon name="stop" /></button>
              : draft.trim() || dates ? <button className="send-button" type="submit" aria-label="Send message" disabled={!connection?.ready}>
                <Icon name="send" />
              </button> : <button className="composer-mic" type="button" aria-label="Open voice preview" onClick={() => setVoice(true)}>
                <Icon name="microphone" />
              </button>}
          </div>
        </form>}
      <div className="home-indicator-area" aria-hidden="true" />
    </div>
    {screen === 'siri' && dialog === 'attachment-dates' && <DatePicker
      initial={dates} onClose={() => setDialog(null)}
      onConfirm={range => {
        setDates(range);
        setDialog(null);
        restoreInputFocus.current = true;
      }} />}
    {screen === 'siri' && dialog === 'trip' && planView && <TripPlanView
      plan={planView.plan} section={planView.section}
      onSectionChange={section => setPlanView(current => current ? { ...current, section } : current)}
      onClose={() => setDialog(null)} />}
    {screen === 'siri' && dialog === 'calendar-permission' && <Modal
      title="Allow demo Calendar access?" className="calendar-permission-panel" showClose={false}
      onClose={() => decideCalendarPermission('denied')}>
      <div className="calendar-permission-icon" aria-hidden="true"><Icon name="calendar" /></div>
      <p className="calendar-permission-copy">Siri will open the demo Calendar, read its sample events, and highlight dates for your review. Your personal calendars are not connected.</p>
      <div className="calendar-permission-actions">
        <button type="button" onClick={() => decideCalendarPermission('denied')}>Don't Allow</button>
        <button type="button" onClick={() => decideCalendarPermission('granted')}>Allow</button>
      </div>
    </Modal>}
    {screen === 'siri' && dialog === 'app-permission' && appPermission && <Modal
      title={`Allow demo ${demoAppDetails[appPermission.app].name} access?`} className="calendar-permission-panel" showClose={false}
      onClose={() => decideAppPermission(appPermission, 'denied')}>
      <div className="calendar-permission-icon" aria-hidden="true"><Icon name={appPermission.app === 'bank' ? 'bank' : 'map'} /></div>
      <p className="calendar-permission-copy">{demoAppDetails[appPermission.app].permission}</p>
      <div className="calendar-permission-actions">
        <button type="button" onClick={() => decideAppPermission(appPermission, 'denied')}>Don't Allow</button>
        <button type="button" onClick={() => decideAppPermission(appPermission, 'granted')}>Allow</button>
      </div>
    </Modal>}
    {screen === 'siri' && dialog === 'app-settings' && <Modal title="Demo app permissions" className="actions-panel" onClose={() => setDialog(null)}>
      {demoAppIds.map(app => <div className="app-permission-setting" key={app}>
        <div><strong>{demoAppDetails[app].name}</strong><span>{state.appConsents[app] === 'granted' ? 'Allowed for this chat' : state.appConsents[app] === 'denied' ? 'Access denied' : 'Not requested'}</span></div>
        <button type="button" aria-label={`${state.appConsents[app] === 'granted' ? 'Revoke' : 'Allow'} demo ${demoAppDetails[app].name} access`}
          onClick={() => dispatch({ type: 'app-consent', decision: { app, consent: state.appConsents[app] === 'granted' ? 'denied' : 'granted' } })}>
          {state.appConsents[app] === 'granted' ? 'Revoke' : 'Allow'}
        </button>
      </div>)}
      <p className="panel-note">Demo Bank contains sample balances and transactions. Demo Maps contains fictional saved places. Access is read-only and resets with New chat. Changing permission alone does not read an app.</p>
    </Modal>}
    {screen === 'siri' && dialog === 'actions' && <Modal title="Conversation" onClose={() => setDialog(null)} className="actions-panel">
      <button className="action-row" type="button" onClick={() => setDialog('attachment-dates')}><Icon name="calendar" /><span>Add dates</span></button>
      <button className="action-row" type="button" onClick={() => setDialog('calendar-permission')}><Icon name="calendar" /><span>Demo Calendar permission</span></button>
      <button className="action-row" type="button" onClick={() => setDialog('app-settings')}><Icon name="bank" /><span>Demo app permissions</span></button>
      <button className="action-row" type="button" onClick={newChat}><Icon name="restart" /><span>New chat</span></button>
      <p className="panel-note">Type your own preferences or let Siri choose. Copilot generates the replies.</p>
    </Modal>}
  </>;

  const stageStyle: CSSProperties & { '--device-scale': number } = {
    width: DEVICE_WIDTH * scale, height: DEVICE_HEIGHT * scale, '--device-scale': scale,
  };
  return <main className={`preview-page${embedded ? ' preview-page--embedded' : ''}`}>
    <header className="preview-topbar">
      <a className="preview-wordmark" href="./"><SiriOrb /><span>Siri</span></a>
      <span className="preview-badge"><i /> Live AI concept</span>
    </header>
    <div className="device-stage" style={stageStyle}>
      <div className="device">
        <i className="device-button device-button--left" aria-hidden="true" />
        <i className="device-button device-button--right" aria-hidden="true" />
        <section className="phone-screen" aria-label="Interactive iPhone preview">
          <div className="phone-system-chrome" aria-hidden="true">
            <StatusBar /><div className="dynamic-island"><i /></div>
            <div className="home-indicator-area global-home-indicator"><i /></div>
          </div>
          <div className="phone-pages" inert={hasOpenApp} aria-hidden={hasOpenApp ? true : undefined}>
            <SwipePager active={screen} onChange={changeScreen} disabled={modalOpen || hasOpenApp} pages={{
              siri: siriPage,
              today: <TodayScreen onOpenCalendar={() => openCalendar('browse', 'today')} />,
              home: <HomeScreen onOpenSiri={() => changeScreen('siri')} onOpenCalendar={() => openCalendar('browse', 'home')}
                onOpenApp={app => openConnectedApp('browse', app, null, 'home')} />,
            }} />
          </div>
          {calendarApp && <DemoCalendarView calendar={calendarApp.calendar} mode={calendarApp.mode}
            initialRange={calendarApp.initialRange} suggestedRange={calendarApp.suggestedRange}
            busy={calendarApp.mode === 'agent' && busy && request?.id === calendarApp.requestId}
            activity={calendarApp.activity} proposalText={calendarApp.proposalText}
            error={calendarApp.mode === 'agent' ? state.notice : undefined}
            returnLabel={`Back to ${screenNames[calendarApp.origin]}`} onClose={closeCalendar}
            onUse={range => {
              if (sendMessage(`Dates: ${formatRange(range)}`)) {
                setDates(null);
                setCalendarApp(null);
                changeScreen('siri');
              }
            }} />}
          {connectedApp && <DemoConnectedAppView data={connectedApp.data} mode={connectedApp.mode} purpose={connectedApp.purpose}
            busy={connectedApp.mode === 'agent' && busy && request?.id === connectedApp.requestId}
            activity={connectedApp.activity} suggestion={connectedApp.suggestion} proposalText={connectedApp.proposalText}
            error={connectedApp.mode === 'agent' ? state.notice : undefined}
            returnLabel={`Back to ${screenNames[connectedApp.origin]}`} onClose={closeConnectedApp}
            onUse={() => {
              if (connectedApp.purpose && connectedApp.suggestion && sendMessage(`Use ${connectedApp.purpose}: ${connectedApp.suggestion}`)) {
                setConnectedApp(null);
                changeScreen('siri');
              }
            }} />}
        </section>
      </div>
    </div>
    <footer className="preview-footer" ref={footerRef}>
      <nav className="preview-navigation" aria-label="Preview screens">
        {screens.map(destination => <button key={destination} type="button" aria-label={`Go to ${screenNames[destination]} screen`}
          aria-current={screen === destination ? 'page' : undefined} disabled={modalOpen || hasOpenApp}
          onClick={() => changeScreen(destination)}>{screenNames[destination]}</button>)}
      </nav>
      <p className="swipe-hint" role="status" aria-label="Current screen">
        {calendarApp ? `Demo Calendar is open. Return to ${screenNames[calendarApp.origin]} using Back.`
          : connectedApp ? `Demo ${demoAppDetails[connectedApp.data.app].name} is open. Return to ${screenNames[connectedApp.origin]} using Back.`
          : screen === 'home' ? 'Home. Swipe right for Today.' : screen === 'today'
          ? 'Today. Swipe right for Siri; left for Home.' : 'Siri. Swipe left to return to Today.'}
      </p>
      <div className="preview-actions"><button type="button" onClick={newChat}><Icon name="restart" /> New chat</button></div>
      <p>{embedded ? 'Demo app data. No real bookings.'
        : connection?.ready ? `Copilot / ${connection.model}. Uses your Copilot allowance.` : 'Connecting through your Copilot login.'}</p>
      <span className="concept-note">Independent concept, not Apple Siri.</span>
    </footer>
  </main>;
}
