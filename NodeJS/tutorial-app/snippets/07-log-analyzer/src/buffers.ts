import { StringDecoder } from 'node:string_decoder';

// 1. A Buffer is a fixed-length sequence of bytes. Text must be encoded into bytes.
const word = Buffer.from('café', 'utf8');
console.log(word);
console.log(`'café' has ${'café'.length} characters but ${word.length} bytes: é needs two`);
console.log(`hex:    ${word.toString('hex')}`);
console.log(`base64: ${word.toString('base64')}`);
console.log(`decode: ${Buffer.from('Y2Fmw6k=', 'base64').toString('utf8')}`);

// 2. Binary data: a 6-byte header with a 2-letter tag and a 32-bit number.
const header = Buffer.alloc(6); // six zero bytes
header.write('NL', 0, 'ascii');
header.writeUInt32BE(2026, 2);
console.log(header, '->', header.toString('ascii', 0, 2), header.readUInt32BE(2));

// 3. subarray() is a view onto the same memory. Buffer.from(buffer) copies.
const view = word.subarray(0, 3);
view[0] = 0x43; // the byte for 'C'
const copy = Buffer.from(word);
copy[0] = 0x58; // 'X'
console.log(`original: ${word.toString()}, view: ${view.toString()}, copy: ${copy.toString()}`);

// 4. Joining buffers.
console.log(Buffer.concat([Buffer.from('Node '), Buffer.from('24')]).toString());

// 5. A chunk boundary can split a character: é is c3 a9, split here into two chunks.
const chunks = [word.subarray(0, 4), word.subarray(4)];
console.log(`naive:   ${chunks.map((chunk) => chunk.toString('utf8')).join('')}`);
const decoder = new StringDecoder('utf8');
console.log(`decoder: ${chunks.map((chunk) => decoder.write(chunk)).join('')}${decoder.end()}`);
