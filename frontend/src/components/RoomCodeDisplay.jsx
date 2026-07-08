// ---------------------------------------------------------------------------
// RoomCodeDisplay — prominent, copy-friendly room code banner
// ---------------------------------------------------------------------------

export default function RoomCodeDisplay({ code, onCopy, copied = false, className = '' }) {
  if (!code) return null;

  return (
    <div
      className={`rounded-xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-muted)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] px-4 py-3.5 shadow-[0_0_24px_rgba(16,185,129,0.08)] ${className}`}
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="type-label text-[var(--text-muted)]">Share this code or copy the invite link</p>
          <p
            className="room-code-value mt-1.5 text-[var(--accent-light)]"
            aria-label={`Room code ${code}`}
          >
            {code}
          </p>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 self-center rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.98] sm:self-auto"
          aria-label="Copy room code"
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
              Copy Invite
            </>
          )}
        </button>
      </div>
    </div>
  );
}