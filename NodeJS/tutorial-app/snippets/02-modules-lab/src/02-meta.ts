import { readFile } from 'node:fs/promises';
import path from 'node:path';
import config from './config.json' with { type: 'json' };

console.log('config.appName:', config.appName, '| maxItems:', config.maxItems);

console.log('import.meta.url:     ', import.meta.url);
console.log('import.meta.filename:', import.meta.filename);
console.log('import.meta.dirname: ', import.meta.dirname);
console.log('import.meta.resolve: ', import.meta.resolve('./lib/math.ts'));

// Top-level await: the module pauses here; anything importing it waits too.
const raw = await readFile(path.join(import.meta.dirname, 'config.json'), 'utf8');
console.log('config.json on disk is', raw.length, 'bytes');

// Dynamic import(): load a module only when, and if, it is needed.
if (process.argv.includes('--price')) {
  const { default: formatPrice } = await import('./lib/format.ts');
  console.log('loaded format.ts on demand:', formatPrice(99, 'USD'));
} else {
  console.log('run with --price to load format.ts on demand');
}
