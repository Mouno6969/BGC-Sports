import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page-container flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="type-label text-[var(--accent)]">Error 404</p>
      <h1 className="type-h1 mt-2 text-[var(--text-primary)]">Page not found</h1>
      <p className="type-body mt-3 max-w-md text-[var(--text-secondary)]">
        This page doesn&apos;t exist or may have moved. Head back to live sports and streams.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          viewTransition
          className="inline-flex min-h-[44px] items-center rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 transition-transform active:scale-[0.97]"
        >
          Go Home
        </Link>
        <Link
          to="/category/Sports"
          viewTransition
          className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-6 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
        >
          Browse Sports
        </Link>
      </div>
    </div>
  );
}