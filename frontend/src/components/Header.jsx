// ---------------------------------------------------------------------------
// Header — app branding with logo, live badge, theme toggle, connection
// status, and admin link. Premium sports broadcast aesthetic.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';

export default function Header({ connected }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="relative z-10 flex items-center justify-between border-b border-ink-700/50 bg-ink-900/90 px-4 py-3 backdrop-blur-md dark:border-ink-700/50 dark:bg-ink-900/90">
      {/* Left: Logo + branding */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 items-center justify-center overflow-hidden">
          <img
            src="/logo.png"
            alt="BGC Sports"
            className="h-10 w-auto object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div className="hidden h-10 w-10 items-center justify-center rounded-lg bg-ink-700">
            <span className="text-lg font-extrabold text-accent">B</span>
          </div>
        </div>
        <div>
          <h1 className="font-display text-lg font-extrabold tracking-tight text-white">
            BGC <span className="bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent">Sports</span>
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
            Live Watch Party
          </p>
        </div>
        {/* Live badge */}
        <span className="ml-2 flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-live ring-1 ring-live/20">
          <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulseLive" />
          Live
        </span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Connection status */}
        <span
          className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:flex ${
            connected
              ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
              : 'bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/20'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? 'bg-accent animate-pulseLive' : 'bg-slate-600'
            }`}
          />
          {connected ? 'Connected' : 'Connecting...'}
        </span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-600 text-slate-400 transition-all duration-200 hover:border-ink-400 hover:bg-ink-700 hover:text-white"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Admin link */}
        <Link
          to="/admin"
          className="rounded-xl border border-ink-600 px-3.5 py-2 text-xs font-semibold text-slate-300 transition-all duration-200 hover:border-secondary/50 hover:bg-secondary/10 hover:text-secondary"
        >
          Admin
        </Link>
      </div>
    </header>
  );
}
