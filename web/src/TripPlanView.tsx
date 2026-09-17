import { Icon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { formatRange, parseDateSelection, parseDay } from './dates.ts';
import { demoCheckoutUrl, formatDemoMoney } from './demo-travel.ts';
import type { DemoFlightOffer, DemoHotelOffer } from './demo-travel.ts';
import { tripDateLabel } from './trip-plan.ts';
import type { TripPlanData, TripPlanSection } from './trip-plan.ts';
import './trip-plan.css';

export interface TripPlanCardProps {
  plan: TripPlanData;
  disabled: boolean;
  onOpen: (section: TripPlanSection) => void;
}

export interface TripPlanViewProps {
  plan: TripPlanData;
  section: TripPlanSection;
  onSectionChange: (section: TripPlanSection) => void;
  onClose: () => void;
}

const sections = [
  { section: 'flights', label: 'Flights', action: 'Book flight', detail: 'Compare 3 demo fares', icon: 'plane' },
  { section: 'hotels', label: 'Hotels', action: 'Book hotel', detail: 'Compare 3 demo stays', icon: 'bed' },
  { section: 'itinerary', label: 'Itinerary', action: 'View itinerary', detail: 'Review your suggested schedule', icon: 'check-list' },
] as const;

const sectionTitles: Record<TripPlanSection, string> = {
  flights: 'Flight options',
  hotels: 'Hotel options',
  itinerary: 'Suggested itinerary',
};

export function TripPlanCard({ plan, disabled, onOpen }: TripPlanCardProps) {
  return <section className="trip-plan-card" aria-label={`Trip plan for ${plan.destination}`} data-swipe-ignore="true">
    <div className="trip-plan-card__heading">
      <h3>{plan.destination}</h3>
      <p>{tripDateLabel(plan)}</p>
    </div>
    <div className="trip-plan-card__actions">
      {sections.map(item => <button key={item.section} type="button" className="trip-plan-card__action"
        aria-label={item.action} data-plan-section={item.section} disabled={disabled}
        onClick={() => onOpen(item.section)}>
        <span className="trip-plan-card__icon"><Icon name={item.icon} /></span>
        <span className="trip-plan-card__action-copy">
          <strong>{item.action}</strong>
          <span>{item.detail}</span>
        </span>
        <Icon name="chevron-right" className="trip-plan-card__chevron" />
      </button>)}
    </div>
  </section>;
}

function TripOverview({ plan, section }: { plan: TripPlanData; section: TripPlanSection }) {
  return <section className="trip-plan__overview" aria-label="Trip details">
    <div className="trip-plan__destination">
      <span className="trip-plan__destination-icon">
        <Icon name={section === 'flights' ? 'plane' : section === 'hotels' ? 'bed' : 'check-list'} />
      </span>
      <div><span className="trip-plan__eyebrow">Your trip</span><h3>{plan.destination}</h3></div>
    </div>
    <p className="trip-plan__dates"><Icon name="calendar" /><span>{tripDateLabel(plan)}</span></p>
  </section>;
}

function checkoutUrl(offer: DemoFlightOffer | DemoHotelOffer): string {
  return demoCheckoutUrl(offer, window.location.href);
}

function FlightOffers({ plan }: { plan: TripPlanData }) {
  const offers = plan.offers?.flights ?? [];
  const flexible = parseDateSelection(plan.dates) === null;

  return <section className="trip-plan__provider" aria-labelledby="flight-options-heading">
    <div className="trip-plan__provider-heading">
      <h3 id="flight-options-heading">Choose a flight</h3>
      <span>Demo inventory</span>
    </div>
    <p className="trip-plan__copy">
      {plan.origin ? `${plan.origin} to ${plan.destination}` : `Departure city TBD to ${plan.destination}`}
    </p>
    {flexible && <p className="trip-plan__notice">Dates are flexible; these fictional fares do not represent live availability.</p>}
    <div className="trip-plan__offers">
      {offers.map(offer => <article className="trip-plan__offer" data-offer-id={offer.id} key={offer.id}>
        <div className="trip-plan__offer-heading">
          <div><h4>{offer.airline}</h4><p>{offer.flightNumber} · {offer.stops === 0 ? 'Nonstop' : '1 stop'}</p></div>
          <strong>{formatDemoMoney(offer.priceCents)}</strong>
        </div>
        <p>{offer.outboundTime} outbound · {offer.returnTime} return</p>
        <p>{offer.cabin} · {offer.baggage}</p>
        <a className="trip-plan__external" href={checkoutUrl(offer)} target="_blank" rel="noopener noreferrer"
          aria-label={`Book ${offer.airline} ${offer.flightNumber}`}>Book</a>
      </article>)}
    </div>
    {offers.length === 0 && <p className="trip-plan__empty-entry">No demo flight offers are attached to this plan.</p>}
    <p className="trip-plan__booking-note">
      Fictional demo fares only. Book opens a prefilled demo checkout; no payment or reservation is created.
    </p>
  </section>;
}

function HotelOffers({ plan }: { plan: TripPlanData }) {
  const offers = plan.offers?.hotels ?? [];
  const range = parseDateSelection(plan.dates);
  const stayNote = range === null
    ? 'Dates are flexible; no stay dates are assumed.'
    : range.start === range.end
      ? 'This is a same-day trip, so no overnight stay is included.'
      : 'Your selected dates are included as check-in and check-out.';

  return <section className="trip-plan__provider" aria-labelledby="hotel-options-heading">
    <div className="trip-plan__provider-heading">
      <h3 id="hotel-options-heading">Choose a hotel</h3>
      <span>Demo inventory</span>
    </div>
    <p className="trip-plan__notice">{stayNote}</p>
    <div className="trip-plan__offers">
      {offers.map(offer => <article className="trip-plan__offer" data-offer-id={offer.id} key={offer.id}>
        <div className="trip-plan__offer-heading">
          <div><h4>{offer.hotel}</h4><p>{offer.area}</p></div>
          <strong>{formatDemoMoney(offer.nightlyCents)}<small>/night</small></strong>
        </div>
        <p>{offer.room}</p>
        <p>{offer.cancellation}</p>
        {offer.totalCents !== null && <p>{offer.nights} nights · {formatDemoMoney(offer.totalCents)} total</p>}
        <a className="trip-plan__external" href={checkoutUrl(offer)} target="_blank" rel="noopener noreferrer"
          aria-label={`Book ${offer.hotel}`}>Book</a>
      </article>)}
    </div>
    {offers.length === 0 && <p className="trip-plan__empty-entry">No demo hotel offers are attached to this plan.</p>}
    <p className="trip-plan__booking-note">
      Fictional demo stays only. Book opens a prefilled demo checkout; no payment or reservation is created.
    </p>
  </section>;
}

function Itinerary({ plan }: { plan: TripPlanData }) {
  return <section className="trip-plan__schedule" aria-label="Itinerary entries">
    {plan.summary && <p className="trip-plan__summary">{plan.summary}</p>}
    <p className="trip-plan__notice">
      Suggested schedule; confirm opening hours before booking. Activities are not reserved.
    </p>
    {plan.itinerary.length > 0 ? <ol className="trip-plan__itinerary">
      {plan.itinerary.map((day, index) => {
        const date = parseDay(day.date);
        return <li key={`${index}-${day.date ?? 'undated'}`} className="trip-plan__day">
          <span className="trip-plan__day-number" aria-hidden="true">{index + 1}</span>
          <div className="trip-plan__day-content">
            <header>
              {date !== null && <time className="trip-plan__day-date" dateTime={day.date ?? undefined}>
                {formatRange({ start: date, end: date })}
              </time>}
              <h3>{day.title}</h3>
            </header>
            {day.activities.length > 0 ? <ul className="trip-plan__activities">
              {day.activities.map((activity, activityIndex) => <li key={activityIndex}>{activity}</li>)}
            </ul> : <p className="trip-plan__empty-entry">No activities were supplied for this entry.</p>}
          </div>
        </li>;
      })}
    </ol> : <p className="trip-plan__empty-entry">No itinerary entries were provided for this plan.</p>}
  </section>;
}

export function TripPlanView({
  plan, section, onSectionChange, onClose,
}: TripPlanViewProps) {
  return <Modal title={sectionTitles[section]} className="trip-plan-panel" onClose={onClose}>
    <nav className="trip-plan__sections" aria-label="Plan sections" data-swipe-ignore="true">
      {sections.map(item => <button key={item.section} type="button" aria-pressed={section === item.section}
        data-plan-section={item.section} onClick={() => onSectionChange(item.section)}>
        <Icon name={item.icon} /><span>{item.label}</span>
      </button>)}
    </nav>
    <div key={section} className="trip-plan__body" role="region"
      aria-label={`${sectionTitles[section]} details`} tabIndex={0} data-swipe-ignore="true">
      <TripOverview plan={plan} section={section} />
      {section === 'flights' && <FlightOffers plan={plan} />}
      {section === 'hotels' && <HotelOffers plan={plan} />}
      {section === 'itinerary' && <Itinerary plan={plan} />}
    </div>
  </Modal>;
}
