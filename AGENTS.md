# Bean Passport

Batch passports for bean-to-bar chocolate. Each production step of a batch at Acorde Chocolates produces a canonical record; its SHA-256 is sealed in a Solana memo transaction signed by the official wallet, and a public page (reached through the QR code on the wrapper) recomputes the hash from the data it shows and checks it against the chain.

Built for the Crypto World's Fair hackathon (Colosseum), Solana track. Runs on Solana **devnet**.

## For coding agents

This file is the single source of instructions for every coding agent on this repo. Codex reads it directly; Claude Code reads it through `CLAUDE.md`, which imports it. Edit this file, never a copy.

- Shared skills live in `.agents/skills/<name>/SKILL.md` (Agent Skills format): `git-commit` and `git-pr`.
- `.claude/skills/<name>/SKILL.md` are thin pointers so Claude Code discovers the same skills. Change the rules in `.agents/skills/`, not in the pointers.

## Deadlines

| When (BRT) | What |
|---|---|
| Mon Oct 12, 20:00 | Freeze: pages, batch files and videos final. No pushes after this |
| Mon Oct 12, 22:00 | Fabrício (team lead) submits on colosseum.com |
| Tue Oct 13, 03:59 | Official deadline (Oct 12, 23:59 PT) |

**Quiet window:** no push in the 15 minutes before recording a video or opening the site for the jury. GitHub Pages keeps each page cached for up to 10 minutes, so a late deploy can show the previous version. After the last push, wait for the Pages run to finish and check the pages in a private window before recording.

## Language

Everything in this repository is in **English**: code, identifiers, comments, commit messages, PRs, docs and data keys. The competition rules require all submitted content in English (section 12(a)(i)).

The public pages are bilingual for users: **English by default**, Portuguese through the EN | PT toggle. Every user-facing string goes through the translation dictionaries, in both languages.

## Layout

| Path | What it is |
|---|---|
| `AGENTS.md` | This guide, for every coding agent |
| `CLAUDE.md` | Imports `AGENTS.md` for Claude Code |
| `.agents/skills/` | Shared agent skills (`git-commit`, `git-pr`) |
| `.claude/skills/` | Pointers to `.agents/skills/` for Claude Code |
| `site/` | Everything published on GitHub Pages (`https://acorde-chocolates.github.io/bean-passport/`) |
| `site/index.html`, `site/home.css`, `site/js/home.js` | Home page: check a batch, live demo, how it works |
| `site/lote/` | Public batch passport (`lote/?id=<lot>`): `index.html`, `app.js`, `i18n.js`, `style.css` |
| `site/anchor.html`, `site/js/anchor.js` | Sealing page used by Acorde to seal a step with Phantom. Internal, English only |
| `site/build.html`, `site/js/build.js`, `site/js/build-i18n.js` | Public demo: builds the record, hash, memo and wrapper QR code from production numbers the way the Apps Script does, and compares the memo with the seal on devnet. Never signs |
| `site/js/config.js` | Cluster, RPC, Memo program, issuer wallets, explorer and page URLs. Shared by every page |
| `site/vendor/solana-web3-1.98.4.iife.min.js` | Pinned `@solana/web3.js`, vendored (sha256 matches npm) |
| `site/vendor/qrcodegen-1.8.0.js` | Nayuki QR Code generator, byte for byte the same file as `apps-script/vendor/qrcodegen-1.8.0.gs`, so the build page draws the same QR as the Apps Script |
| `site/spec/canonical-record-v1.md` | The canonical record format: the contract between generator and verifier |
| `site/spec/test-vector-v1.json` | Cases every implementation must reproduce byte for byte |
| `site/data/lots/<lot>.json` | Public batch files: `record` (exact strings) + `anchors` (step → signature) |
| `apps-script/` | Google Apps Script layer that builds records and memos from the factory spreadsheet |
| `design/` | Mockups. Not published |
| `tools/check.mjs` | Checks the test vector, every batch file, its seals on devnet and the cache-busting stamps |
| `.github/workflows/pages.yml` | Runs `tools/check.mjs --chain`, then deploys `site/` and stamps `?v=__V__` with the commit SHA. A failing check stops the deploy and keeps the current site online |

## Invariants: do not break these

- **Canonical record v1 is frozen.** A JSON array where every element is a string: `["v1", <7 header strings>, <step arrays of 8 strings>…]`. Any change to the serialization is `v2`, and the `v1` code must stay to verify existing seals. The TEST-0001 batch is already sealed with v1.
- **Five steps, fixed codes:** `roasting`, `winnowing`, `grinding`, `tempering_molding`, `packaging`, numbered 1 to 5. Conching is part of `grinding` (melanger). Do not add a sixth step.
- **Memo:** `v1|<lot>|<step>|<sha256>`, lot `^[A-Za-z0-9-]{1,32}$`, step `1`-`5`, lowercase hex. Program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, with the issuer as signer.
- **One seal per step.** The seal for step N covers the header and steps 1..N, so changing an earlier step breaks every later seal.
- **Sealed data is never edited.** Once a step is sealed, its values in the batch file must not change; the page would show it as "Changed".
- **The page trusts only the chain.** It recomputes the hash in the browser from the strings it displays and compares it with the memo; the batch file never carries the expected hash.
- **Only the issuer's seals count.** The fee payer (`accountKeys[0]`) must be the issuer for that lot: the official wallet for real lots (held by the team, it seals Acorde's batches), the `testIssuer` for `TEST-*` lots (`config.js`). Today both slots hold the same wallet, so the sealing page greets it as the official one.
- **Find the memo by program id, never by instruction index.** Phantom adds ComputeBudget instructions before it.
- **A network error is not tampering.** Keep "No connection" separate from "Changed".
- **Devnet only** for this submission.

## Privacy and secrets

- Never commit wallet keypairs, seed phrases, `.env` files, API tokens or spreadsheet IDs.
- Nothing personal or financial in batch files or on chain: no customer data, prices, margins or supplier contacts.
- The producer is always a code in the record (`FOR004`), even with consent: the header is sealed forever and the repository history is public.

## Run locally

```bash
cd site && python3 -m http.server 8000
```

Open `http://localhost:8000/`, `http://localhost:8000/lote/?id=TEST-0001` and `http://localhost:8000/anchor.html`. Do not open the files with `file://`: Web Crypto and Phantom need `http://localhost` or HTTPS.

Phantom must be in Testnet Mode with **Solana Devnet** selected. If its approval window shows just "Solana", "not enough SOL" or "couldn't simulate", it is on mainnet: cancel and switch.

## Check before pushing

```bash
node tools/check.mjs --chain
```

The deploy runs the same check. It fails on a broken record, a changed sealed value, a signature pasted on the wrong step, a duplicate anchor, a step of a real batch that the issuer sealed with more than one hash (except the seals in `SUPERSEDED_SEALS` in `tools/check.mjs`: today only LOT033-2026 step 3 from Oct 11, a practice seal made before that wallet became the issuer), a missing `?v=__V__` or a changed test vector. Repeated seals on `TEST-*` batches only warn. If devnet is unreachable it only warns.

## Check the contract by hand

Any change near the record, hash or memo must keep the test vector passing:

```bash
node -e '
const v=require("./site/spec/test-vector-v1.json"),c=require("crypto");
const H=["lot","product","producer","municipality","state","origin_lot","purchase_date"],S=["n","step","date","input_g","output_g","byproduct_g","units","profile"];
for(const k of v.cases){const st=k.record.steps.filter(s=>+s.n<=k.upTo).sort((a,b)=>a.n-b.n);const t=JSON.stringify(["v1",...H.map(x=>k.record[x]),...st.map(s=>S.map(x=>s[x]))]);
console.log(t===k.canonical&&c.createHash("sha256").update(t,"utf8").digest("hex")===k.sha256?"PASS":"FAIL",k.name)}'
```

## Conventions

- **No build step and no framework** before the submission. Plain HTML, CSS and JavaScript that runs from GitHub Pages as is.
- **Pin every dependency** and vendor it under `site/vendor/` with the version in the file name.
- **Cache busting:** every local CSS or JS reference in an HTML file ends with `?v=__V__`. The deploy replaces it with the short commit SHA, so a new deploy never mixes old and new files. Add it to any new reference. Vendored files carry the version in their file name instead.
- **Batch files** are loaded with `?t=<timestamp>` and `cache: "no-store"`, so new anchors show up right after the deploy.
- **New UI strings** go into `site/lote/i18n.js`, `site/js/home.js` or the page's own `site/js/*-i18n.js`, in both `en` and `pt`.
- **Prefer clear names over comments.** Don't add new explanatory comments; existing ones must be in English.
- **Escape everything** that comes from a batch file or the network before it reaches `innerHTML`.
- **Commits and PRs** follow `.agents/skills/git-commit` and `.agents/skills/git-pr`: Conventional Commits in English, and no bot or AI attribution lines.

## Team

| Person | Area |
|---|---|
| Emerson | Spec, sealing page, chain reading, config, CI, README |
| Michele | Public passport UI, translations, home page design |
| Samuel | Apps Script (`apps-script/`), QR codes |
| Fabrício | Factory data, Acorde wallet, pitch, submission (team lead) |

Changes to `site/spec/` or to the record format are announced in the team group before they are pushed.
