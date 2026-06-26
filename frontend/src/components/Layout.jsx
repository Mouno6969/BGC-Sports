// ---------------------------------------------------------------------------
// Layout — Enhanced with glassmorphism navbar, sticky hide/show on scroll,
// smooth hamburger animation, live score ticker, and mobile bottom nav.
// ---------------------------------------------------------------------------
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
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
  { label: 'Chat', path: '/', icon: 'chat' },
  { label: 'Profile', path: '/', icon: 'profile' },
];

function MobileNavIcon({ type }) {
  switch (type) {
    case 'home':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'sports':
      return <span className="text-lg">⚽</span>;
    case 'live':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'chat':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'profile':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Sticky navbar: hide on scroll-down, show on scroll-up + glassmorphism on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 20);
      if (currentY > lastScrollY.current && currentY > 80) {
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
      {/* Live Score Ticker */}
      <div className="sticky top-0 z-[60]">
        <LiveScoreTicker />
      </div>

      {/* Top Navigation */}
      <motion.header
        animate={{ y: navVisible ? 0 : -100 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={`sticky top-[36px] z-50 border-b transition-all duration-300 ${
          scrolled
            ? 'border-[var(--border-primary)]/50 bg-[var(--bg-secondary)]/70 backdrop-blur-[12px] shadow-lg'
            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-md'
        }`}
      >
        {/* Primary Nav */}
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-9 items-center justify-center overflow-hidden rounded-lg">
              <img
                src="/logo.png"
                alt="BGC Sports"
                className="h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-accent">
                <svg className="h-5 w-5 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
                </svg>
              </div>
            </div>
            <span className="font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
              BGC<span className="text-accent">SPORTS</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.path ||
                (link.path !== '/' && location.pathname.startsWith(link.path.split('?')[0]));
              return (
                <Link
                  key={link.label}
                  to={link.path}
                  className={`relative px-3 py-2 text-xs font-bold tracking-wide transition-all duration-200 rounded-lg active:scale-95 ${
                    isActive
                      ? 'text-accent bg-accent/5'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-accent"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <Link
              to="/?search=true"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95"
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              <motion.div
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {theme === 'dark' ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </motion.div>
            </button>

            {/* Live indicator */}
            <div className="hidden items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 sm:flex ring-1 ring-red-500/20">
              <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Live</span>
            </div>

            {/* Mobile hamburger with X animation */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] md:hidden active:scale-90 transition-transform"
              aria-label="Menu"
            >
              <div className="relative h-5 w-5">
                <motion.span
                  className="absolute left-0 top-1 block h-0.5 w-5 bg-current rounded-full"
                  animate={mobileMenuOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.25 }}
                />
                <motion.span
                  className="absolute left-0 top-2.5 block h-0.5 w-5 bg-current rounded-full"
                  animate={mobileMenuOpen ? { opacity: 0, x: 8 } : { opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                />
                <motion.span
                  className="absolute left-0 top-4 block h-0.5 w-5 bg-current rounded-full"
                  animate={mobileMenuOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.25 }}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-md md:hidden"
            >
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-accent active:scale-95"
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
      <footer className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] py-6 mb-16 md:mb-0">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            BGC Sports &copy; {new Date().getFullYear()} — Live Sports Streaming Platform
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-md">
        <div className="flex items-center justify-around h-16">
          {MOBILE_NAV.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 transition-all active:scale-90 ${
                  isActive ? 'text-accent' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <motion.div
                  animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <MobileNavIcon type={item.icon} />
                </motion.div>
                <span className="text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-dot"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-accent"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
