// ---------------------------------------------------------------------------
// NotFoundPage — 404, redesigned to match the landing page's stadium scene.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import StadiumGrassScene from '../components/StadiumGrassScene.jsx';

export default function NotFoundPage() {
  return (
    <StadiumGrassScene>
      <div className="page-container flex min-h-[70vh] flex-col items-center justify-center text-center">
        <p className="type-label text-[var(--brand-purple-light)] drop-shadow">Error 404</p>
        <p
          className="type-display mt-2 text-7xl leading-none text-white drop-shadow-lg sm:text-8xl"
          aria-hidden="true"
        >
          40<span className="hero-gradient-text">4</span>
        </p>
        <h1 className="type-h1 mt-4 text-white drop-shadow">
          Offside! <span className="hero-gradient-text">Page not found</span>
        </h1>
        <p className="type-body mt-3 max-w-md text-slate-200/90 drop-shadow">
          This page doesn&apos;t exist or may have moved. Head back to live sports and streams.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" viewTransition className="btn-hero-primary">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Go Home
          </Link>
          <Link to="/category/Sports" viewTransition className="btn-hero-secondary">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Browse Sports
          </Link>
        </div>
      </div>
    </StadiumGrassScene>
  );
}
