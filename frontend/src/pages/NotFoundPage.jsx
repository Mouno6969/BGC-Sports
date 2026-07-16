// ---------------------------------------------------------------------------
// NotFoundPage — 404 screen styled to match the landing page hero language:
// stadium backdrop, gradient accent text, and the standard CTA buttons.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page-container">
      <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-[url('/stadium-bg.jpg')] bg-cover bg-center opacity-50" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-primary)]/85 via-[var(--bg-primary)]/75 to-[var(--bg-primary)]/95" aria-hidden="true" />

        <div className="relative z-10 flex flex-col items-center px-5 py-14 text-center animate-fadeInUp">
          <span className="type-label rounded-full bg-[var(--accent-muted)] px-3 py-1.5 text-[var(--accent-light)] ring-1 ring-[var(--accent)]/25">
            Error 404
          </span>
          <h1 className="type-display mt-5 text-5xl text-[var(--text-primary)] sm:text-6xl">
            Out of <span className="hero-gradient-text">Bounds</span>
          </h1>
          <p className="type-body mt-4 max-w-md text-[var(--text-secondary)]">
            This page doesn&apos;t exist or may have moved. Head back to live sports and streams.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:bg-[var(--accent-dark)] active:scale-[0.97]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Go Home
            </Link>
            <Link
              to="/category/Sports"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--accent-muted)] px-6 py-2.5 text-sm font-bold text-[var(--accent-light)] transition-all hover:bg-[var(--accent)]/20 active:scale-[0.97]"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Browse Sports
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
