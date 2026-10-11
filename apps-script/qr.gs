const BP_QR_CONFIG_V1 = Object.freeze({ lot: 'LOT033-2026' });

function buildPassportUrlV1(lot) {
  if (arguments.length !== 1 || typeof lot !== 'string' ||
      !/^[A-Za-z0-9-]{1,32}$/.test(lot)) {
    throw new Error('Provide one lot ID containing 1 to 32 letters, digits, or hyphens.');
  }
  return 'https://acorde-chocolates.github.io/bean-passport/lote/?id=' + lot;
}

function buildLotQrV1(lot) {
  if (arguments.length !== 1) {
    throw new Error('Provide only a lot ID; the passport URL is derived automatically.');
  }
  const url = buildPassportUrlV1(lot);
  return { lot: lot, url: url, fileName: 'QR-' + lot + '.svg', svg: generateQrSvgV1(url) };
}

function generateQrSvgV1(url) {
  validateHttpsUrlV1_(url);
  const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  const paths = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        paths.push('M' + (x + border) + ',' + (y + border) + 'h1v1h-1z');
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="' + (size * 8) + '" height="' + (size * 8) + '" ' +
    'viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    '<rect width="100%" height="100%" fill="#ffffff"/>' +
    '<path fill="#000000" d="' + paths.join(' ') + '"/></svg>';
}

function saveLotQrV1() {
  return saveQrFileV1_(buildLotQrV1(BP_QR_CONFIG_V1.lot));
}

function saveDemoQrV1() {
  return saveQrFileV1_(buildLotQrV1('TEST-0001'));
}

function saveQrFileV1_(qr) {
  const file = DriveApp.createFile(Utilities.newBlob(qr.svg, 'image/svg+xml', qr.fileName));
  const result = { lot: qr.lot, url: qr.url, fileName: qr.fileName, fileUrl: file.getUrl() };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function validateHttpsUrlV1_(url) {
  if (typeof url !== 'string' || /[\s\\\u0000-\u001f\u007f]/.test(url)) {
    throw new Error('The QR URL must be text without whitespace, control characters, or backslashes.');
  }
  const parts = /^https:\/\/([^/?#]+)(?:[/?#].*)?$/.exec(url);
  const authority = parts && /^([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(parts[1]);
  if (!authority || authority[1].length > 253 ||
      authority[1].split('.').some(function(label) {
        return !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label);
      }) || (authority[2] && (+authority[2] < 1 || +authority[2] > 65535))) {
    throw new Error('Provide a complete HTTPS URL with a valid hostname and no credentials.');
  }
  return url;
}
