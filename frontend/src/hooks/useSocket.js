// ---------------------------------------------------------------------------
// useSocket — exposes the shared socket and its connection status.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { socket } from '../lib/socket.js';

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, connected };
}
