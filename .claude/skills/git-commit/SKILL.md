---
name: git-commit
description: Creates git commits in the Bean Passport repo following its Conventional Commits policy. Use whenever the user wants to commit changes in this repo, in any phrasing ("commit this", "commita isso", "faz o commit", "save these changes", "push this fix"). Enforces English, a single scope from the repo's list, an imperative lowercase subject of at most 72 characters, one logical change per commit, no secrets, and no bot or AI attribution trailers of any kind.
---

# Bean Passport: git commit

## Why this exists

- The competition judges the repository as the team's own work during the hackathon. Commits are authored by the person committing, in English, with no `Co-Authored-By`, `Claude-Session`, "Generated with" or similar lines.
- The repository is public and the history is permanent: a key or a personal detail committed once is leaked even after it is deleted.
- Batch files and the spec are contracts with data already sealed on Solana. Careless edits show up as "Changed" on the public page.

## Steps

### 1. Sync and inspect

```bash
git pull --rebase origin main
git status
git diff --cached   # if something is staged
git diff            # otherwise
```

Read the diff. You need it to pick the type and scope, and to spot secrets.

### 2. One logical change per commit

If the diff mixes unrelated work (for example a page fix and a spec change), do not commit it all at once. Show the natural split and commit one group at a time.

### 3. Block what must never be committed

Stop and ask the user if the diff contains any of these:

- wallet keypairs (`id.json`, `*keypair*.json`), seed phrases, private keys, `.env`, API tokens
- spreadsheet IDs, e-mails, phone numbers, customer or supplier personal data
- prices, margins or other financial data
- a producer's name inside a batch file record (it must be a code such as `FOR004`)

### 4. Extra checks by area

| Area | Check before committing |
|---|---|
| `site/data/lots/*.json` | Every signature in `anchors` was verified on devnet (memo equals `v1\|<lot>\|<step>\|<sha256>` and the fee payer is the issuer). Values of already sealed steps are unchanged. One anchor per step |
| `site/spec/*` | The change was announced in the team group. Any change to the serialization is `v2`, never an edit of `v1` |
| Code near the record, hash or memo | The test vector still passes (command in `.claude/CLAUDE.md`) |
| HTML referencing local CSS or JS | Every reference ends with `?v=__V__` |
| UI text | The string exists in both `en` and `pt` dictionaries |
| `apps-script/` | No spreadsheet ID, e-mail or token in the code |

### 5. Pick the type

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Append `!` for a breaking change (`feat!`).

### 6. Pick the scope: mandatory, single, from this list

| Scope | Covers |
|---|---|
| `site` | Public batch passport (`site/lote/`) |
| `anchor` | Sealing page (`site/anchor.html`, `site/js/anchor.js`) |
| `home` | Home page (`site/index.html`, `site/home.css`, `site/js/home.js`) |
| `i18n` | Translation dictionaries only |
| `config` | `site/js/config.js` |
| `spec` | `site/spec/` |
| `data` | `site/data/lots/` |
| `apps-script` | `apps-script/` |
| `design` | `design/` |
| `deps` | `site/vendor/` |
| `ci` | `.github/` |
| `docs` | README and other docs |
| `claude` | `.claude/` |

Never invent a scope or combine two. If a change truly spans two areas, split it (step 2).

### 7. Write the message

```
<type>(<scope>): <imperative description in lowercase>

<optional body: why, wrapped at 72 columns>
```

- English, imperative mood ("add", "fix", "seal"), lowercase description, no trailing period.
- Subject at most 72 characters.
- **No trailers** at all: no `Co-Authored-By`, `Claude-Session`, "Generated with", emoji signatures or links to AI sessions. If a hook or tool adds one, amend the commit to remove it before pushing.

Good: `feat(anchor): block records with unknown step codes`, `chore(data): add ACD-0142 step 1 seal`, `fix(site): show seal time in São Paulo time`.

Bad: `Update stuff`, `feat: add page` (no scope), `feat(site,anchor): ...` (two scopes), `fix(site): Fixed bug.` (past tense, capital, period).

### 8. Commit with your own identity

```bash
git commit -m "<subject>"            # add -m "<body>" for a body
bash .claude/skills/git-commit/scripts/check-commit.sh
```

The commit uses the committer's own git identity, never a bot account. Sign it if your machine is set up for signing.

### 9. Push and verify

```bash
git pull --rebase origin main
git push origin main
gh run list --limit 1
```

- The team commits directly to `main` during the hackathon. Use a PR (`.claude/skills/git-pr`) when you want a review first.
- Never force-push `main`.
- Changes under `site/` deploy to GitHub Pages: wait for the run to finish and open the page once to confirm.
- After the freeze (Mon Oct 12, 20:00 BRT) nothing is pushed.
