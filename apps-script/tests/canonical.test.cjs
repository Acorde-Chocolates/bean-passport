'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const vector = JSON.parse(fs.readFileSync(path.join(root, 'site/spec/test-vector-v1.json'), 'utf8'));
const context = vm.createContext({
  Date,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, value, charset) {
      assert.equal(algorithm, 'SHA_256');
      assert.equal(charset, 'UTF_8');
      return Array.from(crypto.createHash('sha256').update(value, 'utf8').digest(),
        byte => byte > 127 ? byte - 256 : byte);
    },
    formatDate(date, timeZone, format) {
      assert.equal(timeZone, 'America/Sao_Paulo');
      assert.equal(format, 'yyyy-MM-dd');
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      const value = type => parts.find(part => part.type === type).value;
      return value('year') + '-' + value('month') + '-' + value('day');
    }
  }
});
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/canonical.gs'), 'utf8'),
  context, { filename: 'canonical.gs' });
const clone = value => JSON.parse(JSON.stringify(value));
const freshRecord = () => clone(vector.cases[1].record);
for (const fixture of vector.cases) {
  test('official fixture: ' + fixture.name, () => {
    const record = clone(fixture.record);
    const snapshot = JSON.stringify(record);
    assert.equal(context.canonicalV1(record, fixture.upTo), fixture.canonical);
    assert.equal(context.sha256V1(fixture.canonical), fixture.sha256);
    assert.equal(context.buildMemoV1(record.lot, fixture.upTo, fixture.sha256), fixture.memo);
    const anchor = context.prepareAnchorV1(record, fixture.upTo);
    assert.equal(anchor.canonical, fixture.canonical);
    assert.equal(anchor.sha256, fixture.sha256);
    assert.equal(anchor.memo, fixture.memo);
    assert.equal(JSON.stringify(record), snapshot);
  });
}

for (const [index, fixture] of vector.normalization.entries()) {
  test('official normalization fixture ' + index, () => {
    const run = () => {
      if (fixture.kind === 'grams') return context.kilogramsToGramsV1(fixture.input);
      if (fixture.kind === 'text') return context.normalizeTextV1(fixture.input);
      const value = /^\d{4}-\d{2}-\d{2}T/.test(fixture.input) ?
        new Date(fixture.input) : fixture.input;
      return context.normalizeDateV1(value);
    };
    if (fixture.expected === 'error') assert.throws(run);
    else assert.equal(run(), fixture.expected);
  });
}

test('weights preserve empty cells and zero and use the frozen rounding rule', () => {
  for (const value of ['', ' ', null, undefined]) {
    assert.equal(context.kilogramsToGramsV1(value), '');
  }
  assert.equal(context.kilogramsToGramsV1(0), '0');
  assert.equal(context.kilogramsToGramsV1('0'), '0');
  assert.equal(context.kilogramsToGramsV1(' 6.08 '), '6080');
  assert.equal(context.kilogramsToGramsV1(1.2345), String(Math.round(1.2345 * 1000)));
  assert.equal(context.kilogramsToGramsV1(1e3), '1000000');
});

test('weights reject nondecimal text, negative values and unsafe grams', () => {
  for (const value of ['-1', '-0', '+1', '0x10', '1e3', '6,08', '100 g', '.5', '1.',
    -1, NaN, Infinity, false, {}, 1e30]) {
    assert.throws(() => context.kilogramsToGramsV1(value));
  }
});

test('text normalization preserves case, accents and internal spaces', () => {
  assert.equal(context.normalizeTextV1('  Ilhe\u0301us  '), 'Ilhéus');
  assert.equal(context.normalizeTextV1('  A  B  '), 'A  B');
  assert.equal(context.normalizeTextV1(null), '');
  assert.throws(() => context.normalizeTextV1(123));
});

test('date cells use the fixed time zone and reject invalid or textual dates', () => {
  assert.equal(context.normalizeDateV1(new Date('2026-10-07T02:30:00Z')), '2026-10-06');
  assert.equal(context.normalizeDateV1(''), '');
  assert.throws(() => context.normalizeDateV1(new Date('invalid')));
  assert.throws(() => context.normalizeDateV1('2026-10-07'));
  assert.throws(() => context.normalizeDateV1('07/10/2026'));
});

test('fixed step codes reject coerced or out-of-range values', () => {
  assert.equal([1, 2, 3, 4, 5].map(context.stepCodeV1).join(','),
    'roasting,winnowing,grinding,tempering_molding,packaging');
  for (const value of [0, 6, 1.5, '01', ' 1 ', true]) {
    assert.throws(() => context.stepCodeV1(value));
  }
});

test('serialization ignores metadata, sorts steps and preserves the input', () => {
  const record = freshRecord();
  record.steps.reverse();
  record.exported_at = '2026-10-10T12:00:00Z';
  record.status = 'draft';
  record.steps[0].editor = 'test';
  const snapshot = JSON.stringify(record);
  assert.equal(context.canonicalV1(record, 2), vector.cases[1].canonical);
  assert.equal(JSON.stringify(record), snapshot);
});

test('selected steps must be contiguous, unique and numbered with canonical strings', () => {
  const missing = freshRecord();
  missing.steps.shift();
  assert.throws(() => context.canonicalV1(missing, 2), /contiguous/);
  const duplicate = freshRecord();
  duplicate.steps[1] = duplicate.steps[0];
  assert.throws(() => context.canonicalV1(duplicate, 2), /contiguous/);
  for (const number of [1, '01', null]) {
    const record = freshRecord();
    record.steps[0].n = number;
    assert.throws(() => context.canonicalV1(record, 2));
  }
});

test('canonical fields must be strings and are never repaired by serialization', () => {
  for (const value of [1000, null, undefined]) {
    const record = freshRecord();
    record.steps[0].input_g = value;
    assert.throws(() => context.canonicalV1(record, 2));
  }
  const record = freshRecord();
  record.product = ' Test Bar 70 ';
  assert.equal(JSON.parse(context.canonicalV1(record, 2))[2], ' Test Bar 70 ');
  assert.equal(record.product, ' Test Bar 70 ');
});

test('future steps do not affect the hash of an earlier anchor', () => {
  const record = freshRecord();
  record.steps[1].output_g = '701';
  assert.equal(context.prepareAnchorV1(record, 1).sha256, vector.cases[0].sha256);
  assert.notEqual(context.prepareAnchorV1(record, 2).sha256, vector.cases[1].sha256);
});

test('changing an earlier step invalidates each later hash', () => {
  const record = freshRecord();
  const before = [1, 2].map(step => context.prepareAnchorV1(record, step).sha256);
  record.steps[0].output_g = '966';
  for (const [index, step] of [1, 2].entries()) {
    assert.notEqual(context.prepareAnchorV1(record, step).sha256, before[index]);
  }
});

test('SHA-256 uses exact UTF-8 bytes including a trailing newline', () => {
  assert.equal(context.sha256V1('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(context.sha256V1(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.notEqual(context.sha256V1(vector.cases[0].canonical + '\n'), vector.cases[0].sha256);
});

test('memos reject invalid IDs, uppercase hashes and noninteger anchor steps', () => {
  assert.throws(() => context.buildMemoV1('LOT_1', 1, vector.cases[0].sha256));
  assert.throws(() => context.buildMemoV1('LOT-1', 1, vector.cases[0].sha256.toUpperCase()));
  assert.throws(() => context.buildMemoV1('LOT-1', 1, vector.cases[0].sha256 + '\n'));
  for (const step of [0, 6, 1.5, '1']) {
    assert.throws(() => context.buildMemoV1('LOT-1', step, vector.cases[0].sha256));
    assert.throws(() => context.canonicalV1(freshRecord(), step));
  }
});
