'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
for (const file of ['canonical.test.cjs', 'vector.test.cjs', 'anchor-page.test.cjs', 'qr.test.cjs']) {
  console.log('\n' + file);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
}
