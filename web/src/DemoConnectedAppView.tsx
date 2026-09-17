import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icons.tsx';
import { demoAppDetails } from './demo-apps.ts';
import type {
  AppPreferenceKind, DemoAppData, DemoBankData, DemoMapsData, DemoSavedPlace,
} from './demo-apps.ts';
import './demo-connected-app.css';

export interface DemoConnectedAppViewProps {
  data: DemoAppData;
  mode: 'browse' | 'agent';
  purpose: AppPreferenceKind | null;
  busy: boolean;
  activity: 'idle' | 'reading' | 'proposed';
  suggestion?: string;
  proposalText?: string;
  error?: string;
  returnLabel: string;
  onUse: () => void;
  onClose: () => void;
}

type MapCategory = DemoSavedPlace['kind'];

const categories: readonly MapCategory[] = ['activities', 'food', 'lodging'];
const purposeLabels: Record<AppPreferenceKind, string> = {
  budget: 'Budget', activities: 'Activities', food: 'Food', lodging: 'Lodging',
};
const snapshotDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

function PlaceGlyph({ kind }: { kind: MapCategory }) {
  if (kind === 'food') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M19 3c-3 2-4 5-4 9h4m0-9v18" />
  </svg>;
  return <Icon name={kind === 'lodging' ? 'bed' : 'ticket'} />;
}

function BankSnapshot({ data, highlightSources }: { data: DemoBankData; highlightSources: boolean }) {
  const id = useId();
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency });
  const signedMoney = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: data.currency, signDisplay: 'exceptZero',
  });

  return <div className="demo-connected-app__bank-overview">
    <section className="demo-connected-app__balance demo-connected-app__source"
      aria-label="Sample bank balance" data-source-record="balance" data-relevant={highlightSources}>
      <div className="demo-connected-app__balance-heading">
        <span className="demo-connected-app__bank-mark"><Icon name="bank" /></span>
        <span>Sample overview</span>
        <span className="demo-connected-app__currency">{data.currency}</span>
      </div>
      <p className="demo-connected-app__balance-label">Sample balance</p>
      <strong className="demo-connected-app__balance-value">{money.format(data.balance)}</strong>
      <p className="demo-connected-app__balance-date">
        Snapshot: <time dateTime={new Date(data.today).toISOString().slice(0, 10)}>{snapshotDate.format(data.today)}</time>
      </p>
      <div className="demo-connected-app__balance-note">
        <span className="demo-connected-app__demo-stamp">DEMO</span>
        Invented money, not a spendable balance
      </div>
    </section>

    <dl className="demo-connected-app__funds">
      <div className="demo-connected-app__fund demo-connected-app__source"
        data-source-record="reserved" data-relevant={highlightSources}>
        <dt><Icon name="check-list" />Reserved obligations</dt>
        <dd>{money.format(data.reserved)}<span>Sample commitments</span></dd>
      </div>
      <div className="demo-connected-app__fund demo-connected-app__fund--trip demo-connected-app__source"
        data-source-record="travel-fund" data-relevant={highlightSources}>
        <dt><Icon name="plane" />Trip fund</dt>
        <dd>{money.format(data.travelFund)}<span>Sample amount set aside</span></dd>
      </div>
    </dl>
    <p className="demo-connected-app__source-note">
      {highlightSources && <Icon name="sparkles" />}
      {highlightSources ? 'Sample source records for your budget preference.' : 'All figures are synthetic and read only.'}
    </p>

    <section className="demo-connected-app__transactions" aria-labelledby={`${id}-transactions`}>
      <div className="demo-connected-app__section-heading">
        <h2 id={`${id}-transactions`}>Sample transactions</h2>
        <span>{data.transactions.length} entries</span>
      </div>
      <p className="demo-connected-app__section-caption">An invented ledger, not real account activity.</p>
      {data.transactions.length > 0 ? <ul className="demo-connected-app__transaction-list">
        {data.transactions.map(transaction => <li key={transaction.id}
          className="demo-connected-app__transaction demo-connected-app__source"
          data-source-record={transaction.id} data-relevant={highlightSources}>
          <span className={`demo-connected-app__transaction-mark${transaction.amount > 0 ? ' demo-connected-app__transaction-mark--credit' : ''}`}
            aria-hidden="true">{transaction.amount > 0 ? '+' : transaction.amount < 0 ? '-' : '='}</span>
          <div className="demo-connected-app__transaction-description">
            <h3>{transaction.title}</h3>
            <p><time dateTime={new Date(transaction.date).toISOString().slice(0, 10)}>
              {snapshotDate.format(transaction.date)}
            </time><span> / Sample</span></p>
          </div>
          <strong className={`demo-connected-app__transaction-amount${transaction.amount > 0 ? ' demo-connected-app__transaction-amount--credit' : ''}`}>
            {signedMoney.format(transaction.amount)}
          </strong>
        </li>)}
      </ul> : <p className="demo-connected-app__empty">No sample transactions were included in this snapshot.</p>}
    </section>
  </div>;
}

function MapsSnapshot({ data, mode, purpose, highlightSources }: {
  data: DemoMapsData;
  mode: DemoConnectedAppViewProps['mode'];
  purpose: AppPreferenceKind | null;
  highlightSources: boolean;
}) {
  const id = useId();
  const [browseCategory, setBrowseCategory] = useState<MapCategory>(data.places[0]?.kind ?? 'activities');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const placeCards = useRef(new Map<string, HTMLElement>());
  const category = mode === 'agent' ? purpose === 'budget' ? null : purpose : browseCategory;
  const places = category === null ? [] : data.places.filter(place => place.kind === category);
  const categoryLabel = category === null ? 'Saved places' : purposeLabels[category];

  function inspectPlace(place: DemoSavedPlace) {
    setInspectedId(place.id);
    const card = placeCards.current.get(place.id);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }

  return <div className="demo-connected-app__maps-overview">
    <div className="demo-connected-app__map" role="group" aria-label="Illustrative map, not real geography">
      <svg className="demo-connected-app__map-art" viewBox="0 0 360 230" preserveAspectRatio="none" aria-hidden="true">
        <rect width="360" height="230" fill="#152029" />
        <path d="M0 0h115l-8 49-43 24L0 62ZM18 152l64-17 37 50-22 45H0Z" fill="#203a32" />
        <path d="m273 4 87-4v71l-55-8ZM269 155l65-11 26 12v74h-76Z" fill="#213a35" />
        <path d="M233-25c-26 36 18 59 1 88s-46 40-23 77 8 62-23 114" fill="none" stroke="#101b24" strokeWidth="53" />
        <path d="M233-25c-26 36 18 59 1 88s-46 40-23 77 8 62-23 114" fill="none" stroke="#234758" strokeWidth="39" />
        <g fill="#23303a" stroke="#34424c" strokeWidth="1">
          <path d="m25 83 46-9 9 38-46 9Z" /><path d="m87 69 43-9 11 42-43 8Z" />
          <path d="m141 48 41-8 14 49-42 9Z" /><path d="m115 128 54-12 11 40-52 13Z" />
          <path d="m137 184 32-8 8 41-32 7Z" /><path d="m267 85 62 4-2 38-56-4Z" />
          <path d="m293 174 48-8 8 43-50 9Z" />
        </g>
        <g fill="none" stroke="#52606a" strokeWidth="7">
          <path d="M-15 146 197 98l52 7 126 12M76-15l50 260M166-12l45 182M264-10l-4 82m2 65 15 108" />
        </g>
        <g fill="none" stroke="#697680" strokeWidth="2">
          <path d="M-15 146 197 98l52 7 126 12M76-15l50 260M166-12l45 182M264-10l-4 82m2 65 15 108" />
          <path d="m-9 52 204-43M3 212l168-35m95-126 107 17" />
        </g>
      </svg>
      <span className="demo-connected-app__map-label"><Icon name="map" />Illustrative map</span>
      <div className="demo-connected-app__pin-field">
        {places.map((place, index) => <button key={place.id} type="button"
          className="demo-connected-app__pin" data-kind={place.kind} data-place-id={place.id}
          data-relevant={highlightSources} aria-pressed={inspectedId === place.id}
          aria-label={`Show sample place: ${place.name}`} aria-controls={`${id}-place-${index}`}
          style={{ left: `${place.x}%`, top: `${place.y}%` }} onClick={() => inspectPlace(place)}>
          <span className="demo-connected-app__pin-marker"><PlaceGlyph kind={place.kind} /></span>
          <span className="demo-connected-app__pin-number" aria-hidden="true">{index + 1}</span>
        </button>)}
      </div>
      {places.length === 0 && <span className="demo-connected-app__map-empty">No sample pins in this snapshot</span>}
      <span className="demo-connected-app__map-disclaimer">Not real geography</span>
    </div>
    <p className="demo-connected-app__map-caption">Fictional positions only. No location, routes, or live map data.</p>

    {mode === 'browse' && <div className="demo-connected-app__categories" role="group" aria-label="Saved place categories">
      {categories.map(kind => <button key={kind} type="button" className="demo-connected-app__category"
        data-kind={kind} aria-label={purposeLabels[kind]} aria-pressed={category === kind}
        aria-controls={`${id}-places`} onClick={() => { setBrowseCategory(kind); setInspectedId(null); }}>
        <PlaceGlyph kind={kind} />
        <span>{purposeLabels[kind]}</span>
        <span className="demo-connected-app__category-count" aria-hidden="true">
          {data.places.filter(place => place.kind === kind).length}
        </span>
      </button>)}
    </div>}

    <section id={`${id}-places`} className="demo-connected-app__places" aria-labelledby={`${id}-places-heading`}>
      <div className="demo-connected-app__section-heading">
        <h2 id={`${id}-places-heading`}>{category === null ? 'Saved places' : `Saved ${categoryLabel.toLowerCase()}`}</h2>
        <span>{places.length} sample{places.length === 1 ? '' : 's'}</span>
      </div>
      <p className="demo-connected-app__section-caption">
        {mode === 'agent' && category !== null
          ? `Only ${categoryLabel.toLowerCase()} records from this snapshot are shown.`
          : `Fictional names and areas. Snapshot: ${snapshotDate.format(data.today)}.`}
      </p>
      {places.length > 0 ? <div className="demo-connected-app__place-list">
        {places.map((place, index) => <article key={place.id} id={`${id}-place-${index}`}
          className="demo-connected-app__place demo-connected-app__source" data-kind={place.kind}
          data-place-id={place.id} data-source-record={place.id} data-relevant={highlightSources}
          data-inspected={inspectedId === place.id} tabIndex={0} aria-labelledby={`${id}-place-title-${index}`}
          onFocus={() => setInspectedId(place.id)}
          ref={node => { if (node) placeCards.current.set(place.id, node); else placeCards.current.delete(place.id); }}>
          <div className="demo-connected-app__place-heading">
            <span className="demo-connected-app__place-glyph"><PlaceGlyph kind={place.kind} /></span>
            <div>
              <h3 id={`${id}-place-title-${index}`}>{place.name}</h3>
              <p>{place.area} / Fictional</p>
            </div>
            <span className="demo-connected-app__place-index" aria-hidden="true">{index + 1}</span>
          </div>
          <p className="demo-connected-app__place-detail">{place.detail}</p>
          {place.tags.length > 0 && <ul className="demo-connected-app__tags" aria-label={`Tags for ${place.name}`}>
            {place.tags.map((tag, tagIndex) => <li key={`${tagIndex}-${tag}`}>{tag}</li>)}
          </ul>}
          {highlightSources && <span className="demo-connected-app__place-source"><Icon name="sparkles" />Demo source record</span>}
        </article>)}
      </div> : <p className="demo-connected-app__empty">
        {category === null ? 'This request has no matching saved-place category.'
          : `No ${categoryLabel.toLowerCase()} records were included in this demo snapshot.`}
        {' '}No places or recommendations have been added.
      </p>}
    </section>
  </div>;
}

export function DemoConnectedAppView({
  data, mode, purpose, busy, activity, suggestion, proposalText, error, returnLabel, onUse, onClose,
}: DemoConnectedAppViewProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const appName = demoAppDetails[data.app].name;
  const dialogName = data.app === 'bank' ? 'Demo Bank' : 'Demo Maps';
  const hasSuggestion = Boolean(suggestion?.trim());
  const canUse = !busy && hasSuggestion && !error;
  const reading = mode === 'agent' && activity === 'reading' && !error;
  const highlightSources = mode === 'agent' && (activity === 'reading' || activity === 'proposed' || hasSuggestion);
  const relevantPlaceCount = data.app === 'maps' ? data.places.filter(place => place.kind === purpose).length : 0;
  const statusTitle = error ? 'Suggestion unavailable'
    : reading ? data.app === 'bank' ? 'Reading sample balances' : 'Reading sample saved places'
      : hasSuggestion && !busy ? "Review Siri's suggestion" : 'Waiting for Siri';
  const statusDetail = error ? 'The error is shown above. Nothing has been applied.'
    : reading ? data.app === 'bank'
      ? `Sample balance, obligations, trip fund, and ${data.transactions.length} invented transactions.`
      : `${relevantPlaceCount} matching fictional saved place${relevantPlaceCount === 1 ? '' : 's'} in the provided snapshot.`
      : hasSuggestion && !busy ? 'Based on synthetic data only. Review before using it in the chat.'
        : 'Only synthetic app data is available. Siri has not finished a suggestion.';
  const confirmationHint = error ? 'A suggestion cannot be used while an error is shown.'
    : busy ? 'Wait for Siri to finish before using a suggestion.'
      : !hasSuggestion ? 'A suggestion is needed before you can continue.'
        : data.app === 'bank' ? 'Uses a demo preference only. No money can be moved.'
          : 'Uses a demo preference only. No route or booking is created.';

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]',
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
        && element.getClientRects().length > 0);
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (!targets.some(element => element === active)
        || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    if (mode === 'agent' && suggestion?.trim()) {
      contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [mode, suggestion, data.app]);

  return <div ref={dialogRef} className={`demo-connected-app demo-connected-app--${data.app}`}
    data-app={data.app} data-mode={mode} role="dialog" aria-modal="true" aria-label={dialogName}
    aria-describedby={`${id}-disclaimer`} tabIndex={-1}>
    <header className="demo-connected-app__header">
      <div className="demo-connected-app__navigation">
        <button type="button" className="demo-connected-app__back" aria-label={returnLabel} onClick={onClose}>
          <Icon name="chevron-left" /><span>{returnLabel}</span>
        </button>
        <span className="demo-connected-app__read-only">Read only</span>
      </div>
      <div className="demo-connected-app__title">
        <h1>{appName}</h1><span className="demo-connected-app__badge">Demo</span>
      </div>
      <p id={`${id}-disclaimer`} className="demo-connected-app__disclaimer">
        {data.app === 'bank' ? 'Invented money. No real account is connected.' : 'Fictional saved places. No real location access.'}
      </p>
    </header>

    {error && <div className="demo-connected-app__error" role="alert" tabIndex={0}>{error}</div>}

    <div ref={contentRef} className="demo-connected-app__content" role="region"
      aria-label={`${dialogName} content`} tabIndex={0}>
      {mode === 'agent' && <section className="demo-connected-app__activity" data-activity={activity}
        data-reading={reading && busy} aria-label="Siri demo app activity">
        <div className="demo-connected-app__activity-heading" role="status" aria-live="polite" aria-atomic="true">
          <span className="demo-connected-app__activity-icon"><Icon name="sparkles" /></span>
          <div><h2>{statusTitle}</h2><p>{statusDetail}</p></div>
        </div>
        {purpose !== null && <p className="demo-connected-app__request-purpose">{purposeLabels[purpose]} preference / Demo only</p>}
        {(hasSuggestion || proposalText) && <div className="demo-connected-app__proposal" tabIndex={0}
          role="region" aria-label="Siri's demo proposal">
          {hasSuggestion && <>
            <span className="demo-connected-app__eyebrow">
              {busy ? 'Draft demo suggestion' : purpose !== null ? `${purposeLabels[purpose]} suggestion` : 'Demo suggestion'}
            </span>
            <strong className="demo-connected-app__suggestion">{suggestion}</strong>
          </>}
          {proposalText && <p className="demo-connected-app__explanation">{proposalText}</p>}
        </div>}
      </section>}

      {data.app === 'bank'
        ? <BankSnapshot data={data} highlightSources={highlightSources && purpose === 'budget'} />
        : <MapsSnapshot data={data} mode={mode} purpose={purpose} highlightSources={highlightSources} />}
    </div>

    {mode === 'agent' && <footer className="demo-connected-app__footer">
      <p id={`${id}-confirmation-hint`}>{confirmationHint}</p>
      <button type="button" className="demo-connected-app__use" aria-label="Use suggestion"
        aria-describedby={`${id}-confirmation-hint`} disabled={!canUse}
        onClick={() => { if (canUse) onUse(); }}>Use suggestion</button>
    </footer>}
  </div>;
}
