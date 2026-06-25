// ---------------------------------------------------------------------------
// Header — app branding, live badge, connection status, admin link.
// ---------------------------------------------------------------------------

import { Link } from 'react-router-dom';

export default function Header({ connected }) {
  return (
    <header className="flex items-center justify-between border-b border-ink-700 bg-ink-900/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700">
          <span className="text-lg font-extrabold text-accent">B</span>
        </div>
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-white">
            BGC <span className="text-accent">Sports</span>
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Live Watch Party
          </p>
        </div>
        <span className="ml-2 flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-bold uppercase text-live">
          <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulseLive" />
          Live
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`hidden items-center gap-1.5 text-[11px] sm:flex ${
            connected ? 'text-accent' : 'text-slate-500'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? 'bg-accent' : 'bg-slate-600'
            }`}
          />
          {connected ? 'Connected' : 'Connecting…'}
        </span>
        <Link
          to="/admin"
          className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-ink-700"
        >
          Admin
        </Link>
      </div>
    </header>
  );
}
