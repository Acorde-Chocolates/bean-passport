'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const vector = JSON.parse(fs.readFileSync(path.join(root, 'site/spec/test-vector-v1.json'), 'utf8'));
const context = vm.createContext({
  console: { log() {} },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, text, charset) {
      assert.equal(algorithm, 'SHA_256');
      assert.equal(charset, 'UTF_8');
      return Array.from(crypto.createHash('sha256').update(text, 'utf8').digest(),
        byte => byte > 127 ? byte - 256 : byte);
    },
    formatDate(date, timezone, format) {
      assert.equal(timezone, 'America/Sao_Paulo');
      assert.equal(format, 'yyyy-MM-dd');
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      const get = type => parts.find(part => part.type === type).value;
      return get('year') + '-' + get('month') + '-' + get('day');
    }
  }
});
for (const file of ['canonical.gs', 'mpb.gs', 'qr.gs', 'tests.gs', 'vendor/qrcodegen-1.8.0.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', file), 'utf8'), context, { filename: file });
}
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(BP_TEST_VECTOR_V1)', context)), vector);
console.log('PASS embedded fixture equals the unchanged official vector; all five script files load together.');

const summary = context.testVectorV1();
assert.equal(summary.passed, true);
assert.equal(summary.cases, 3);
assert.equal(summary.normalizations, 7);
assert.equal(summary.checks, 16);
console.log('PASS testVectorV1: three cases and seven normalizations, sixteen checks.');

const demonstration = context.demonstrateTamperingV1();
assert.equal(demonstration.length, 2);
for (const [index, result] of demonstration.entries()) {
  assert.equal(result.before, vector.cases[index].sha256);
  assert.notEqual(result.before, result.after);
}
console.log('PASS a changed first step changes both cumulative hashes.');
