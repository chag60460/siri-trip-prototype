import { Icon, SiriOrb } from './Icons';
import { currentDay, DAY } from './dates';
import { createDemoCalendar } from './demo-calendar';
import type { DemoAppId } from './demo-apps';
import './system-screens.css';

const appIcons = [
  ['FaceTime', 'HomeFaceTime'], ['Calendar', 'calendar'], ['Photos', 'HomePhotos'], ['Camera', 'HomeCamera'],
  ['Mail', 'HomeMail'], ['Clock', 'HomeClock'], ['Maps', 'HomeMaps'], ['Weather', 'HomeWeather'],
  ['Reminders', 'HomeReminders'], ['Notes', 'HomeNotes'], ['App Store', 'HomeAppStore'], ['Books', 'HomeBooks'],
  ['TV', 'HomeTV'], ['Podcasts', 'HomePodcasts'], ['News', 'HomeNews'], ['Health', 'HomeHealth'],
  ['Bank', 'bank'], ['Wallet', 'HomeWallet'], ['Settings', 'HomeSettings'], ['Siri Trip', 'siri'],
] as const;

const dockIcons = [
  ['Phone', 'HomePhone'], ['Safari', 'safari'], ['Messages', 'HomeMessages'], ['Music', 'HomeMusic'],
] as const;

function AppIcon({ icon }: { icon: string }) {
  if (icon === 'calendar') return <span className="app-art calendar-app" aria-hidden="true">
    <span>{new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(currentDay()).toUpperCase()}</span>
    <strong>{new Date(currentDay()).getUTCDate()}</strong>
  </span>;
  if (icon === 'siri') return <span className="app-art siri-app"><SiriOrb /></span>;
  if (icon === 'bank') return <span className="app-art bank-app" aria-hidden="true"><Icon name="bank" /></span>;
  if (icon === 'safari') return <span className="app-art safari-app" aria-hidden="true">
    <span className="compass-face"><i /></span>
  </span>;
  return <img className="app-art" src={`${import.meta.env.BASE_URL}home-icons/${icon}.png`}
    alt="" draggable={false} width={64} height={64} />;
}

function Wallpaper() {
  return <div className="system-wallpaper" aria-hidden="true"><i /><b /></div>;
}

export function HomeScreen({ onOpenSiri, onOpenCalendar, onOpenApp }: {
  onOpenSiri: () => void;
  onOpenCalendar: () => void;
  onOpenApp: (app: DemoAppId) => void;
}) {
  return <section className="system-scene home-scene" aria-label="Home screen">
    <Wallpaper />
    <h1 className="visually-hidden">Home screen</h1>
    <div className="home-app-grid">
      {appIcons.map(([label, icon]) => {
        const onOpen = icon === 'siri' ? onOpenSiri : icon === 'calendar' ? onOpenCalendar
          : icon === 'HomeMaps' ? () => onOpenApp('maps') : icon === 'bank' ? () => onOpenApp('bank') : null;
        return onOpen ? <button key={icon} className="home-app" type="button" aria-label={`Open ${label}`}
          onClick={onOpen}>
          <AppIcon icon={icon} /><span>{label}</span>
        </button>
        : <div className="home-app" key={icon}>
          <AppIcon icon={icon} /><span>{label}</span>
        </div>;
      })}
    </div>
    <div className="home-bottom">
      <div className="home-search" aria-hidden="true"><Icon name="search" /><span>Search</span></div>
      <div className="home-dock" aria-label="Illustrative app dock">
        {dockIcons.map(([label, icon]) => <div key={icon} aria-label={label}>
          <AppIcon icon={icon} />
        </div>)}
      </div>
    </div>
  </section>;
}

function Sun({ cloudy = false }: { cloudy?: boolean }) {
  return <svg className="weather-symbol" viewBox="0 0 48 40" aria-hidden="true">
    <g fill="none" stroke="#ffdb59" strokeWidth="2.6" strokeLinecap="round">
      <circle cx="24" cy="19" r="8" fill="#ffdb59" />
      <path d="M24 3v3m0 26v3M8 19h3m26 0h3M13 8l2 2m18 18 2 2M13 30l2-2M33 10l2-2" />
    </g>
    {cloudy && <path d="M18 35a6 6 0 0 1-1-12 9 9 0 0 1 16-3 7.5 7.5 0 1 1 3 15Z" fill="#fff" />}
  </svg>;
}

function WeatherWidget() {
  return <section className="today-widget weather-widget" aria-label="Sample Chicago weather">
    <div className="weather-overview">
      <div><h2>Chicago</h2><strong>74{'\u00b0'}</strong></div>
      <div className="weather-condition"><Sun cloudy /><span>Mostly Sunny</span><span>H:79{'\u00b0'} L:66{'\u00b0'}</span></div>
    </div>
    <div className="weather-hours">
      {['Now', '10AM', '11AM', '12PM', '1PM'].map((hour, index) => <div key={hour}>
        <span>{hour}</span><Sun cloudy={index === 0} /><strong>{74 + index}{'\u00b0'}</strong>
      </div>)}
    </div>
  </section>;
}

function CalendarWidget({ onOpen }: { onOpen: () => void }) {
  const today = currentDay();
  const date = new Date(today);
  const weekStart = today - date.getUTCDay() * DAY;
  const events = createDemoCalendar(today).events.filter(event => event.date === today);
  return <button type="button" className="today-widget calendar-widget" aria-label="Open demo Calendar" onClick={onOpen}>
    <span className="widget-eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date).toUpperCase()}</span>
    <strong className="calendar-date">{date.getUTCDate()}</strong>
    <p>{events[0] ? `Demo: ${events[0].title}` : 'No sample events today'}</p>
    <div className="calendar-week" aria-hidden="true">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={index}>
        <i>{day}</i><b className={index === date.getUTCDay() ? 'current-day' : ''}>{new Date(weekStart + index * DAY).getUTCDate()}</b>
      </span>)}
    </div>
  </button>;
}

function BatteriesWidget() {
  return <section className="today-widget batteries-widget" aria-label="Sample device batteries">
    <div className="battery-rings" aria-hidden="true">
      <span className="battery-ring"><svg viewBox="0 0 24 28"><rect x="5" y="2" width="14" height="24" rx="3" /><path d="M10 5h4M10 23h4" /></svg></span>
      <span className="battery-ring watch-ring"><svg viewBox="0 0 24 28"><rect x="5" y="7" width="14" height="14" rx="4" /><path d="M9 7V2h6v5M9 21v5h6v-5" /></svg></span>
    </div>
    <strong>85<span>%</span></strong>
    <p>Batteries</p>
  </section>;
}

export function TodayScreen({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  return <section className="system-scene today-scene" aria-label="Today View">
    <Wallpaper />
    <div className="today-scroll" tabIndex={0} aria-label="Today widgets">
      <div className="today-search" aria-hidden="true"><Icon name="search" /><span>Search</span><Icon name="microphone" /></div>
      <header className="today-heading"><h1>Today</h1><span>
        {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(currentDay())}
      </span></header>
      <div className="today-widgets">
        <WeatherWidget />
        <div className="widget-pair"><CalendarWidget onOpen={onOpenCalendar} /><BatteriesWidget /></div>
        <section className="today-widget reminders-widget" aria-label="Sample reminders">
          <header><span><Icon name="check-list" /> Reminders</span><strong>3</strong></header>
          <p><i /> Plan a weekend away</p><p><i /> Find a new coffee spot</p><p><i /> Take the scenic route</p>
        </section>
        <section className="today-widget memories-widget" aria-label="Illustrated landscape widget">
          <div className="landscape-sun" /><div className="landscape-hill back-hill" /><div className="landscape-hill front-hill" />
          <span>THE LITTLE THINGS</span><h2>A moment outside</h2>
        </section>
      </div>
      <p className="today-edit" aria-label="Widgets are illustrative">Customize</p>
    </div>
  </section>;
}
