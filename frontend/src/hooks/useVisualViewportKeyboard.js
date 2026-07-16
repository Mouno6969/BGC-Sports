// ---------------------------------------------------------------------------
// useVisualViewportKeyboard — simple Chrome-first keyboard mode for Watch chat.
//
// Strategy (what actually works on Chrome Android):
//   1. interactive-widget=resizes-content shrinks the layout viewport with the
//      keyboard, so position:fixed; bottom:0 sits above the keyboard for free.
//   2. Detect open mainly by chat input focus (not fragile height math).
//   3. No body { position:fixed }, no visualViewport stage math, no scroll locks
//      that fight Chrome's pan.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

function isChatField(el) {
  if (!el) return false;
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;
  if (el.type === 'file' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'range') {
    return false;
  }
  return Boolean(
    el.closest('[data-chat-root], .chat-panel-root, .chat-panel-composer, [data-party-chat]')
  );
}

/**
 * @param {{ enabled?: boolean }} [options]
 */
export function useVisualViewportKeyboard({ enabled = true } = {}) {
  const [state, setState] = useState({
    keyboardOpen: false,
    pinTop: 0,
    visualHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    visualWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    kbOffset: 0,
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      document.body?.classList?.remove('keyboard-open');
      return undefined;
    }

    let blurTimer = 0;
    let open = false;

    const publishSize = () => {
      const h = window.innerHeight || document.documentElement.clientHeight || 0;
      const w = window.innerWidth || document.documentElement.clientWidth || 0;
      // Keep CSS vars simple for any leftover styles (player height calc)
      const r = document.documentElement.style;
      r.setProperty('--vv-top', '0px');
      r.setProperty('--vv-left', '0px');
      r.setProperty('--vv-height', `${h}px`);
      r.setProperty('--vv-width', `${w}px`);
      r.setProperty('--kb-offset', '0px');
      return { h, w };
    };

    const setOpen = (next) => {
      if (next === open) {
        // Still refresh size while open (Chrome animates keyboard)
        if (next) {
          const { h, w } = publishSize();
          setState((prev) => ({
            ...prev,
            keyboardOpen: true,
            visualHeight: h,
            visualWidth: w,
          }));
        }
        return;
      }
      open = next;
      if (next) {
        document.body.classList.add('keyboard-open');
        const { h, w } = publishSize();
        setState({
          keyboardOpen: true,
          pinTop: 0,
          visualHeight: h,
          visualWidth: w,
          kbOffset: 0,
        });
      } else {
        document.body.classList.remove('keyboard-open');
        const r = document.documentElement.style;
        r.removeProperty('--vv-top');
        r.removeProperty('--vv-left');
        r.removeProperty('--vv-height');
        r.removeProperty('--vv-width');
        r.removeProperty('--kb-offset');
        r.removeProperty('--player-height');
        setState({
          keyboardOpen: false,
          pinTop: 0,
          visualHeight: window.innerHeight || 0,
          visualWidth: window.innerWidth || 0,
          kbOffset: 0,
        });
      }
    };

    const onFocusIn = (e) => {
      if (!isChatField(e.target)) return;
      clearTimeout(blurTimer);
      setOpen(true);
    };

    const onFocusOut = () => {
      clearTimeout(blurTimer);
      // Allow focus to move to send / emoji without closing
      blurTimer = window.setTimeout(() => {
        if (isChatField(document.activeElement)) {
          setOpen(true);
          return;
        }
        setOpen(false);
      }, 120);
    };

    const onResize = () => {
      if (!open) return;
      const { h, w } = publishSize();
      setState((prev) => ({
        ...prev,
        keyboardOpen: true,
        visualHeight: h,
        visualWidth: w,
      }));
    };

    // If user already focused a chat field when this mounts
    if (isChatField(document.activeElement)) setOpen(true);

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      document.body.classList.remove('keyboard-open');
      const r = document.documentElement.style;
      r.removeProperty('--vv-top');
      r.removeProperty('--vv-left');
      r.removeProperty('--vv-height');
      r.removeProperty('--vv-width');
      r.removeProperty('--kb-offset');
      r.removeProperty('--player-height');
    };
  }, [enabled]);

  return state;
}
