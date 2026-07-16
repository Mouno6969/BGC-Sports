// ---------------------------------------------------------------------------
// Skeleton placeholders — content-shaped shimmer loaders used app-wide.
// Prefer these over spinners so layouts stay stable while data loads.
// ---------------------------------------------------------------------------

/** Base shimmer block. Pass className for size/shape. */
export function Skeleton({ className = '', rounded = 'rounded', style }) {
  return (
    <div
      className={`skeleton ${rounded} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Repeat children `count` times with unique keys. */
export function SkeletonList({ count = 4, children }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={`sk-${i}`}>{typeof children === 'function' ? children(i) : children}</div>
  ));
}

// ── Channel tiles (home / category / FIFA grid) ────────────────────────────

export function ChannelCardSkeleton({ pitch = false }) {
  return (
    <div className={`${pitch ? 'pitch-card' : 'card-sports'} overflow-hidden`} aria-hidden="true">
      <Skeleton className="aspect-[4/3] w-full" rounded="rounded-none" />
      <div className="space-y-2 p-3 sm:p-4">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-14" rounded="rounded-md" />
          <Skeleton className="h-5 w-16" rounded="rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function ChannelGridSkeleton({ count = 8, pitch = false, className = 'channel-grid' }) {
  return (
    <div className={className} role="status" aria-label="Loading channels">
      {Array.from({ length: count }).map((_, i) => (
        <ChannelCardSkeleton key={i} pitch={pitch} />
      ))}
    </div>
  );
}

// ── Match / score cards ───────────────────────────────────────────────────

export function MatchCardSkeleton({ worldCup = false }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        worldCup
          ? 'border-yellow-500/10 bg-[var(--bg-card)]'
          : 'border-[var(--border-primary)] bg-[var(--bg-card)]'
      }`}
      aria-hidden="true"
    >
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-14" rounded="rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <Skeleton className={worldCup ? 'h-10 w-10' : 'h-8 w-8'} rounded="rounded-full" />
          <Skeleton className="h-3 w-14" />
        </div>
        <Skeleton className={worldCup ? 'h-9 w-16' : 'h-8 w-14'} rounded="rounded-lg" />
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <Skeleton className={worldCup ? 'h-10 w-10' : 'h-8 w-8'} rounded="rounded-full" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      <div className="mt-3 border-t border-[var(--border-primary)]/50 pt-2">
        <Skeleton className="h-2.5 w-2/3" />
      </div>
    </div>
  );
}

export function MatchGridSkeleton({ count = 8, worldCup = false }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading matches"
    >
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} worldCup={worldCup} />
      ))}
    </div>
  );
}

// ── Live score ticker ─────────────────────────────────────────────────────

export function ScoreTickerItemSkeleton() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-r border-[var(--border-primary)] px-4 py-1" aria-hidden="true">
      <Skeleton className="h-3 w-8" rounded="rounded-sm" />
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-5 w-10" rounded="rounded" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

export function ScoreTickerSkeleton() {
  return (
    <div
      className="live-score-ticker relative z-[5] w-full overflow-hidden border-b border-[var(--border-primary)] bg-[var(--bg-primary)]"
      role="status"
      aria-label="Loading live scores"
    >
      <div className="flex items-center">
        <div className="flex shrink-0 items-center gap-1.5 border-r border-[var(--border-primary)] bg-red-500/10 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-red-500/50" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400/70 whitespace-nowrap">
            Live Scores
          </span>
        </div>
        <div className="flex min-w-0 flex-1 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <ScoreTickerItemSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Prediction cards ──────────────────────────────────────────────────────

export function PredictionCardSkeleton() {
  return (
    <div className="rounded-xl border border-accent/15 bg-accent/5 p-4" aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-16" rounded="rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 flex-col items-center gap-1">
          <Skeleton className="h-9 w-9" rounded="rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" rounded="rounded-lg" />
          <Skeleton className="h-6 w-8" />
          <Skeleton className="h-8 w-8" rounded="rounded-lg" />
        </div>
        <div className="flex flex-1 flex-col items-center gap-1">
          <Skeleton className="h-9 w-9" rounded="rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-full" rounded="rounded-lg" />
    </div>
  );
}

export function PredictionGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" role="status" aria-label="Loading predictions">
      {Array.from({ length: count }).map((_, i) => (
        <PredictionCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-3 py-2.5" aria-hidden="true">
      <Skeleton className="h-5 w-8" />
      <Skeleton className="h-8 w-8" rounded="rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2.5 w-36" />
      </div>
      <Skeleton className="h-6 w-10" />
    </div>
  );
}

// ── Video player ──────────────────────────────────────────────────────────

export function PlayerSkeleton({ label = 'Loading stream…' }) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-ink-900 via-ink-950 to-black"
      role="status"
      aria-label={label}
    >
      {/* Fake control chrome so it looks like a player shell */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
      </div>
      <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-4 px-6">
        <Skeleton className="h-14 w-14" rounded="rounded-2xl" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-24" />
      </div>
      <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center gap-3">
        <Skeleton className="h-8 w-8" rounded="rounded-full" />
        <Skeleton className="h-1.5 flex-1" rounded="rounded-full" />
        <Skeleton className="h-8 w-8" rounded="rounded-full" />
        <Skeleton className="h-8 w-8" rounded="rounded-full" />
      </div>
    </div>
  );
}

// ── Watch page layout ─────────────────────────────────────────────────────

export function WatchPageSkeleton() {
  // Carry shared-element name so card → player morph still lands if the
  // watch chunk is still loading (Suspense fallback).
  const mediaStyle =
    typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
      ? { viewTransitionName: 'channel-media' }
      : undefined;

  return (
    <div className="page-container max-w-[1600px] py-0 md:py-4 !px-0 md:!px-4 lg:!px-6" role="status" aria-label="Loading watch page">
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div
            className="player-container relative aspect-video w-full overflow-hidden rounded-none bg-black sm:rounded-xl"
            style={mediaStyle}
          >
            <PlayerSkeleton />
          </div>
          <div className="mx-3 flex items-center justify-between gap-3 sm:mx-0">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-20" rounded="rounded-lg" />
          </div>
          <div className="mx-3 overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 sm:mx-0 lg:hidden">
            <Skeleton className="mb-3 h-9 w-full" rounded="rounded-lg" />
            <Skeleton className="h-32 w-full" rounded="rounded-xl" />
          </div>
        </div>
        <aside className="hidden w-[380px] shrink-0 lg:block">
          <div className="sticky top-[88px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
            <Skeleton className="mb-3 h-10 w-full" rounded="rounded-lg" />
            <Skeleton className="mb-2 h-24 w-full" rounded="rounded-xl" />
            <Skeleton className="h-40 w-full" rounded="rounded-xl" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function RelatedChannelSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2" aria-hidden="true">
      <Skeleton className="h-8 w-10 shrink-0" rounded="rounded" />
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2 w-10" />
      </div>
    </div>
  );
}

// ── Chat / party panels ───────────────────────────────────────────────────

export function PanelSkeleton() {
  return (
    <div className="space-y-3 p-2" role="status" aria-label="Loading panel">
      <Skeleton className="h-9 w-full" rounded="rounded-lg" />
      <Skeleton className="h-20 w-full" rounded="rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-4/5" rounded="rounded-lg" />
        <Skeleton className="ml-auto h-10 w-3/5" rounded="rounded-lg" />
        <Skeleton className="h-10 w-2/3" rounded="rounded-lg" />
      </div>
    </div>
  );
}

export function GifGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="status" aria-label="Loading GIFs">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full" rounded="rounded-md" />
      ))}
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────

export function ProfileSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12" rounded="rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" rounded="rounded-xl" />
    </div>
  );
}

// ── Section shells (home tabs) ────────────────────────────────────────────

export function ScoresSectionSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading scores">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" rounded="rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2.5 w-48" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-12" rounded="rounded-full" />
          <Skeleton className="h-6 w-14" rounded="rounded-full" />
          <Skeleton className="h-6 w-16" rounded="rounded-full" />
        </div>
      </div>
      <MatchGridSkeleton count={8} />
    </div>
  );
}

export function WorldCupSectionSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading World Cup">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10" rounded="rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2.5 w-56" />
        </div>
      </div>
      <div className="channel-grid mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ChannelCardSkeleton key={i} pitch />
        ))}
      </div>
      <MatchGridSkeleton count={6} worldCup />
    </div>
  );
}

export function PredictionSectionSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading predictions">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" rounded="rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-2.5 w-52" />
          </div>
        </div>
        <Skeleton className="h-14 w-24" rounded="rounded-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" rounded="rounded-full" />
        <Skeleton className="h-6 w-24" rounded="rounded-full" />
        <Skeleton className="h-6 w-20" rounded="rounded-full" />
      </div>
      <PredictionGridSkeleton count={4} />
    </div>
  );
}

/** Full-page route Suspense fallback */
export function PageSkeleton({ variant = 'home' }) {
  if (variant === 'watch') return <WatchPageSkeleton />;
  if (variant === 'match') {
    return (
      <div className="page-container max-w-5xl space-y-4 py-4" role="status" aria-label="Loading match">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
        <Skeleton className="h-24 w-full" rounded="rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MatchCardSkeleton worldCup />
          <MatchCardSkeleton worldCup />
        </div>
      </div>
    );
  }
  if (variant === 'profile') {
    return (
      <div className="page-container max-w-2xl py-6">
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6">
          <ProfileSkeleton />
        </div>
      </div>
    );
  }
  if (variant === 'category') {
    return (
      <div className="page-container space-y-6">
        <Skeleton className="h-28 w-full" rounded="rounded-2xl" />
        <Skeleton className="h-10 w-full" rounded="rounded-xl" />
        <ChannelGridSkeleton count={10} />
      </div>
    );
  }
  // home-ish default
  return (
    <div className="page-container space-y-6 py-6" role="status" aria-label="Loading page">
      <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
      <ChannelGridSkeleton count={8} />
    </div>
  );
}

export function OfflineAltSkeleton({ count = 3 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading alternatives">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" rounded="rounded-xl" />
      ))}
    </div>
  );
}

export function FabChannelListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading channels">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] p-2">
          <Skeleton className="h-10 w-12" rounded="rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
