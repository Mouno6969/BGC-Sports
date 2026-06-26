// ---------------------------------------------------------------------------
// Layout — Redesigned: Clean, minimal app shell with streamlined navigation.
// Removed cluttered elements, cleaner mobile nav with proper links.
// ---------------------------------------------------------------------------
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext.jsx';
import LiveScoreTicker from './LiveScoreTicker.jsx';

const NAV_LINKS = [
  { label: 'HOME', path: '/' },
  { label: 'SPORTS', path: '/category/Sports' },
  { label: 'LIVE', path: '/category/Live' },
  { label: 'CRICKET', path: '/category/Sports?q=cricket' },
  { label: 'FOOTBALL', path: '/category/Sports?q=football' },
  { label: 'NEWS', path: '/category/News' },
];

const MOBILE_NAV = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'Sports', path: '/category/Sports', icon: 'sports' },
  { label: 'Live', path: '/category/Live', icon: 'live' },
  { label: 'News', path: '/category/News', icon: 'news' },
];

function MobileNavIcon({ type }) {
  switch (type) {
    case 'home':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'sports':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'live':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'news':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Sticky navbar: hide on scroll-down, show on scroll-up
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 10);
      if (currentY > lastScrollY.current && currentY > 60) {
        setNavVisible(false);
        setMobileMenuOpen(false);
      } else {
        setNavVisible(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)] transition-colors duration-300">
      {/* Live Score Ticker — compact */}
      <div className="sticky top-0 z-[60]">
        <LiveScoreTicker />
      </div>

      {/* Top Navigation */}
      <motion.header
        animate={{ y: navVisible ? 0 : -80 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className={`sticky top-[32px] z-50 border-b transition-all duration-200 ${
          scrolled
            ? 'border-[var(--border-primary)]/50 bg-[var(--bg-secondary)]/80 backdrop-blur-xl shadow-md'
            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src="/logo.png"
              alt="BGC Sports"
              className="h-8 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              BGC<span className="text-accent">SPORTS</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.path ||
                (link.path !== '/' && location.pathname.startsWith(link.path.split('?')[0]));
              return (
                <Link
                  key={link.label}
                  to={link.path}
                  className={`relative px-2.5 py-1.5 text-[10px] font-bold tracking-wide transition-all rounded-md active:scale-95 ${
                    isActive
                      ? 'text-accent bg-accent/5'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-3 rounded-full bg-accent"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1.5">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95"
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {theme === 'dark' ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Live indicator */}
            <div className="hidden items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 sm:flex border border-red-500/20">
              <span className="h-1.5 w-1.5 animate-pulseLive rounded-full bg-red-500" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Live</span>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] md:hidden active:scale-90 transition-transform"
              aria-label="Menu"
            >
              <div className="relative h-4 w-4">
                <motion.span
                  className="absolute left-0 top-0.5 block h-0.5 w-4 bg-current rounded-full"
                  animate={mobileMenuOpen ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }}
                />
                <motion.span
                  className="absolute left-0 top-2 block h-0.5 w-4 bg-current rounded-full"
                  animate={mobileMenuOpen ? { opacity: 0 } : { opacity: 1 }}
                />
                <motion.span
                  className="absolute left-0 top-3.5 block h-0.5 w-4 bg-current rounded-full"
                  animate={mobileMenuOpen ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] md:hidden"
            >
              <div className="flex flex-wrap gap-1.5 px-4 py-3">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-md bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-secondary)] transition-colors hover:text-accent active:scale-95"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] py-4 mb-14 md:mb-0">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-[10px] text-[var(--text-muted)]">
            BGC Sports &copy; {new Date().getFullYear()} — Live Sports Streaming Platform
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-md safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {MOBILE_NAV.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all active:scale-90 ${
                  isActive ? 'text-accent' : 'text-[var(--text-muted)]'
                }`}
              >
                <MobileNavIcon type={item.icon} />
                <span className="text-[8px] font-bold uppercase tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
