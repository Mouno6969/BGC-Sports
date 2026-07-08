// ---------------------------------------------------------------------------
// Layout — Premium app shell matching the ESPN/DAZN-style mockup
// ---------------------------------------------------------------------------
import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import LiveScoreTicker from './LiveScoreTicker.jsx';
import LiveBadge from './LiveBadge.jsx';
import WorldCupMobileFab from './WorldCupMobileFab.jsx';
import InstallPwaPrompt from './InstallPwaPrompt.jsx';
import ToastContainer from './Toast.jsx';

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'World Cup', path: '/?tab=worldcup', tab: 'worldcup' },
  { label: 'Sports', path: '/category/Sports' },
  { label: 'Live TV', path: '/category/Live' },
  { label: 'Channels', path: '/?tab=channels', tab: 'channels' },
  { label: 'News', path: '/category/News' },
];

const MOBILE_NAV = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'World Cup', path: '/?tab=worldcup', icon: 'worldcup' },
  { label: 'Sports', path: '/category/Sports', icon: 'sports' },
  { label: 'Live', path: '/category/Live', icon: 'live' },
  { label: 'Channels', path: '/?tab=channels', icon: 'channels' },
];

function MobileNavIcon({ type }) {
  const cls = 'h-5 w-5';
  switch (type) {
    case 'home':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'worldcup':
      return <span className="text-base leading-none" aria-hidden="true">🏆</span>;
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
    case 'channels':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    default:
      return null;
  }
}

function isNavActive(link, location, tab) {
  if (link.tab) {
    return location.pathname === '/' && tab === link.tab;
  }
  const basePath = link.path.split('?')[0];
  return location.pathname === link.path
    || (basePath !== '/' && location.pathname.startsWith(basePath));
}

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'worldcup';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)] transition-colors duration-200">
      <LiveScoreTicker />

      <header
        className={`sticky top-0 z-[var(--z-header)] border-b transition-all duration-200 ${
          scrolled
            ? 'border-[var(--border-primary)] glass-panel shadow-nav'
            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
          <Link to="/" className="flex min-h-[44px] items-center gap-2" aria-label="BGC Sports Home">
            <span className="type-display text-xl italic tracking-tight text-[var(--accent)]">
              BGC<span className="text-[var(--text-primary)]"> </span>SPORTS
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const active = isNavActive(link, location, tab);
              return (
                <Link
                  key={link.label}
                  to={link.path}
                  className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 inline-flex items-center ${
                    active
                      ? 'text-[var(--text-primary)] font-semibold bg-[var(--bg-tertiary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/?tab=channels"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-label="Search channels"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <div className="hidden sm:flex">
              <LiveBadge />
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] md:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 md:hidden" aria-label="Mobile menu">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const active = isNavActive(link, location, tab);
                return (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`min-h-[44px] rounded-lg px-3 py-2.5 text-sm font-medium transition-colors flex items-center ${
                      active
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

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] py-8 mb-16 md:mb-0">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="type-body text-[var(--text-muted)]">
            BGC Sports &copy; {new Date().getFullYear()} — Live Sports Streaming Platform
          </p>
        </div>
      </footer>

      <WorldCupMobileFab />
      <InstallPwaPrompt />
      <ToastContainer />

      <nav
        className="fixed bottom-0 left-0 right-0 z-[var(--z-header)] md:hidden border-t border-[var(--border-primary)] glass-panel safe-area-bottom"
        aria-label="Mobile bottom navigation"
      >
        <div className="flex items-center justify-around h-16">
          {MOBILE_NAV.map((item) => {
            const active = item.path.includes('tab=')
              ? location.pathname === '/' && tab === item.path.split('tab=')[1]
              : location.pathname === item.path || location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 transition-colors ${
                  active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <MobileNavIcon type={item.icon} />
                <span className="type-label text-[9px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}