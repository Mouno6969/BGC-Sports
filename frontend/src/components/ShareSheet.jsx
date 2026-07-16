// ---------------------------------------------------------------------------
// ShareSheet — one-tap party/stream share: WhatsApp, Messenger, native share,
// copy link, copy code. Bottom sheet on mobile, centered card on desktop.
// ---------------------------------------------------------------------------
import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { copyToClipboard } from '../lib/utils.js';
import {
  shareInvite,
  whatsappShareUrl,
  messengerShareUrl,
  telegramShareUrl,
} from '../lib/watchInvite.js';
import { showToast } from './Toast.jsx';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   url: string,
 *   title?: string,
 *   text?: string,
 *   code?: string,
 * }} props
 */
export default function ShareSheet({ open, onClose, url, title, text, code }) {
  const shareText =
    text
    || (code
      ? `Join my watch party (${code}) on BGC Sports`
      : 'Watch live on BGC Sports');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const openExternal = useCallback((href) => {
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const handleNative = async () => {
    const result = await shareInvite({ url, title, text: shareText });
    if (result === 'shared') {
      showToast('Shared!', 'success');
      onClose();
    } else if (result === 'copied') {
      showToast(code ? 'Invite link copied!' : 'Link copied!', 'success');
      onClose();
    } else {
      showToast('Share cancelled', 'info');
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(url);
    showToast(ok ? 'Link copied!' : 'Could not copy', ok ? 'success' : 'error');
    if (ok) onClose();
  };

  const handleCopyCode = async () => {
    if (!code) return;
    const ok = await copyToClipboard(code);
    showToast(ok ? `Code ${code} copied!` : 'Could not copy', ok ? 'success' : 'error');
    if (ok) onClose();
  };

  const actions = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      color: 'bg-[#25D366] text-white',
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 6.165L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      onClick: () => {
        openExternal(whatsappShareUrl({ url, text: shareText }));
        onClose();
      },
    },
    {
      id: 'messenger',
      label: 'Messenger',
      color: 'bg-[#0084FF] text-white',
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259L10.732 8.1l3.13 3.259L19.752 8.1l-6.559 6.863z" />
        </svg>
      ),
      onClick: () => {
        openExternal(messengerShareUrl({ url }));
        onClose();
      },
    },
    {
      id: 'telegram',
      label: 'Telegram',
      color: 'bg-[#229ED9] text-white',
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      ),
      onClick: () => {
        openExternal(telegramShareUrl({ url, text: shareText }));
        onClose();
      },
    },
    {
      id: 'system',
      label: 'More',
      color: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] ring-1 ring-[var(--border-primary)]',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
      onClick: handleNative,
    },
    {
      id: 'copy',
      label: 'Copy link',
      color: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] ring-1 ring-[var(--border-primary)]',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      onClick: handleCopyLink,
    },
  ];

  if (code) {
    actions.push({
      id: 'code',
      label: 'Copy code',
      color: 'bg-[var(--accent-muted)] text-[var(--accent)] ring-1 ring-[var(--accent)]/30',
      icon: (
        <span className="font-mono text-xs font-black tracking-wider">{String(code).slice(0, 3)}</span>
      ),
      onClick: handleCopyCode,
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="share-sheet-root fixed inset-0 z-[var(--z-modal,80)] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Share">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Close share sheet"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '40%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="share-sheet-panel relative z-10 w-full max-w-md rounded-t-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-5"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--text-muted)]/40 sm:hidden" aria-hidden="true" />
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {code ? 'Invite to watch party' : 'Share stream'}
                </h2>
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                  {code ? `Code ${code} · one tap to join` : (title || 'BGC Sports')}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {code && (
              <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-muted)] px-3 py-3">
                <span className="font-mono text-2xl font-black tracking-[0.2em] text-[var(--accent)]">
                  {code}
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={a.onClick}
                  className="flex flex-col items-center gap-2 rounded-xl p-2 transition-transform active:scale-95"
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${a.color}`}>
                    {a.icon}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{a.label}</span>
                </button>
              ))}
            </div>

            <p className="mt-3 truncate rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-center text-[10px] text-[var(--text-muted)]">
              {url}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
