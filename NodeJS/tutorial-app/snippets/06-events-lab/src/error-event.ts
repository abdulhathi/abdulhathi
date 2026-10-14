import { EventEmitter } from 'node:events';

type UploadEvents = { error: [error: Error] };

const careful = new EventEmitter<UploadEvents>();
careful.on('error', (error) => console.log(`handled: ${error.message}`));
careful.emit('error', new Error('disk full'));

const careless = new EventEmitter<UploadEvents>();
console.log('emitting error with no listener...');
careless.emit('error', new Error('network down'));
console.log('this line never runs');
