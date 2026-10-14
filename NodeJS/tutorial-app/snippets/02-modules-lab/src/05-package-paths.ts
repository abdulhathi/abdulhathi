import { add } from '#lib/math.ts'; // subpath import, mapped in package.json "imports"
import { circleArea } from '02-modules-lab'; // this package's own "exports"

console.log('#lib/math.ts       -> add(10, 5) =', add(10, 5));
console.log("'02-modules-lab'   -> circleArea(1) =", circleArea(1));
console.log('#lib/math.ts lives at', import.meta.resolve('#lib/math.ts'));
