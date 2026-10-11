# Third-party dependencies

## Apps Script runtime

Nayuki QR Code generator **1.8.0**, JavaScript ES6 release.

- Source: https://github.com/nayuki/QR-Code-generator/releases/download/v1.8.0/qrcodegen-v1.8.0-es6.js
- Project: https://www.nayuki.io/page/qr-code-generator-library
- File: `vendor/qrcodegen-1.8.0.gs`
- SHA-256: `6a1116192ed1dd67fa1bf31e77f5817103d71c23bbac24c382e698b7668bdd01`
- License: MIT; original copyright and full license remain in the file.

## Local test dependencies

These dependencies run only in Node.js and are not copied into Apps Script.

| Dependency | Version | Purpose | License | Project |
| --- | --- | --- | --- | --- |
| jsQR | 1.4.0 | Independent QR decoding | Apache-2.0 | https://github.com/cozmo/jsQR |
| sharp | 0.35.5 | SVG rendering for decode tests | Apache-2.0 | https://github.com/lovell/sharp |

Versions are pinned in `tests/package.json`.
