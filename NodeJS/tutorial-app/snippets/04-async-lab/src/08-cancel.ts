import { setTimeout as sleep } from 'node:timers/promises';
import { since } from './lib/timing.ts';

// A cancellable task: it accepts a signal and passes it on to everything it awaits.
async function generateReport(signal: AbortSignal): Promise<string> {
  for (let page = 1; page <= 5; page++) {
    await sleep(100, undefined, { signal }); // rejects at once if the signal aborts
    console.log(`  page ${page} done`);
  }
  return 'report ready';
}

// timers/promises rejects with an AbortError whose `cause` is the signal's reason.
function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? ` (cause: ${err.cause.name}: ${err.cause.message})` : '';
  return `${err.name}${cause}`;
}

// 1. Cancel by hand with an AbortController.
const controller = new AbortController();
setTimeout(() => controller.abort(), 250);
let start = performance.now();
try {
  await generateReport(controller.signal);
} catch (err) {
  console.log('manual abort ->', describe(err), since(start));
}

// 2. A deadline: AbortSignal.timeout() aborts by itself.
start = performance.now();
try {
  await generateReport(AbortSignal.timeout(150));
} catch (err) {
  console.log('timeout ->', describe(err), since(start));
}

// 3. Whichever comes first: the user cancels, or the deadline passes.
const userCancel = new AbortController();
const signal = AbortSignal.any([userCancel.signal, AbortSignal.timeout(1_000)]);
setTimeout(() => userCancel.abort(new Error('user pressed cancel')), 120);
start = performance.now();
try {
  await generateReport(signal);
} catch (err) {
  console.log('any ->', describe(err), since(start));
}

// 4. Your own code can react too: check the signal, or listen for 'abort'.
const done = new AbortController();
done.signal.addEventListener('abort', () => console.log('abort listener ran, reason:', done.signal.reason), { once: true });
done.abort('shutting down');
try {
  done.signal.throwIfAborted();
} catch (reason) {
  console.log('throwIfAborted threw the reason:', reason);
}
