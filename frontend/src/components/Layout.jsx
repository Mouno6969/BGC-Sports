// ---------------------------------------------------------------------------
// Layout — Premium app shell matching the ESPN/DAZN-style mockup
// ---------------------------------------------------------------------------
import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import LiveScoreTicker from './LiveScoreTicker.jsx';
import LiveBadge from './LiveBadge.jsx';
import WorldCupMobileFab from './WorldCupMobileFab.jsx';
import InstallPwaPrompt from './InstallPwaPrompt.jsx';
import ToastContainer, { showToast } from './Toast.jsx';
import ProfileSettingsModal from './ProfileSettingsModal.jsx';
import UserAvatar from './UserAvatar.jsx';
import { getProfile, getEffectiveName, onProfileChange } from '../lib/profile.js';
import JsonLd from './JsonLd.jsx';
import { getSiteOrigin } from '../lib/sportsEventSchema.js';
import usePullToRefresh from '../hooks/usePullToRefresh.js';
import PullToRefreshIndicator from './PullToRefresh.jsx';
import MiniPlayer from './MiniPlayer.jsx';

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'World Cup', path: '/?tab=worldcup', tab: 'worldcup' },
  { label: 'Predict', path: '/?tab=predict', tab: 'predict' },
  { label: 'Scores', path: '/?tab=scores', tab: 'scores' },
  { label: 'Sports', path: '/category/Sports' },
  { label: 'Live TV', path: '/category/Live' },
  { label: 'Channels', path: '/?tab=channels', tab: 'channels' },
  { label: 'Profile', path: '/profile' },
  { label: 'News', path: '/category/News' },
];

const MOBILE_NAV = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'World Cup', path: '/?tab=worldcup', icon: 'worldcup' },
  { label: 'Predict', path: '/?tab=predict', icon: 'predict' },
  { label: 'Sports', path: '/category/Sports', icon: 'sports' },
  { label: 'Channels', path: '/?tab=channels', icon: 'channels' },
];

const BOTTOM_NAV_KEY = 'bgc-bottom-nav-collapsed';

function readBottomNavCollapsed() {
  try {
    return localStorage.getItem(BOTTOM_NAV_KEY) === '1';
  } catch {
    return false;
  }
}

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
    case 'predict':
      return <span className="text-base leading-none" aria-hidden="true">🎯</span>;
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
  const [isScrolling, setIsScrolling] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(getProfile);
  const [bottomNavCollapsed, setBottomNavCollapsed] = useState(readBottomNavCollapsed);
  const scrollEndRef = useRef(null);

  // Keep the header avatar in sync with profile changes.
  useEffect(() => onProfileChange(setProfile), []);

  // Persist bottom-nav collapse preference (mobile)
  useEffect(() => {
    try {
      localStorage.setItem(BOTTOM_NAV_KEY, bottomNavCollapsed ? '1' : '0');
    } catch { /* ignore */ }
    document.body.classList.toggle('bottom-nav-collapsed', bottomNavCollapsed);
    return () => document.body.classList.remove('bottom-nav-collapsed');
  }, [bottomNavCollapsed]);

  const toggleBottomNav = useCallback(() => {
    setBottomNavCollapsed((v) => !v);
  }, []);

  // Pull-to-refresh (mobile) — refresh live scores + channel status.
  // Warm caches, then broadcast so mounted sections re-fetch UI state.
  const handlePullRefresh = useCallback(async () => {
    try {
      await Promise.allSettled([
        fetch('/api/scores', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/channels', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/channels/featured', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/fifa/channels', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      window.dispatchEvent(
        new CustomEvent('bgc:pull-refresh', {
          detail: { at: Date.now(), sources: ['scores', 'channels', 'fifa'] },
        })
      );
      // Give listeners a beat to apply new data before toast/dismiss
      await new Promise((r) => setTimeout(r, 120));
      showToast('Scores & channels updated', 'success');
    } catch {
      showToast('Could not refresh', 'error');
    }
  }, []);

  // Disable on watch (player gestures), modals, and desktop menus
  const onWatch = location.pathname.startsWith('/watch');
  const ptr = usePullToRefresh(handlePullRefresh, {
    enabled: !profileOpen && !mobileMenuOpen && !onWatch,
  });

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
      setIsScrolling(true);
      clearTimeout(scrollEndRef.current);
      scrollEndRef.current = setTimeout(() => setIsScrolling(false), 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollEndRef.current);
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // Scene pages share the landing page's stadium backdrop + glass chrome.
  // Every routed page inside Layout (home, category, profile, match, watch,
  // 404) now uses the unified stadium design, so this is always true.
  const isScenePage = true;

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : getSiteOrigin();
  const siteJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteOrigin}/#organization`,
        name: 'BGC Sports',
        url: siteOrigin,
        logo: {
          '@type': 'ImageObject',
          url: `${siteOrigin}/logo.png`,
        },
        description:
          'Live sports streaming platform — FIFA World Cup, football scores, cricket, NBA and free live channels.',
      },
      {
        '@type': 'WebSite',
        '@id': `${siteOrigin}/#website`,
        url: siteOrigin,
        name: 'BGC Sports',
        publisher: { '@id': `${siteOrigin}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteOrigin}/?tab=channels&q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebApplication',
        name: 'BGC Sports',
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Web',
        url: siteOrigin,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  };

  return (
    <div className={`flex min-h-screen flex-col bg-[var(--bg-primary)] transition-colors duration-200 ${isScenePage ? 'layout--homepage' : ''}${isScenePage && isScrolling ? ' is-scrolling' : ''}`}>
      <JsonLd id="site-organization" data={siteJsonLd} />
      <div className="layout-ticker">
        <LiveScoreTicker />
      </div>

      <header
        className={`layout-header sticky top-0 z-[var(--z-header)] border-b transition-all duration-200 ${
          scrolled
            ? 'border-[var(--border-primary)] glass-panel shadow-nav'
            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
          <Link to="/" viewTransition className="flex min-h-[44px] items-center gap-2" aria-label="BGC Sports Home">
            <span className="logo-brand type-display text-xl italic tracking-tight">
              BGC <span>SPORTS</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const active = isNavActive(link, location, tab);
              return (
                <Link
                  key={link.label}
                  to={link.path}
                  viewTransition
                  className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 inline-flex items-center ${
                    active
                      ? (link.label === 'Sports' || link.label === 'Live TV'
                        ? 'nav-pill-active'
                        : 'text-[var(--text-primary)] font-semibold bg-[var(--bg-tertiary)]')
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
              viewTransition
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-label="Search channels"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>

            <button
              type="button"
              data-haptic="selection"
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
              data-haptic="medium"
              onClick={() => setProfileOpen(true)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
              aria-label="Profile settings"
              title={`Profile: ${getEffectiveName()}`}
            >
              <UserAvatar
                name={profile.displayName || getEffectiveName()}
                avatar={profile.avatar}
                color="#22c55e"
                size="md"
              />
            </button>

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
                    viewTransition
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

      <footer
        className={`layout-footer border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] py-8 md:mb-0 ${
          bottomNavCollapsed ? 'mb-6' : 'mb-16'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="type-body text-[var(--text-muted)]">
            BGC Sports &copy; {new Date().getFullYear()} — Live Sports Streaming Platform
          </p>
        </div>
      </footer>

      <PullToRefreshIndicator
        pullDistance={ptr.pullDistance}
        progress={ptr.progress}
        refreshing={ptr.refreshing}
        pulling={ptr.pulling}
      />
      <WorldCupMobileFab />
      <MiniPlayer />
      <InstallPwaPrompt />
      <ToastContainer />
      <ProfileSettingsModal open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Mobile bottom nav — collapsible so stream/chat get full height */}
      <div
        className={`layout-bottom-nav-wrap fixed bottom-0 left-0 right-0 z-[var(--z-header)] md:hidden safe-area-bottom ${
          bottomNavCollapsed ? 'is-collapsed' : ''
        }`}
      >
        {/* Expanded bar */}
        <nav
          className={`layout-bottom-nav border-t border-[var(--border-primary)] glass-panel transition-transform duration-300 ease-out ${
            bottomNavCollapsed ? 'pointer-events-none translate-y-full opacity-0' : 'translate-y-0 opacity-100'
          }`}
          aria-label="Mobile bottom navigation"
          aria-hidden={bottomNavCollapsed}
        >
          {/* Collapse handle */}
          <button
            type="button"
            data-haptic="selection"
            onClick={toggleBottomNav}
            className="flex w-full items-center justify-center gap-1.5 border-b border-[var(--border-primary)]/60 py-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
            aria-label="Hide bottom menu"
            title="Hide menu"
          >
            <span className="block h-1 w-8 rounded-full bg-[var(--text-muted)]/50" aria-hidden="true" />
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="flex h-14 items-center justify-around">
            {MOBILE_NAV.map((item) => {
              const active = item.path.includes('tab=')
                ? location.pathname === '/' && tab === item.path.split('tab=')[1]
                : location.pathname === item.path || location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  viewTransition
                  data-haptic="selection"
                  data-haptic-tab="1"
                  className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 transition-colors ${
                    active ? 'text-[var(--brand-purple-light)]' : 'text-[var(--text-muted)]'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  tabIndex={bottomNavCollapsed ? -1 : 0}
                >
                  <MobileNavIcon type={item.icon} />
                  <span className="type-label text-[9px]">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Collapsed: small floating chip to bring the menu back */}
        {bottomNavCollapsed && (
          <button
            type="button"
            data-haptic="selection"
            onClick={toggleBottomNav}
            className="bottom-nav-show-chip absolute bottom-3 left-1/2 z-[var(--z-header)] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 px-3.5 py-2 text-[11px] font-bold text-[var(--text-secondary)] shadow-lg backdrop-blur-md active:scale-95"
            aria-label="Show bottom menu"
            title="Show menu"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            Menu
          </button>
        )}
      </div>
    </div>
  );
}