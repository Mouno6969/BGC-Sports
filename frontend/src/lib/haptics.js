// ---------------------------------------------------------------------------
// Haptics — subtle Vibration API feedback for mobile. No-ops on desktop,
// unsupported browsers, or when the user prefers reduced motion.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bgc_haptics';

/** Named patterns (ms). Keep short — feels native, not a phone buzz. */
export const HAPTIC_PATTERNS = {
  light: 8,
  selection: 6,
  medium: 14,
  heavy: 22,
  success: [10, 40, 12],
  warning: [18, 30, 18],
  error: [25, 40, 25, 40, 30],
  /** Pull-to-refresh threshold reached */
  pull: 12,
  /** Pull-to-refresh released / started */
  refresh: [8, 50, 14],
};

let supported = null;

function isSupported() {
  if (supported != null) return supported;
  supported =
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function';
  return supported;
}

function isEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) === '0') return false;
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
  } catch {
    /* ignore */
  }
  // Prefer coarse pointer / no hover = phone-like device
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fineHover && !coarse) return false;
  } catch {
    /* allow vibrate if media queries fail */
  }
  return isSupported();
}

/**
 * Fire a haptic pattern.
 * @param {keyof typeof HAPTIC_PATTERNS | number | number[]} [kind='light']
 */
export function haptic(kind = 'light') {
  if (!isEnabled()) return false;
  let pattern = HAPTIC_PATTERNS[kind] ?? kind;
  if (typeof pattern === 'number') pattern = [pattern];
  if (!Array.isArray(pattern) || !pattern.length) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function hapticLight() {
  return haptic('light');
}

export function hapticSelection() {
  return haptic('selection');
}

export function hapticMedium() {
  return haptic('medium');
}

export function hapticSuccess() {
  return haptic('success');
}

export function hapticPull() {
  return haptic('pull');
}

export function hapticRefresh() {
  return haptic('refresh');
}

export function setHapticsEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getHapticsEnabled() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === '0') return false;
  } catch {
    /* ignore */
  }
  return isEnabled();
}

/**
 * Global capture: light haptic on primary interactive taps (buttons, tabs, links).
 * Safe to call once from main.jsx.
 */
export function installGlobalHaptics() {
  if (typeof document === 'undefined') return () => {};
  if (installGlobalHaptics._installed) return installGlobalHaptics._cleanup;
  installGlobalHaptics._installed = true;

  const SELECTOR = [
    'button',
    'a[href]',
    '[role="button"]',
    '[role="tab"]',
    'input[type="submit"]',
    'input[type="button"]',
    'input[type="reset"]',
    'summary',
    '[data-haptic]',
  ].join(',');

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Keyboard-synthesized clicks still fine via click path
    const el = e.target?.closest?.(SELECTOR);
    if (!el) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.dataset?.haptic === 'off' || el.dataset?.haptic === '0') return;

    const kind = el.dataset?.haptic || el.getAttribute('data-haptic') || 'light';
    // Tabs / segmented controls feel better slightly firmer
    if (el.getAttribute('role') === 'tab' || el.dataset?.hapticTab === '1') {
      haptic('selection');
      return;
    }
    if (kind === 'none' || kind === 'off') return;
    if (HAPTIC_PATTERNS[kind] != null || typeof kind === 'number') {
      haptic(kind);
    } else {
      haptic('light');
    }
  };

  // pointerdown feels more native than click (instant with finger)
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

  const cleanup = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    installGlobalHaptics._installed = false;
  };
  installGlobalHaptics._cleanup = cleanup;
  return cleanup;
}
