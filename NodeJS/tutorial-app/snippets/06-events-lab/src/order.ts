import { EventEmitter } from 'node:events';

// The type argument lists each event name and the arguments its listeners receive.
const bus = new EventEmitter<{ ping: [n: number] }>();

bus.on('ping', (n) => console.log(`A got ${n}`));
bus.on('ping', (n) => console.log(`B got ${n}`));
bus.prependListener('ping', (n) => console.log(`C got ${n} (prepended, so it runs first)`));
bus.once('ping', (n) => console.log(`D got ${n} (once, then removed)`));

console.log('before emit');
const hadListeners = bus.emit('ping', 1);
console.log(`after emit: returned ${hadListeners}, ${bus.listenerCount('ping')} listeners left`);

console.log('--- second emit');
bus.emit('ping', 2);

// off() needs the same function reference that on() received.
function audit(n: number): void {
  console.log(`audit saw ${n}`);
}
bus.on('ping', audit);
console.log('--- with audit');
bus.emit('ping', 3);
bus.off('ping', audit);
console.log('--- audit removed');
bus.emit('ping', 4);

bus.removeAllListeners('ping');
console.log(`--- no listeners: emit returned ${bus.emit('ping', 5)}`);
