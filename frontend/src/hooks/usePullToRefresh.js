// ---------------------------------------------------------------------------
// usePullToRefresh — mobile pull-to-refresh with haptic threshold + complete.
// Only arms at the top of the page; shows progress for a custom indicator.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticPull, hapticRefresh, hapticSuccess } from '../lib/haptics.js';

const THRESHOLD_PX = 78;
const MAX_PULL_PX = 130;
/** Keep the spinner visible long enough to feel intentional */
const MIN_REFRESH_MS = 700;

/**
 * @param {() => void | Promise<void>} onRefresh
 * @param {{ enabled?: boolean, threshold?: number }} opts
 */
export default function usePullToRefresh(onRefresh, opts = {}) {
  const { enabled = true, threshold = THRESHOLD_PX } = opts;
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const tracking = useRef(false);
  const armed = useRef(false);
  const distRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const reset = useCallback(() => {
    tracking.current = false;
    armed.current = false;
    distRef.current = 0;
    setPulling(false);
    setPullDistance(0);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const coarse =
      window.matchMedia?.('(pointer: coarse)').matches ||
      'ontouchstart' in window;
    if (!coarse) return undefined;

    // Skip if user prefers reduced motion — still allow refresh, but
    // indicator CSS will be calmer; gesture stays.
    const getScrollTop = () =>
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const onTouchStart = (e) => {
      if (refreshingRef.current) return;
      if (getScrollTop() > 4) return;
      // Don't steal gestures from interactive scroll areas mid-scroll
      if (!e.touches?.[0]) return;
      // Ignore multi-touch
      if (e.touches.length > 1) return;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
      armed.current = false;
      distRef.current = 0;
    };

    const onTouchMove = (e) => {
      if (!tracking.current || refreshingRef.current) return;
      if (getScrollTop() > 4) {
        reset();
        return;
      }
      const y = e.touches[0].clientY;
      const delta = y - startY.current;
      if (delta <= 8) {
        // small movement — not a pull yet
        if (delta <= 0) {
          distRef.current = 0;
          setPullDistance(0);
          setPulling(false);
        }
        return;
      }
      // Rubber-band resistance
      const dist = Math.min(MAX_PULL_PX, (delta - 8) * 0.5);
      distRef.current = dist;
      setPullDistance(dist);
      setPulling(true);

      if (dist >= threshold && !armed.current) {
        armed.current = true;
        hapticPull();
      } else if (dist < threshold * 0.82) {
        armed.current = false;
      }
    };

    const onTouchEnd = async () => {
      if (!tracking.current) return;
      const shouldRefresh = armed.current && distRef.current >= threshold * 0.88;
      tracking.current = false;

      if (!shouldRefresh) {
        reset();
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      setPullDistance(threshold * 0.7);
      setPulling(true);
      hapticRefresh();

      const started = Date.now();
      try {
        await Promise.resolve(onRefreshRef.current?.());
        hapticSuccess();
      } catch {
        /* ignore refresh errors — toast handled by caller */
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < MIN_REFRESH_MS) {
          await new Promise((r) => setTimeout(r, MIN_REFRESH_MS - elapsed));
        }
        refreshingRef.current = false;
        setRefreshing(false);
        reset();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', reset);
    };
  }, [enabled, threshold, reset]);

  return {
    pulling,
    pullDistance,
    refreshing,
    progress: Math.min(1, pullDistance / threshold),
  };
}
