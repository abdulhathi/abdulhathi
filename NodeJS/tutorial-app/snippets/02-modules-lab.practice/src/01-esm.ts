import formatPrice from './lib/format.ts'; // default import: any name works
import { add, multiply as times } from './lib/math.ts'; // named, one renamed
import * as math from './lib/math.ts'; // namespace object
import { count, increment } from './lib/counter.ts';
import { circleArea } from './lib/index.ts'; // through the barrel

console.log('add(2, 3) =', add(2, 3));
console.log('times(4, 5) =', times(4, 5));
console.log('math.PI =', math.PI, '| exports:', Object.keys(math).join(', '));
console.log('circleArea(2) =', circleArea(2));
console.log('formatPrice(1234.5) =', formatPrice(1234.5));

console.log('count before:', count);
increment();
increment();
console.log('count after two increments:', count); // live binding: 2

// Imports are read-only views. Uncomment to see the error:
// count = 10;
