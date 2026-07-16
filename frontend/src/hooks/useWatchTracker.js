// ---------------------------------------------------------------------------
// useWatchTracker — records watch time / history while the user is on a
// channel page. Heartbeats while the tab is visible; finalizes on leave.
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';
import {
  startWatchSession,
  heartbeatWatchSession,
  endWatchSession,
  markPartyJoin,
  evaluateBadges,
} from '../lib/watchStats.js';
import { showToast } from '../components/Toast.jsx';

const HEARTBEAT_MS = 25_000;

/**
 * @param {{ name?: string, url?: string, logo?: string, source?: string, slug?: string, group?: string } | null} channel
 * @param {{ isPlaying?: boolean, partyCode?: string }} opts
 */
export default function useWatchTracker(channel, opts = {}) {
  const { isPlaying = true, partyCode = '' } = opts;
  const channelKey = `${channel?.url || ''}|${channel?.name || ''}`;
  const partyMarked = useRef(false);

  // Start / switch session when channel changes
  useEffect(() => {
    if (!channel?.url && !channel?.name) return undefined;

    startWatchSession({
      name: channel.name,
      url: channel.url,
      logo: channel.logo,
      source: channel.source,
      slug: channel.slug,
      group: channel.group,
    });

    return () => {
      const { newly } = endWatchSession();
      if (newly?.length) {
        const b = newly[0];
        showToast(`Badge unlocked: ${b.icon} ${b.name}`, 'success');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);

  // Heartbeat while visible + (playing or unknown)
  useEffect(() => {
    if (!channel?.url && !channel?.name) return undefined;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isPlaying) return;
      heartbeatWatchSession(HEARTBEAT_MS / 1000);
      const newly = evaluateBadges();
      if (newly?.length) {
        const b = newly[0];
        showToast(`Badge unlocked: ${b.icon} ${b.name}`, 'success');
      }
    };

    const id = setInterval(tick, HEARTBEAT_MS);
    // Initial small credit after 15s of watching
    const first = setTimeout(() => {
      if (document.visibilityState === 'visible' && isPlaying) {
        heartbeatWatchSession(15);
      }
    }, 15_000);

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        // soft end — keep session but stop counting until visible
      }
    };
    document.addEventListener('visibilitychange', onVis);

    const onUnload = () => {
      endWatchSession();
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      clearInterval(id);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [channelKey, isPlaying, channel?.url, channel?.name]);

  // Watch Together invite badge
  useEffect(() => {
    if (!partyCode || partyMarked.current) return;
    partyMarked.current = true;
    const newly = markPartyJoin();
    if (newly?.length) {
      const b = newly[0];
      showToast(`Badge unlocked: ${b.icon} ${b.name}`, 'success');
    }
  }, [partyCode]);
}
