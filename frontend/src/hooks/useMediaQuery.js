import { useState, useEffect } from 'react';

function getMatches(query) {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/**
 * Subscribe to a CSS media query. Initializes from the current viewport so
 * the first paint is correct (critical for desktop-only UI like the watch
 * sidebar — starting at `false` left desktop users with no Live / Party /
 * Chat / AI panel while the mobile panel stayed `lg:hidden`).
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);

    // Sync immediately (covers query changes and late layout)
    onChange();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    // Legacy Safari
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [query]);

  return matches;
}
