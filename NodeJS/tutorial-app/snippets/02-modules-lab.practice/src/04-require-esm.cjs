// Node 24 lets CommonJS require() an ES module...
const math = require('./lib/math.ts');
console.log('require(esm) works:', math.add(1, 2));

// ...unless that module uses top-level await, because require() cannot wait.
try {
  require('./lib/tla.ts');
} catch (err) {
  console.log('require() of a module with top-level await fails:', err.code);
}
