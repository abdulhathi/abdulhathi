import { useEffect, useState } from 'react';
import { getLogs } from '../lib/api';

/** The tail of an app's output. Refreshes every 2 s while `live` (the app is starting or running). */
export function Logs({ id, live }: { id: string; live: boolean }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getLogs(id)
        .then((t) => !cancelled && setText(t))
        .catch(() => {});
    load();
    const timer = live ? setInterval(load, 2000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, live]);
  return text.trim() ? (
    <pre className="logs" tabIndex={0} aria-label="App output">
      {text.trim()}
    </pre>
  ) : (
    <p className="muted">No output yet. Output appears here for apps the hub starts.</p>
  );
}
