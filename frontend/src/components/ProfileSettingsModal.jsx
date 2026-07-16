// ---------------------------------------------------------------------------
// ProfileSettingsModal — full profile hub: overview, history, favorites,
// badges, and settings. Everything is optional; guest identity still works.
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ProfileHub from './ProfileHub.jsx';

export default function ProfileSettingsModal({ open, onClose }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      requestAnimationFrame(() => {
        const first = panelRef.current?.querySelector('button, input, textarea');
        first?.focus();
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus?.();
      triggerRef.current = null;
    }
  }, [open]);

  // Prevent background scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Your profile"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-4 py-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Your Profile</h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              Watch history · favorites · badges · settings
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/profile"
              onClick={onClose}
              className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/10"
            >
              Full page
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto scrollbar-thin p-4">
          <ProfileHub compact onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
