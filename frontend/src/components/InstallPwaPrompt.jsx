// ---------------------------------------------------------------------------
// InstallPwaPrompt — Add to Home Screen banner (mobile)
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const DISMISS_KEY = 'bgc-pwa-dismissed';
const DISMISS_DAYS = 7;

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallPwaPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    setIsStandalone(standalone);

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(ios);

    if (standalone || wasDismissedRecently()) return;

    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (ios && !standalone) {
      const timer = setTimeout(() => setVisible(true), 4000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setVisible(false);
      return;
    }
    dismiss();
  }

  // Keep the watch page clear while streaming / joining a party.
  if (!visible || isStandalone || location.pathname.startsWith('/watch')) return null;

  return (
    <div className="fixed left-3 right-3 z-[calc(var(--z-modal)+1)] rounded-xl border border-[var(--accent)]/30 bg-[var(--bg-secondary)] p-4 shadow-xl pwa-prompt-position md:left-auto md:right-4 md:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/20">
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">Add BGC Sports to Home Screen</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {isIOS
              ? 'Tap Share → Add to Home Screen for app-like access.'
              : 'Install for faster loading and one-tap access.'}
          </p>
          <div className="mt-3 flex gap-2">
            {!isIOS && deferredPrompt && (
              <button
                type="button"
                onClick={install}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-[var(--border-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
            >
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 text-[var(--text-muted)]" aria-label="Dismiss">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}