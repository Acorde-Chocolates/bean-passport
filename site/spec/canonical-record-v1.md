# Canonical record v1

Status: **draft**. It freezes once announced in the team group, before the first anchor. After the first anchor, any change to the serialization is `v2`, and the `v1` code stays alive to verify old anchors.

## Memo

```
v1|<lot>|<step>|<sha256>
```

Validation regex: `^v1\|[A-Za-z0-9-]{1,32}\|[1-5]\|[0-9a-f]{64}$`

- `<lot>`: batch ID, `^[A-Za-z0-9-]{1,32}$` (it also goes in the file name and in the URL)
- `<step>`: step number, `1` to `5`
- `<sha256>`: lowercase hex SHA-256 of the canonical record up to that step

Sent through the Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, with the issuer wallet as signer.

## Record layout

A JSON array where **every element is a string**:

```
["v1", <header: 7 strings>, <step 1: array of 8 strings>, ..., <step N: array of 8 strings>]
```

The anchor for step N seals the header plus steps 1..N. Changing an earlier step breaks every later anchor.

### Header

| # | Key | Content |
|---|---|---|
| 1 | (literal) | `"v1"` |
| 2 | `lot` | production batch ID |
| 3 | `product` | final product |
| 4 | `producer` | cocoa producer name, only with written consent; otherwise a code |
| 5 | `municipality` | municipality of origin |
| 6 | `state` | state (UF) |
| 7 | `origin_lot` | purchased cocoa lot that entered roasting, or `""` |
| 8 | `purchase_date` | purchase date, or `""` |

The header is sealed by the first anchor: product and producer must be final before it.

### Step

| # | Key | Content |
|---|---|---|
| 1 | `n` | `"1"` to `"5"` |
| 2 | `step` | fixed code derived from `n`: `roasting`, `winnowing`, `grinding`, `tempering_molding`, `packaging` |
| 3 | `date` | date the step happened (not the date it was ticked) |
| 4 | `input_g` | main input, grams |
| 5 | `output_g` | main output, grams |
| 6 | `byproduct_g` | husk on winnowing; `""` elsewhere |
| 7 | `units` | number of bars on steps 4 and 5, if recorded; otherwise `""` |
| 8 | `profile` | roast profile on step 1, if recorded; otherwise `""` |

On grinding, `input_g` is nibs only. Adding sugar and cocoa butter would be a computed value.

## Value rules

- Text: `trim()` then `normalize('NFC')`
- Weights: integer grams as a string, `String(Math.round(Number(kg) * 1000))`; blank cell is `""`; non-numeric value throws
- Dates: `yyyy-MM-dd` in `America/Sao_Paulo`; a cell that is not a date throws; never guess `dd/MM`
- Empty is `""`, never `null`, `0` or a space; a missing weight is `""`, never `0`
- Only production facts go in: nothing computed (yield, loss, expiry date) and nothing operational (status, who ticked)
- The builder throws if any element is not a string or if steps are not contiguous from 1
- Steps are ordered by `n`, never by spreadsheet column or row order

## Hash

SHA-256 over the UTF-8 bytes of `JSON.stringify(array)`, as 64 lowercase hex characters.

Apps Script returns signed bytes: convert each with `(b & 0xff).toString(16).padStart(2, '0')`, and pass `Utilities.Charset.UTF_8` explicitly.

## Public batch file

`site/data/lots/<lot>.json`:

```json
{
  "schema": "bean-passport.lot.v1",
  "record": {
    "lot": "", "product": "", "producer": "", "municipality": "", "state": "", "origin_lot": "", "purchase_date": "",
    "steps": [
      { "n": "", "step": "", "date": "", "input_g": "", "output_g": "", "byproduct_g": "", "units": "", "profile": "" }
    ]
  },
  "anchors": [{ "step": "1", "signature": "<base58>" }],
  "exported_at": "<ISO 8601>"
}
```

- `record` holds exactly the strings of the array; display formatting is derived from it and never goes back into the hash
- The file does not carry the expected hash: the page trusts only the memo on chain
- `schema`, `anchors` and `exported_at` are outside the hash
- A step present without an anchor is shown as recorded, not sealed yet

## Reference implementation

```js
const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];

const canonicalV1 = (rec, upTo) => {
  const steps = rec.steps.filter(s => Number(s.n) <= upTo).sort((a, b) => a.n - b.n);
  const values = ["v1", ...HEADER.map(k => rec[k]), ...steps.flatMap(s => STEP.map(k => s[k]))];
  if (steps.length !== upTo || steps.some((s, i) => s.n !== String(i + 1)) || values.some(v => typeof v !== "string")) throw new Error("invalid record");
  return JSON.stringify(["v1", ...HEADER.map(k => rec[k]), ...steps.map(s => STEP.map(k => s[k]))]);
};
```

Both sides must reproduce every case in `test-vector-v1.json`.

## Never on chain, never in public files

Personal data of customers, prices, margins, financial results, supplier contacts. A producer's name only with written consent. Wallet keys and seed phrases never enter the repository.
