// ---------------------------------------------------------------------------
// ProfilePage — full-page profile with watch history, favorites, badges.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import ProfileHub from '../components/ProfileHub.jsx';

export default function ProfilePage() {
  return (
    <div className="page-container max-w-2xl py-4 md:py-8">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <Link
          to="/"
          className="text-xs font-bold text-accent hover:text-accent-light"
        >
          ← Home
        </Link>
        <h1 className="font-display text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Profile
        </h1>
        <span className="w-12" />
      </div>
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <ProfileHub />
      </div>
      <div className="h-20 md:h-4" />
    </div>
  );
}
