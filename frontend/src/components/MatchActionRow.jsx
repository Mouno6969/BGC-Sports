// ---------------------------------------------------------------------------
// MatchActionRow — hub actions: Watch · Predict · Stats · Party
// Match Center (Stats) is the primary destination; used on score cards,
// World Cup fixtures, and the Match Center page itself.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { buildMatchHubLinks } from '../lib/matchLinks.js';

const ACTIONS = [
  {
    id: 'watch',
    label: 'Watch',
    short: 'Watch',
    primary: false,
    icon: (
      <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
  },
  {
    id: 'predict',
    label: 'Predict',
    short: 'Predict',
    primary: false,
    icon: (
      <span className="text-[11px] leading-none" aria-hidden="true">
        🎯
      </span>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    short: 'Stats',
    primary: true,
    icon: (
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'party',
    label: 'Party',
    short: 'Party',
    primary: false,
    icon: (
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

/**
 * @param {{
 *   match: object,
 *   className?: string,
 *   stopPropagation?: boolean,
 *   compact?: boolean,
 *   hide?: string[],
 *   pitch?: boolean,
 * }} props
 */
export default function MatchActionRow({
  match,
  className = '',
  stopPropagation = true,
  compact = false,
  hide = [],
  pitch = false,
}) {
  if (!match) return null;

  const links = buildMatchHubLinks(match);
  const title = `${match.home || 'Home'} vs ${match.away || 'Away'}`;

  const items = ACTIONS.filter((a) => !hide.includes(a.id)).map((a) => ({
    ...a,
    to: links[a.id] || (a.id === 'stats' ? null : links.watch),
  })).filter((a) => a.to);

  if (!items.length) return null;

  const stop = stopPropagation
    ? (e) => {
        e.stopPropagation();
      }
    : undefined;

  return (
    <div
      role="group"
      aria-label={`Match actions for ${title}`}
      onClick={stop}
      onKeyDown={stop}
      className={[
        'match-action-row mt-3 grid gap-1.5',
        items.length >= 4
          ? 'grid-cols-4'
          : items.length === 3
            ? 'grid-cols-3'
            : items.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-1',
        className,
      ].join(' ')}
    >
      {items.map((action) => {
        const isPrimary = action.primary && links.hasCenter;
        return (
          <Link
            key={action.id}
            to={action.to}
            viewTransition
            data-haptic={isPrimary ? 'medium' : 'selection'}
            onClick={stop}
            aria-label={`${action.label}: ${title}`}
            title={action.label}
            className={[
              'flex min-h-[40px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5',
              'text-[10px] font-extrabold transition-all active:scale-[0.97]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              isPrimary
                ? 'bg-accent text-white shadow-md shadow-accent/20 ring-1 ring-black/10 hover:brightness-110'
                : pitch
                  ? 'border border-white/15 bg-black/35 text-slate-100 hover:border-yellow-500/40 hover:bg-black/50'
                  : 'border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-accent/35 hover:text-[var(--text-primary)]',
              compact ? 'min-h-[36px] py-1' : '',
            ].join(' ')}
          >
            {action.icon}
            <span className={compact ? 'hidden sm:inline' : ''}>
              {compact ? action.short : action.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
