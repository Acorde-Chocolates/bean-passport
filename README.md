# Bean Passport

Batch passports for bean-to-bar chocolate. Each production step of a batch produces a canonical record; its SHA-256 hash is sealed in a Solana memo transaction, and a public page reached through the QR code on the wrapper recomputes the hash from the data it shows and checks it against the chain.

Acorde Chocolates is the first factory using it.

> Work in progress for the Crypto World's Fair hackathon (Colosseum). Runs on Solana **devnet**.

## What it proves, and what it doesn't

A sealed record proves that the data has not changed since it was sealed, and when it was sealed. It does not prove the data is true: whoever types a weight can type a wrong one, and the chain will faithfully attest the wrong number.

## Repository layout

| Path | Content |
|---|---|
| `apps-script/` | Google Apps Script layer that builds the canonical record and the memo from the factory's spreadsheet |
| `site/` | Static pages served by GitHub Pages: anchoring and public verification |
| `site/spec/canonical-record-v1.md` | The canonical record format, the contract between the generator and the verifier |
| `site/spec/test-vector-v1.json` | Test vector both implementations must reproduce |
| `site/data/lots/` | Public batch files read by the verification page |
| `design/mockups/` | Clickable mockups of the public page (not published on Pages) |

## License

MIT
