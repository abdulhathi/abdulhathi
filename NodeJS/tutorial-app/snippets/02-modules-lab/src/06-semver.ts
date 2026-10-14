import semver from 'semver'; // a CommonJS package from npm, imported into ESM

const versions = ['1.2.3', '1.2.9', '1.3.0', '1.9.0', '2.0.0'];
const ranges = ['1.2.3', '~1.2.3', '^1.2.3', '>=1.3.0 <2.0.0', '*'];

for (const range of ranges) {
  const matches = versions.filter((v) => semver.satisfies(v, range));
  console.log(`${range.padEnd(15)} accepts ${matches.join(', ')}`);
}

// Before 1.0.0, a minor bump may break things, so ^ is stricter.
const early = ['0.2.3', '0.2.9', '0.3.0'];
console.log(`${'^0.2.3'.padEnd(15)} accepts ${early.filter((v) => semver.satisfies(v, '^0.2.3')).join(', ')}`);

console.log('\nnewest 1.x:', semver.maxSatisfying(versions, '^1.0.0'));
console.log('2.0.0 > 1.9.0:', semver.gt('2.0.0', '1.9.0'));
console.log('1.9.0 + minor:', semver.inc('1.9.0', 'minor'));
