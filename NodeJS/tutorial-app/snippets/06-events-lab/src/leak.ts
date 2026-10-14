import { EventEmitter } from 'node:events';

// A long-lived, shared emitter: think "settings changed" for the whole app.
const settings = new EventEmitter<{ change: [key: string] }>();

// Bug: every request subscribes, and nothing ever unsubscribes.
function handleRequestLeaky(id: number): void {
  settings.on('change', (key) => console.log(`request ${id} saw ${key} change`));
}

// Fix: unsubscribe when the request is finished.
function handleRequestFixed(id: number): () => void {
  const onChange = (key: string) => console.log(`request ${id} saw ${key} change`);
  settings.on('change', onChange);
  return () => settings.off('change', onChange);
}

for (let id = 1; id <= 11; id++) handleRequestLeaky(id);
console.log(`after 11 leaky requests: ${settings.listenerCount('change')} listeners`);

settings.removeAllListeners('change');
for (let id = 1; id <= 11; id++) {
  const finish = handleRequestFixed(id);
  finish(); // in a server: when the response has been sent
}
console.log(`after 11 fixed requests: ${settings.listenerCount('change')} listeners`);
