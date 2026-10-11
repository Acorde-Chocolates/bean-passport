'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const jsQR = require('jsqr');

const root = path.resolve(__dirname, '../..');
const vendorPath = path.join(root, 'apps-script/vendor/qrcodegen-1.8.0.gs');
const vendor = fs.readFileSync(vendorPath);
const expectedVendorHash = '6a1116192ed1dd67fa1bf31e77f5817103d71c23bbac24c382e698b7668bdd01';
const files = [];
const context = vm.createContext({
  console: { log() {} },
  Utilities: { newBlob(content, mimeType, name) { return { content, mimeType, name }; } },
  DriveApp: {
    createFile(blob) {
      files.push(blob);
      return { getUrl() { return 'https://drive.google.com/file/d/test-qr'; } };
    }
  }
});

assert.equal(crypto.createHash('sha256').update(vendor).digest('hex'), expectedVendorHash,
  'The vendored Nayuki v1.8.0 source and MIT license must remain unchanged.');
for (const relative of ['apps-script/vendor/qrcodegen-1.8.0.gs', 'apps-script/qr.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}

async function decodeSvg(svg, expectedUrl) {
  assert(svg.startsWith('<svg '));
  assert(!/<(?:script|image|foreignObject|use)\b/.test(svg));
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, info.height);
  assert.equal(info.channels, 4);
  const border = 4 * 8;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x < border || y < border || x >= info.width - border || y >= info.height - border) {
        const offset = (y * info.width + x) * 4;
        assert.equal(data[offset], 255);
        assert.equal(data[offset + 1], 255);
        assert.equal(data[offset + 2], 255);
        assert.equal(data[offset + 3], 255);
      }
    }
  }
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height,
    { inversionAttempts: 'dontInvert' });
  assert(decoded, 'The independent decoder must read the rendered SVG.');
  assert.equal(decoded.data, expectedUrl);
}

async function main() {
  const lots = ['ACD-0142', 'TEST-0001', 'x', 'A'.repeat(32)];
  for (const lot of lots) {
    const expectedUrl = 'https://acorde-chocolates.github.io/bean-passport/lote/?id=' + lot;
    assert.equal(context.buildPassportUrlV1(lot), expectedUrl);
    const qr = context.buildLotQrV1(lot);
    assert.equal(qr.lot, lot);
    assert.equal(qr.url, expectedUrl);
    assert.equal(qr.fileName, 'QR-' + lot + '.svg');
    assert.equal(qr.svg, context.buildLotQrV1(lot).svg, 'QR generation must be deterministic.');
    await decodeSvg(qr.svg, expectedUrl);
    console.log('PASS rendered SVG decodes to passport URL: ' + lot);
  }

  for (const lot of ['', null, undefined, 142, 'A'.repeat(33), ' ACD-0142', 'ACD-0142 ',
    'ACD_0142', 'ACD/0142', 'ACD-0142&id=TEST-0001', '../TEST-0001', 'ÁCD-0142']) {
    assert.throws(() => context.buildPassportUrlV1(lot));
    assert.throws(() => context.buildLotQrV1(lot));
  }
  assert.throws(() => context.buildPassportUrlV1('ACD-0142', 'https://example.com/'));
  assert.throws(() => context.buildLotQrV1('ACD-0142', 'https://example.com/lote/?id=TEST-0001'));
  assert.throws(() => context.buildLotQrV1({ lot: 'ACD-0142', url: 'https://example.com/' }));
  console.log('PASS lot validation and mismatched caller-supplied URLs are rejected.');

  for (const url of ['', null, 1, 'http://example.com/', 'javascript:alert(1)', 'https://',
    'https://user:pass@example.com/', 'https://example.com/a b', ' https://example.com/',
    'https://example.com/\\foo', 'https://example.com/\n', 'https://example..com/',
    'https://-example.com/', 'https://example.com:65536/']) {
    assert.throws(() => context.generateQrSvgV1(url));
  }
  console.log('PASS invalid HTTPS URLs are rejected.');

  const lotResult = context.saveLotQrV1();
  const demoResult = context.saveDemoQrV1();
  assert.equal(lotResult.lot, 'ACD-0142');
  assert.equal(demoResult.lot, 'TEST-0001');
  assert.equal(files.length, 2);
  for (const [index, result] of [lotResult, demoResult].entries()) {
    assert.equal(files[index].mimeType, 'image/svg+xml');
    assert.equal(files[index].name, result.fileName);
    assert.equal(result.fileUrl, 'https://drive.google.com/file/d/test-qr');
    await decodeSvg(files[index].content, result.url);
  }
  console.log('PASS Drive save wrappers preserve the configured lot and demo passport URLs.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
