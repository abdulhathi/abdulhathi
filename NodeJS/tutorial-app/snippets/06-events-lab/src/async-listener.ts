import { EventEmitter } from 'node:events';

// Run with "capture" to turn on captureRejections.
const captureRejections = process.argv[2] === 'capture';
const store = new EventEmitter<{ save: [id: string]; error: [error: Error] }>({ captureRejections });

store.on('error', (error) => console.log(`error listener got: ${error.message}`));

// emit() ignores the promise an async listener returns...
store.on('save', async (id) => {
  throw new Error(`could not save ${id}: database unavailable`);
});

store.emit('save', 'task-42');
console.log(`emit returned; captureRejections is ${captureRejections}`);
