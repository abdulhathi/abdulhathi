// CommonJS: Node's original module system. You still meet it in older
// packages and config files. The .cjs extension forces this format.
const path = require('node:path');

let calls = 0;

function shout(text) {
  calls += 1;
  return `${text.toUpperCase()}!`;
}

module.exports = {
  shout,
  calls, // copies the number 0 now; it will not follow later changes
  fileName: path.basename(__filename),
  getCalls: () => calls,
};
