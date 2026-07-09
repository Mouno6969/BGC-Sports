// ---------------------------------------------------------------------------
// UserAvatar — small circular avatar used across chat, rooms, and call tiles.
// Shows the profile picture when available, otherwise a colored initial.
// If the picture fails to load, we fall back to the colored initial instead
// of leaving empty space.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

const SIZE_CLASSES = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-12 w-12 text-lg',
};

export default function UserAvatar({ name, avatar, color, size = 'md', className = '' }) {
  const [imgError, setImgError] = useState(false);
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const initial = (name || 'G').charAt(0).toUpperCase();

  // Reset the error flag whenever the avatar source changes so a new
  // (potentially valid) image gets a fresh chance to load.
  useEffect(() => {
    setImgError(false);
  }, [avatar]);

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt={name || 'User avatar'}
        className={`${sizeCls} shrink-0 rounded-full object-cover ring-1 ring-black/20 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={`${sizeCls} flex shrink-0 items-center justify-center rounded-full font-bold text-black ${className}`}
      style={{ backgroundColor: color || '#22c55e' }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
