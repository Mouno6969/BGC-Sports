// ---------------------------------------------------------------------------
// Layout — Premium app shell matching the ESPN/DAZN-style mockup
// ---------------------------------------------------------------------------
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import LiveScoreTicker from './LiveScoreTicker.jsx';

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Sports', path: '/category/Sports' },
  { label: 'Live TV', path: '/category/Live' },
  { label: 'Cricket', path: '/category/Sports?q=cricket' },
  { label: 'Football', path: '/category/Sports?q=football' },
  { label: 'News', path: '/category/News' },
];

const MOBILE_NAV = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'Sports', path: '/category/Sports', icon: 'sports' },
  { label: 'Live', path: '/category/Live', icon: 'live' },
  { label: 'News', path: '/category/News', icon: 'news' },
];

function MobileNavIcon({ type }) {
  const cls = "h-5 w-5";
  switch (type) {
    case 'home':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'sports':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'live':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'news':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)] transition-colors duration-200">
      {/* Live Score Ticker */}
      <LiveScoreTicker />

      {/* Top Navigation */}
      <header
        className={`sticky top-0 z-50 border-b transition-all duration-200 ${
          scrolled
            ? 'border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-md shadow-nav'
            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
          {/* Logo — Bold italic green like mockup */}
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display text-xl font-extrabold italic tracking-tight text-[var(--accent)]">
              BGC<span className="text-[var(--text-primary)]"> </span>SPORTS
            </span>
          </Link>

          {/* Desktop Nav — Centered */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.path ||
                (link.path !== '/' && location.pathname.startsWith(link.path.split('?')[0]));
              return (
                <Link
                  key={link.label}
                  to={link.path}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'text-[var(--text-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {theme === 'dark' ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Live indicator */}
            <div className="hidden items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 sm:flex">
              <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-red-400">LIVE</span>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] md:hidden"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <nav className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-[var(--accent)] bg-[var(--accent-muted)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] py-8 mb-16 md:mb-0">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            BGC Sports &copy; {new Date().getFullYear()} — Live Sports Streaming Platform
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-md safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {MOBILE_NAV.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <MobileNavIcon type={item.icon} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
