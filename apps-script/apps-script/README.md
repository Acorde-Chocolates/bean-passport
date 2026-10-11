# Bean Passport Apps Script v1

Generates canonical v1 records, UTF-8 SHA-256 hashes, memos and passport QR codes. The serializer follows the frozen contract in `../site/spec/canonical-record-v1.md`; `tests.gs` embeds the unchanged official test vector.

## Files

| File | Purpose |
| --- | --- |
| `canonical.gs` | Text, kilograms and Date normalization; canonical serialization, SHA-256 and memo |
| `mpb.gs` | Confirmed MPB production facts and preparation of five cumulative anchors without a spreadsheet |
| `qr.gs` | Passport URL derived from the lot ID, SVG generation and Drive saving |
| `tests.gs` | Official vector tests and a tampering demonstration |
| `vendor/qrcodegen-1.8.0.gs` | Unmodified Nayuki QR library, including its MIT license |
| `appsscript.json` | V8 runtime and America/Sao_Paulo timezone |
| `tests/` | Local contract, production/page compatibility and independent QR decoding tests |

## Google Apps Script

1. Create a separate project named **Bean Passport v1**.
2. Replace the default Code file with the contents of `canonical.gs`, and rename it **canonical**.
3. Add script files named **mpb**, **qr**, **tests** and **qrcodegen-1.8.0**. Copy each matching file in full; the vendored file is a normal script file in the editor.
4. In project settings, enable the V8 runtime and the America/Sao_Paulo timezone. Show the manifest and use this folder's `appsscript.json`.
5. Save, open **tests.gs** in the editor, select **testVectorV1** and run it. Expect `passed: true`, `cases: 3`, `normalizations: 7`, `checks: 16`.
6. Open **mpb.gs**, select **prepareMpbAnchorsV1** and run it. Each step prints its memo and its compact, single-line canonical record. Copy those two texts into the sealing page; keep the record on one line.
7. Open **qr.gs**, select **saveLotQrV1** and run it to create `QR-ACD-0142.svg` in Drive. **saveDemoQrV1** instead creates the TEST-0001 passport QR.

The split files replace the previous combined script. Keep one definition of each function and constant per project. The record functions do not access Drive, Sheets, a wallet or the network. Drive access is used only when saving a QR.

## MPB production record

The exact product string is **Barra MPB 60 g**, matching the current public batch header. `mpb.gs` preserves the existing header and the first two steps. It uses the following reported facts:

| v1 step | Production date | Main input (g) | Main output (g) | Other facts |
| --- | --- | --- | --- | --- |
| 1 roasting | 2026-10-05 | 6300 | 6080 | |
| 2 winnowing | 2026-10-07 | 6080 | 4302 | 1602 g husk |
| 3 grinding | 2026-10-10 | 1013 | 1518 | MPB only |
| 4 tempering_molding | 2026-10-10 | 240 | 240 | 4 bars |
| 5 packaging | 2026-10-10 | 240 | 240 | 4 bars; packaging date confirmed |

Preparation, grinding and conching are represented by v1 step 3, dated at completion of conching. Its input is **nibs only**; its output is the reported mass weighed at machine shutdown. Tempering and molding are represented by step 4. Rock and the 1278 g set aside for maturation are outside this bar record.

The final 240 g of chocolate and four 60 g bars were confirmed by Samuel. Packaging weights refer to the chocolate, excluding the wrapper. Losses, yields, durations and calculated process metrics are not added.

These facts can be prepared and tested without the spreadsheet. Reading its real cells and writing the memo/canonical pair into `BP_Anchors` remain an integration step with Fabrício after the sheet layout is available. No production sheet or public batch file is modified by this module.

Production dates remain the dates of the facts. The sealing time comes from the Solana transaction and is never substituted for a production date.

## Functions

- `normalizeTextV1(value)`: trim and NFC; preserves internal spaces and case.
- `kilogramsToGramsV1(value)`: kilograms to integer grams as text. Blank stays `''`; zero stays `'0'`. Rejects negative/nonfinite values, unsafe precision and text such as `'0x10'`, `'1e3'`, comma decimals or units. Decimal text uses a dot.
- `normalizeDateV1(value)`: requires a valid Date cell, formats it in São Paulo; rejects date text.
- `stepCodeV1(n)`: fixed code for step 1–5; used by the MPB builder.
- `prepareAnchorV1(record, n)`: returns `canonical`, `sha256` and `memo` for the header and steps 1 through n.
- `buildPassportUrlV1(lot)` and `buildLotQrV1(lot)`: accept only the lot ID, so the QR destination cannot be configured separately.

Already-normalized grams and yyyy-MM-dd strings go straight into the record. Do not apply the kilogram or Date-cell normalizers again.

## QR destination

`qr.gs` configures only `lot: 'ACD-0142'`. Its destination is:

https://acorde-chocolates.github.io/bean-passport/lote/?id=ACD-0142

The demo destination is the same route with `id=TEST-0001`. SVG generation uses the pinned library locally with a four-module white border. New seals appear on the same public page without changing the QR. Check the printed label with a phone camera at its intended size before printing the batch.

## Local checks

From the repository root, with Node.js and npm available:

```sh
npm install --prefix apps-script/tests
node apps-script/tests/run.cjs
node tools/check.mjs --chain
```

The tests compare exact canonical bytes, hashes and memos against the official vector; check the five MPB prefixes using the original sealing page's parser, validator and Web Crypto hash; and decode rendered SVGs with an independent QR reader. Test dependencies are pinned in `tests/package.json` and are not included in Apps Script.

The repository check validates the current public batch files and published seals. The new MPB facts are tested separately because the public file is owned by the production team and remains unchanged here. An unreachable devnet RPC is reported as a warning by the repository check.

After installing the revised split files, execute the Google tests separately; local API shims do not certify a new Google execution. To test sealing-page compatibility manually, paste the step 1 memo/canonical pair and then step 2 at https://acorde-chocolates.github.io/bean-passport/anchor.html?lang=pt. The page should show that memo and record match before connecting a wallet.


## Google execution confirmed on 2026-10-10

- The revised split files were installed in a separate Apps Script project.
- testVectorV1 passed all 16 checks: 3 cases and 7 normalizations.
- prepareMpbAnchorsV1 generated all five ACD-0142 pairs, matching the tested canonical texts, SHA-256 hashes and memos.
- saveLotQrV1 created QR-ACD-0142.svg in Drive. A phone scan opened the correct public passport.
- Real spreadsheet cell mapping and BP_Anchors writing remain an integration step with the production team.
