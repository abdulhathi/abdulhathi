import { setTimeout as sleep } from 'node:timers/promises';

async function saveAuditLog(): Promise<void> {
  await sleep(50);
  throw new Error('audit service is down');
}

try {
  saveAuditLog(); // missing await: the rejection escapes this try/catch
  console.log('request finished');
} catch (err) {
  console.log('never reached', err);
}
