// ---------------------------------------------------------------------------
// profile.js — Optional client-side user profile (no accounts required).
//
// The profile is entirely optional and stored in localStorage. Users can set:
//   - displayName     shown in chat rooms, watch parties, and call tiles
//   - avatar          small compressed base64 image (data URL)
//   - dob             date of birth (YYYY-MM-DD)
//   - address         free-text address
//   - bio             short bio
//
// Users who don't set a display name keep their auto-generated guest name
// (e.g. "SwiftFalcon42"), which is created lazily and persisted so the same
// guest identity is reused across visits.
// ---------------------------------------------------------------------------

const PROFILE_KEY = 'bgc_profile';
const GUEST_NAME_KEY = 'bgc_guest_name';
const PREDICTOR_ID_KEY = 'bgc_predictor_id';
const PROFILE_EVENT = 'bgc:profile-updated';

export const MAX_NAME_LEN = 24;
export const MAX_ADDRESS_LEN = 120;
export const MAX_BIO_LEN = 200;

// Mirrors the backend identity generator so guest names look consistent.
const ADJECTIVES = [
  'Swift', 'Mighty', 'Clutch', 'Golden', 'Rapid', 'Bold', 'Epic', 'Prime',
  'Turbo', 'Stealth', 'Cosmic', 'Blazing', 'Iron', 'Nova', 'Vivid', 'Royal',
];
const NOUNS = [
  'Striker', 'Falcon', 'Captain', 'Ranger', 'Tiger', 'Comet', 'Viper', 'Phoenix',
  'Hawk', 'Maverick', 'Champion', 'Rocket', 'Panther', 'Bolt', 'Titan', 'Ace',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a random guest username like "SwiftFalcon42". */
export function generateGuestName() {
  const n = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${n}`;
}

/**
 * Return the persisted guest name, creating one on first use so the same
 * auto-generated identity sticks across page loads.
 */
export function getGuestName() {
  try {
    let name = localStorage.getItem(GUEST_NAME_KEY);
    if (!name) {
      name = generateGuestName();
      localStorage.setItem(GUEST_NAME_KEY, name);
    }
    return name;
  } catch {
    return generateGuestName();
  }
}

const EMPTY_PROFILE = Object.freeze({
  displayName: '',
  avatar: '',
  dob: '',
  address: '',
  bio: '',
});

/** Read the saved profile (always returns a full object). */
export function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    const parsed = JSON.parse(raw);
    return { ...EMPTY_PROFILE, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

/** Persist the profile and notify listeners (same-tab live updates). */
export function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  next.displayName = String(next.displayName || '').replace(/[<>]/g, '').trim().slice(0, MAX_NAME_LEN);
  next.address = String(next.address || '').replace(/[<>]/g, '').trim().slice(0, MAX_ADDRESS_LEN);
  next.bio = String(next.bio || '').replace(/[<>]/g, '').trim().slice(0, MAX_BIO_LEN);
  next.dob = String(next.dob || '').slice(0, 10);
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy errors */
  }
  emitProfileUpdated(next);
  return next;
}

/** Remove the profile entirely (reverts to guest identity). */
export function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
  emitProfileUpdated({ ...EMPTY_PROFILE });
  return { ...EMPTY_PROFILE };
}

/** True if the user filled in a display name (i.e. not a guest). */
export function hasProfile() {
  return Boolean(getProfile().displayName);
}

/**
 * The name to use everywhere: the profile display name if set,
 * otherwise the persisted auto-generated guest name.
 */
export function getEffectiveName() {
  const { displayName } = getProfile();
  return displayName || getGuestName();
}

/** The avatar data URL if set, else empty string. */
export function getEffectiveAvatar() {
  return getProfile().avatar || '';
}

/**
 * Stable anonymous id for the prediction leaderboard (no account required).
 * Persisted in localStorage so points accumulate across visits on this device.
 */
export function getPredictorId() {
  try {
    let id = localStorage.getItem(PREDICTOR_ID_KEY);
    if (id && /^[a-zA-Z0-9_-]{8,64}$/.test(id)) return id;
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    id = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    localStorage.setItem(PREDICTOR_ID_KEY, id);
    return id;
  } catch {
    return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ---- change notifications (same tab) --------------------------------------

function emitProfileUpdated(profile) {
  try {
    window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: profile }));
  } catch {
    /* ignore */
  }
}

/** Subscribe to profile changes; returns an unsubscribe function. */
export function onProfileChange(handler) {
  const listener = (e) => handler(e.detail || getProfile());
  window.addEventListener(PROFILE_EVENT, listener);
  // Cross-tab updates via the storage event.
  const storageListener = (e) => {
    if (e.key === PROFILE_KEY) handler(getProfile());
  };
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(PROFILE_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}

// ---- avatar helpers --------------------------------------------------------

/**
 * Read an image File, downscale it to a small square, and return a compressed
 * base64 JPEG data URL suitable for sending over the socket (~5-15 KB).
 */
export function fileToCompressedAvatar(file, size = 96, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          // Cover-crop to a centered square.
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          reject(err);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Age in whole years from a YYYY-MM-DD date of birth, or null. */
export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
