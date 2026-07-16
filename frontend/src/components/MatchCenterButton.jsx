// ---------------------------------------------------------------------------
// MatchCenterButton — thin wrapper kept for backwards compatibility.
// Prefer MatchActionRow (Watch · Predict · Stats · Party) on cards.
// ---------------------------------------------------------------------------
import MatchActionRow from './MatchActionRow.jsx';

/**
 * @param {{ match: object, className?: string, stopPropagation?: boolean }} props
 */
export default function MatchCenterButton({ match, className = '', stopPropagation = true }) {
  return (
    <MatchActionRow
      match={match}
      className={className}
      stopPropagation={stopPropagation}
    />
  );
}
