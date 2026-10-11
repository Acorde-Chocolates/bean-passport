'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const headerFields = ['lot', 'product', 'producer', 'municipality', 'state', 'origin_lot', 'purchase_date'];
const stepFields = ['n', 'step', 'date', 'input_g', 'output_g', 'byproduct_g', 'units', 'profile'];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadAnchorPageValidators() {
  const configContext = { window: {} };
  vm.runInNewContext(read('site/js/config.js'), configContext, { filename: 'config.js' });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, hidden: false, dataset: {}, textContent: '', innerHTML: '',
      addEventListener() {}, setAttribute() {}
    });
    return elements.get(id);
  };
  const context = {
    window: {
      BP_CONFIG: configContext.window.BP_CONFIG,
      BP_ANCHOR_I18N: { t: key => key, lang: 'en', setLang() {} },
      solanaWeb3: {
        Connection: class {}, PublicKey: class {}, Transaction: class {}, TransactionInstruction: class {}
      },
      addEventListener() {}
    },
    document: { getElementById: element, querySelectorAll: () => [], documentElement: {} },
    fetch: async () => { throw new Error('Network access is disabled in this test'); },
    crypto: crypto.webcrypto,
    TextEncoder,
    Uint8Array,
    Intl
  };
  vm.runInNewContext(read('site/js/anchor.js') +
    '\nthis.anchorValidators = { parseCanonical, parseMemo, validateRecord, sha256Hex };', context,
    { filename: 'anchor.js', timeout: 1000 });
  return context.anchorValidators;
}

function loadAppsScriptCore() {
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
      }
    }
  });
  for (const filename of ['canonical.gs', 'mpb.gs']) {
    vm.runInContext(read('apps-script/' + filename), context, { filename });
  }
  for (const name of ['prepareAnchorV1', 'buildMpbRecordV1', 'prepareMpbAnchorsV1']) {
    assert.equal(typeof context[name], 'function', 'Apps Script must expose ' + name);
  }
  return {
    prepareAnchor: context.prepareAnchorV1,
    buildMpbRecordV1: context.buildMpbRecordV1,
    prepareMpbAnchorsV1: context.prepareMpbAnchorsV1
  };
}

async function validatePreparedAnchor(validators, prepared, lot, upTo) {
  const parsed = validators.parseCanonical(prepared.canonical);
  assert.ok(parsed && !parsed.error, 'The original anchor page must parse the canonical record');
  const issues = validators.validateRecord(parsed);
  assert.equal(issues.errors.length, 0, JSON.stringify(issues.errors));
  const memo = validators.parseMemo(prepared.memo);
  assert.ok(memo, 'The original anchor page must parse the memo');
  assert.equal(memo.lot, lot);
  assert.equal(memo.step, upTo);
  assert.equal(parsed.header[0], lot);
  assert.equal(parsed.steps.length, upTo);
  const hash = await validators.sha256Hex(parsed.text);
  assert.equal(prepared.sha256, hash);
  assert.equal(memo.hash, hash);
  return issues;
}

function canonicalArray(record, upTo = record.steps.length) {
  const steps = record.steps.filter(step => Number(step.n) <= upTo)
    .sort((left, right) => Number(left.n) - Number(right.n));
  return ['v1', ...headerFields.map(field => record[field]),
    ...steps.map(step => stepFields.map(field => step[field]))];
}

async function main() {
  const validators = loadAnchorPageValidators();
  const core = loadAppsScriptCore();
  const vector = JSON.parse(read('site/spec/test-vector-v1.json'));
  let groups = 0;
  let preparations = 0;
  const check = async (name, test) => {
    await test();
    groups++;
    console.log('PASS ' + name);
  };

  await check('official vectors match the original anchor parser, validator and Web Crypto hash', async () => {
    for (const testCase of vector.cases) {
      const prepared = core.prepareAnchor(testCase.record, testCase.upTo);
      assert.equal(prepared.canonical, testCase.canonical);
      assert.equal(prepared.sha256, testCase.sha256);
      assert.equal(prepared.memo, testCase.memo);
      await validatePreparedAnchor(validators, prepared, testCase.record.lot, testCase.upTo);
      preparations++;
    }
  });

  await check('every recorded batch step is accepted by the original anchor page', async () => {
    const lotDirectory = path.join(root, 'site/data/lots');
    for (const file of fs.readdirSync(lotDirectory).filter(file => file.endsWith('.json'))) {
      const batch = JSON.parse(fs.readFileSync(path.join(lotDirectory, file), 'utf8'));
      for (let upTo = 1; upTo <= batch.record.steps.length; upTo++) {
        const prepared = core.prepareAnchor(batch.record, upTo);
        const issues = await validatePreparedAnchor(validators, prepared, batch.record.lot, upTo);
        if (issues.warnings.length) {
          console.log('WARN ' + file + ' step ' + upTo + ': ' +
            issues.warnings.map(warning => warning[0]).join(', '));
        }
        preparations++;
      }
    }
  });

  await check('all five MPB steps preserve confirmed facts and match the original anchor page', async () => {
    const record = core.buildMpbRecordV1();
    const published = JSON.parse(read('site/data/lots/ACD-0142.json')).record;
    const header = value => Object.fromEntries(headerFields.map(field => [field, value[field]]));
    assert.deepEqual(header(record), header(published));
    assert.equal(record.product, 'Barra MPB 60 g');
    assert.deepEqual(JSON.parse(JSON.stringify(record.steps.slice(0, 2))), published.steps.slice(0, 2));
    assert.deepEqual(JSON.parse(JSON.stringify(record.steps.slice(2))).map(step =>
      stepFields.map(field => step[field])), [
      ['3', 'grinding', '2026-10-10', '1013', '1518', '', '', ''],
      ['4', 'tempering_molding', '2026-10-10', '240', '240', '', '4', ''],
      ['5', 'packaging', '2026-10-10', '240', '240', '', '4', '']
    ]);
    const anchors = core.prepareMpbAnchorsV1();
    assert.equal(anchors.length, 5);
    for (let index = 0; index < anchors.length; index++) {
      const upTo = index + 1;
      const anchor = anchors[index];
      assert.equal(anchor.lot, record.lot);
      assert.equal(anchor.step, String(upTo));
      const canonical = JSON.stringify(canonicalArray(record, upTo));
      const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
      assert.equal(anchor.canonical, canonical);
      assert.equal(anchor.sha256, hash);
      assert.equal(anchor.memo, 'v1|' + record.lot + '|' + upTo + '|' + hash);
      const issues = await validatePreparedAnchor(validators, anchor, record.lot, upTo);
      assert.ok(!issues.warnings.some(warning => warning[0] === 'v.outputLarger'));
      if (issues.warnings.length) {
        console.log('WARN MPB step ' + upTo + ': ' +
          issues.warnings.map(warning => warning[0]).join(', '));
      }
      console.log('MPB step ' + upTo + ' SHA-256 ' + hash);
      preparations++;
    }
  });

  await check('pretty JSON and numeric fields are rejected by the original parser', () => {
    const array = JSON.parse(vector.cases[0].canonical);
    assert.equal(validators.parseCanonical(JSON.stringify(array, null, 2)).error, 'parse.canonical');
    array[8][3] = 1000;
    assert.equal(validators.parseCanonical(JSON.stringify(array)).error, 'parse.types');
  });

  await check('missing and duplicate step numbers are rejected by the original parser', () => {
    const missing = JSON.parse(vector.cases[1].canonical);
    missing.splice(8, 1);
    assert.equal(validators.parseCanonical(JSON.stringify(missing)).error, 'parse.numbering');
    const duplicate = JSON.parse(vector.cases[1].canonical);
    duplicate[9][0] = '1';
    assert.equal(validators.parseCanonical(JSON.stringify(duplicate)).error, 'parse.numbering');
  });

  await check('a sixth production step is rejected by the original validator', () => {
    const array = JSON.parse(vector.cases[0].canonical);
    while (array.length < 14) {
      array.push([String(array.length - 7), 'packaging', '2026-10-01', '', '', '', '', '']);
    }
    const issues = validators.validateRecord(validators.parseCanonical(JSON.stringify(array)));
    assert.ok(issues.errors.some(error => error[0] === 'v.tooMany'));
  });

  await check('invalid calendar dates and non-NFC text are rejected by the original validator', () => {
    const array = JSON.parse(vector.cases[0].canonical);
    array[8][2] = '2026-02-30';
    array[4] = 'Ilhe\u0301us';
    const issues = validators.validateRecord(validators.parseCanonical(JSON.stringify(array)));
    assert.ok(issues.errors.some(error => error[0] === 'v.dateInvalid'));
    assert.ok(issues.errors.some(error => error[0] === 'v.nfc'));
  });

  await check('changing a gram invalidates the previous memo hash', async () => {
    const record = JSON.parse(JSON.stringify(vector.cases[0].record));
    record.steps[0].output_g = '966';
    const prepared = core.prepareAnchor(record, 1);
    await validatePreparedAnchor(validators, prepared, record.lot, 1);
    assert.notEqual(prepared.sha256, vector.cases[0].sha256);
    await assert.rejects(() => validatePreparedAnchor(validators,
      { ...prepared, memo: vector.cases[0].memo }, record.lot, 1));
  });

  await check('the production record has the same field order as the v1 contract', () => {
    const record = JSON.parse(read('site/data/lots/ACD-0142.json')).record;
    const prepared = core.prepareAnchor(record, record.steps.length);
    assert.equal(prepared.canonical, JSON.stringify(canonicalArray(record)));
  });

  console.log('\n' + groups + ' groups passed; ' + preparations +
    ' preparations checked against the original anchor page.');
}

module.exports = { loadAnchorPageValidators, loadAppsScriptCore, validatePreparedAnchor };

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
