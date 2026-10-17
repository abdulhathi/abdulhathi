// Find the employees whose value is 40 and print their names.
// Run: node find-employees.mjs
import assert from 'node:assert/strict';

const employees = [
  { name: 'Abdul', value: 35 },
  { name: 'Abdul1', value: 40 },
  { name: 'Abdul2', value: 40 },
  { name: 'Abdul3', value: 36 },
  { name: 'Abdul4', value: 37 },
];

// 1. The direct answer: keep the matches, then print each one.
employees
  .filter((employee) => employee.value === 40)
  .forEach((employee) => console.log(employee.name));

// 2. Only the first match: find stops at the first hit and returns undefined when nothing matches.
const firstMatch = employees.find((employee) => employee.value === 40);
console.log(firstMatch?.name ?? 'No employee found');

// 3. As a reusable function that returns the names instead of printing them, so it can be tested.
function namesWithValue(list, target) {
  return list.filter((employee) => employee.value === target).map((employee) => employee.name);
}

console.log(namesWithValue(employees, 40));

// 4. A plain loop, if they ask for one without array methods.
for (const employee of employees) {
  if (employee.value === 40) console.log(employee.name);
}

// 5. Look up by a value many times: build a Map once (O(n)), then each lookup is O(1).
const namesByValue = new Map();
for (const { name, value } of employees) {
  namesByValue.set(value, [...(namesByValue.get(value) ?? []), name]);
}
console.log(namesByValue.get(40));

assert.deepEqual(namesWithValue(employees, 40), ['Abdul1', 'Abdul2']);
assert.deepEqual(namesWithValue(employees, 99), []);
assert.deepEqual(namesWithValue([], 40), []);
assert.equal(firstMatch?.name, 'Abdul1');
assert.deepEqual(namesByValue.get(40), ['Abdul1', 'Abdul2']);

// The bug in the interview version: the objects used `Value` (capital V) but the check read `e.value`,
// which is undefined, so `undefined === 40` was false and nothing printed.
const asWritten = [{ name: 'Abdul1', Value: 40 }];
assert.equal(asWritten.filter((e) => e.value === 40).length, 0);
