import { capitalize, slugify } from '#lib/index.ts';
import { multiply } from '02-modules-lab/math';
import { describe } from './old-config.cjs';

console.log(capitalize('node.js'), '|', slugify('  Hello, Node.js World! '));
console.log('02-modules-lab/math -> multiply(6, 7) =', multiply(6, 7));
console.log(describe());
