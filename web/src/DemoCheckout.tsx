import { formatRange, parseDateSelection } from './dates.ts';
import { formatDemoMoney, parseDemoCheckout } from './demo-travel.ts';

export function DemoCheckout({ payload }: { payload: string }) {
  const offer = parseDemoCheckout(payload);
  if (!offer) {
    return <main className="demo-checkout">
      <section className="demo-checkout__card demo-checkout__card--error" role="alert">
        <h1>Invalid demo checkout</h1>
        <p>This link does not contain a valid demo travel offer.</p>
      </section>
    </main>;
  }

  const heading = offer.kind === 'flight' ? 'Demo flight checkout' : 'Demo hotel checkout';
  return <main className="demo-checkout">
    <section className="demo-checkout__card" data-checkout-offer-id={offer.id}>
      <p className="demo-checkout__eyebrow">Siri Agent prototype</p>
      <h1>{heading}</h1>
      <p className="demo-checkout__warning">Demo only. Nothing is reserved and no payment information is collected.</p>
      {offer.kind === 'flight' ? <>
        <h2>{offer.airline} {offer.flightNumber}</h2>
        <dl>
          <div><dt>Route</dt><dd>{offer.origin ?? 'Departure city TBD'} to {offer.destination}</dd></div>
          <div><dt>Dates</dt><dd>{dateLabel(offer.dates)}</dd></div>
          <div><dt>Times</dt><dd>{offer.outboundTime} outbound · {offer.returnTime} return</dd></div>
          <div><dt>Fare</dt><dd>{formatDemoMoney(offer.priceCents)}</dd></div>
          <div><dt>Details</dt><dd>{offer.cabin} · {offer.stops === 0 ? 'Nonstop' : '1 stop'} · {offer.baggage}</dd></div>
        </dl>
      </> : <>
        <h2>{offer.hotel}</h2>
        <dl>
          <div><dt>Destination</dt><dd>{offer.destination}</dd></div>
          <div><dt>Stay</dt><dd>{dateLabel(offer.stay)}</dd></div>
          <div><dt>Room</dt><dd>{offer.room}</dd></div>
          <div><dt>Rate</dt><dd>{formatDemoMoney(offer.nightlyCents)} per night</dd></div>
          <div><dt>Total</dt><dd>{offer.totalCents === null ? 'TBD' : formatDemoMoney(offer.totalCents)}</dd></div>
          <div><dt>Policy</dt><dd>{offer.cancellation}</dd></div>
        </dl>
      </>}
    </section>
  </main>;
}

function dateLabel(value: unknown): string {
  const range = parseDateSelection(value);
  return range ? formatRange(range) : 'Flexible';
}
