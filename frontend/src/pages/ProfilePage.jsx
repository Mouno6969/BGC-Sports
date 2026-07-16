// ---------------------------------------------------------------------------
// ProfilePage — full-page profile with watch history, favorites, badges.
// Redesigned to match the landing page: stadium backdrop + glass container.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import ProfileHub from '../components/ProfileHub.jsx';
import StadiumGrassScene from '../components/StadiumGrassScene.jsx';

export default function ProfilePage() {
  return (
    <StadiumGrassScene>
      <div className="page-container max-w-2xl py-4 md:py-8">
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <Link
            to="/"
            viewTransition
            className="text-xs font-bold text-[var(--brand-purple-light)] hover:text-white drop-shadow"
          >
            ← Home
          </Link>
          <h1 className="font-display text-sm font-bold text-slate-300 uppercase tracking-wider drop-shadow">
            Profile
          </h1>
          <span className="w-12" />
        </div>
        <div className="scene-card p-4 sm:p-6">
          <ProfileHub />
        </div>
        <div className="h-20 md:h-4" />
      </div>
    </StadiumGrassScene>
  );
}
