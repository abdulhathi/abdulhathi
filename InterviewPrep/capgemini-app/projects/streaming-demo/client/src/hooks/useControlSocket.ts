import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlChannel, type ChannelStatus, type ControlReply, type ControlRequest } from '../lib/control';

/** Opens the run's control socket while `active` (the run is still going) and closes it afterwards. */
export function useControlSocket(runId: string | null, token: string, active: boolean) {
  const [status, setStatus] = useState<ChannelStatus | 'idle'>('idle');
  const channel = useRef<ControlChannel | null>(null);

  useEffect(() => {
    if (!runId || !active) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ch = new ControlChannel({ url: `${scheme}://${location.host}/api/runs/${runId}/control`, token, onStatus: setStatus });
    channel.current = ch;
    ch.start();
    return () => {
      ch.stop();
      channel.current = null;
      setStatus('idle');
    };
  }, [runId, token, active]);

  const request = useCallback(
    (body: ControlRequest): Promise<ControlReply> => channel.current?.request(body) ?? Promise.reject(new Error('control socket is not open')),
    [],
  );

  return { status, request };
}
