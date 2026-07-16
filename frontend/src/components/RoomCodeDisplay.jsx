// ---------------------------------------------------------------------------
// RoomCodeDisplay — room code + deep-link invite actions
// ---------------------------------------------------------------------------

export default function RoomCodeDisplay({
  code,
  inviteUrl = '',
  onCopy,
  onShare,
  copied = false,
  className = '',
}) {
  if (!code) return null;

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div
      className={`rounded-xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-muted)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] px-4 py-3.5 shadow-[0_0_24px_rgba(16,185,129,0.08)] ${className}`}
    >
      <div className="flex flex-col items-stretch gap-3">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="type-label text-[var(--text-muted)]">Watch Together invite</p>
            <p
              className="room-code-value mt-1.5 text-[var(--accent-light)]"
              aria-label={`Room code ${code}`}
            >
              {code}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 sm:justify-end">
            {canNativeShare && onShare && (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--bg-secondary)] px-4 py-2.5 text-sm font-bold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/10 active:scale-[0.98]"
                aria-label="Share invite link"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            )}
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.98]"
              aria-label="Copy invite link"
            >
              {copied ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy link
                </>
              )}
            </button>
          </div>
        </div>

        {inviteUrl ? (
          <p
            className="truncate rounded-lg bg-black/20 px-2.5 py-1.5 font-mono text-[10px] text-[var(--text-muted)]"
            title={inviteUrl}
          >
            {inviteUrl.replace(/^https?:\/\//, '')}
          </p>
        ) : (
          <p className="text-[10px] text-[var(--text-muted)] text-center sm:text-left">
            Friends open the link to land on this channel with the party pre-joined.
          </p>
        )}
      </div>
    </div>
  );
}