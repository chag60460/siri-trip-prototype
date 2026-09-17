import type { ReactNode, SVGProps } from 'react';

type IconName =
  | 'plus' | 'microphone' | 'waveform' | 'keyboard' | 'close'
  | 'send' | 'chevron-left' | 'chevron-right' | 'plane'
  | 'bed' | 'ticket' | 'restart' | 'sparkles' | 'search' | 'check-list' | 'calendar' | 'stop'
  | 'bank' | 'map';

const shapes: Record<IconName, ReactNode> = {
  plus: <path d="M12 4v16M4 12h16" />,
  microphone: <>
    <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
    <path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v4M8 22h8" />
  </>,
  waveform: <path d="M3 10v4M7 6v12M11 2v20M15 7v10M19 4v16M23 10v4" />,
  keyboard: <>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="M6 9h.1M10 9h.1M14 9h.1M18 9h.1M6 12h.1M10 12h.1M14 12h.1M18 12h.1M7 16h10" />
  </>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: <>
    <circle cx="12" cy="12" r="11" fill="currentColor" stroke="none" />
    <path d="M12 18V6m-4 4 4-4 4 4" stroke="#fff" />
  </>,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  plane: <path d="m2 12 7 2 7 7 2-1-4-7 7-7c1-1 1-3 0-3s-2 0-3 1l-7 7-7-4-1 2 4 4-3 1Z" />,
  bed: <><path d="M3 7v14M21 12v9M3 17h18M3 12h16a2 2 0 0 1 2 2v3" /><rect x="5" y="8" width="6" height="4" rx="1" /></>,
  ticket: <path d="M3 7h18v4a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm12 1v2m0 3v2m0 2v1" />,
  restart: <path d="M4 10a8 8 0 1 1 1 9M4 4v6h6" />,
  sparkles: <path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z" />,
  search: <><circle cx="10" cy="10" r="6.5" /><path d="m15 15 6 6" /></>,
  'check-list': <><path d="M10 6h11M10 12h11M10 18h11" /><circle cx="4" cy="6" r="1.5" /><circle cx="4" cy="12" r="1.5" /><circle cx="4" cy="18" r="1.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M7 14h2m4 0h2m-8 4h2" /></>,
  stop: <><circle cx="12" cy="12" r="11" fill="currentColor" stroke="none" /><rect x="8" y="8" width="8" height="8" rx="1.5" fill="#fff" stroke="none" /></>,
  bank: <><path d="m3 9 9-5 9 5H3ZM5 12v6m7-6v6m7-6v6M4 18h16M3 21h18" /></>,
  map: <path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3-6-3Zm0 0v15m6-12v15" />,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {shapes[name]}
  </svg>;
}

export function StatusBar() {
  return <div className="status-bar" aria-hidden="true">
    <span className="status-time">9:41</span>
    <div className="status-icons">
      <svg viewBox="0 0 20 16" className="signal-icon">
        <rect x="0" y="10" width="3.4" height="5" rx="1" />
        <rect x="5" y="7" width="3.4" height="8" rx="1" />
        <rect x="10" y="4" width="3.4" height="11" rx="1" />
        <rect x="15" y="1" width="3.4" height="14" rx="1" />
      </svg>
      <svg viewBox="0 0 24 18" className="wifi-icon" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M2 5a16 16 0 0 1 20 0M6 10a10 10 0 0 1 12 0M10 15a3.2 3.2 0 0 1 4 0" />
      </svg>
      <svg viewBox="0 0 29 15" className="battery-icon">
        <rect x=".7" y="1" width="24" height="13" rx="3.7" fill="none" stroke="currentColor" strokeWidth="1" opacity=".5" />
        <rect x="2.5" y="2.8" width="20.4" height="9.4" rx="2" fill="currentColor" />
        <path d="M26 5v5a2.5 2.5 0 0 0 0-5Z" fill="currentColor" opacity=".5" />
      </svg>
    </div>
  </div>;
}

export function SiriOrb({ className = '' }: { className?: string }) {
  return <span className={`siri-orb ${className}`} aria-hidden="true" />;
}
