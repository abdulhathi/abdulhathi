import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises'; // built-ins: always use the node: prefix
import describe, { area, PI, type Shape } from './lib/math.ts'; // default + named + type-only
import * as math from './lib/math.ts'; // namespace import
import config from './config.json' with { type: 'json' }; // JSON needs an import attribute
import legacy from './legacy.cjs'; // CommonJS: module.exports becomes the default export

const shape: Shape = { kind: 'circle', r: 2 };
console.log(describe(shape), area(1) === PI, Object.keys(math));
console.log(config.port, legacy.greet('Ada'));

// Paths of this module (ESM has no __dirname or __filename).
console.log(import.meta.filename.endsWith('modules.ts'), import.meta.dirname === process.cwd());

// Load a module only when needed; works for ESM and CommonJS.
const { availableParallelism } = await import('node:os');
console.log(`${availableParallelism()} threads can run in parallel`);

// require() inside an ES module, when a CommonJS-only tool needs it.
const require = createRequire(import.meta.url);
console.log(require('./legacy.cjs').greet('Grace'));
console.log((await readFile(new URL('./config.json', import.meta.url), 'utf8')).trim());
