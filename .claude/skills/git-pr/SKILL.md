---
name: git-pr
description: Opens pull requests in the Bean Passport repo. Use whenever the user wants a PR or a review before merging ("open a PR", "abre o PR", "cria um pull request", "manda pra review"). Targets main, uses a lowercase Conventional Commits title in English, the Summary + Test plan template with the repo's devnet and local checks, never opens drafts unless asked, and never mentions AI tools or adds bot footers.
---

# Bean Passport: pull request

## When to use a PR

During the hackathon the team commits directly to `main` (see `.claude/skills/git-commit`). Open a PR instead when:

- the change touches the record, hash, memo or `site/spec/`;
- the change touches someone else's area (see the Team table in `.claude/CLAUDE.md`);
- you want a second pair of eyes before it reaches the public page.

## Steps

### 1. Branch and commits

```bash
git switch -c <type>/<short-slug>      # e.g. fix/seal-time-zone
git status
```

All work is committed following `.claude/skills/git-commit`. Push the branch:

```bash
git push -u origin <branch>
```

### 2. Base branch

Always `main`.

### 3. Title

- Lowercase Conventional Commits, English: `<type>(<scope>): <imperative description>`, same types and scopes as the commit skill.
- About 60 characters, no trailing period, no ticket markers.
- Never mention Claude, AI, Copilot, Cursor, "assisted by" or any tool.

Check it before creating the PR:

```bash
bash .claude/skills/git-commit/scripts/check-commit.sh --subject "<title>"
```

### 4. Body: use this template

```markdown
## Summary

- <what changed and why, one bullet per change>

## Test plan

- [ ] Local server: `cd site && python3 -m http.server 8000`
- [ ] Home, `lote/?id=TEST-0001` and `anchor.html` load with no console errors
- [ ] TEST-0001 shows both steps as Verified, in EN and in PT
- [ ] Changing a number on the passport turns that step and the later ones red
- [ ] Test vector passes (command in `.claude/CLAUDE.md`)
- [ ] <checks specific to this change>
```

Add a screenshot for visual changes. Keep the body in English. **No footer** such as "Generated with …", no session links, no emoji signatures.

### 5. Create the PR

```bash
gh pr create --base main --title "<title>" --body-file <file>
```

- Do not open as draft unless the user asks.
- Do not assign reviewers; post the link in the team group and name the area owner.

### 6. Merge

- Merge only when the test plan is checked and, for spec or record changes, the team agreed in the group.
- Use **Squash and merge**, keeping the Conventional Commits title as the commit subject and removing any attribution lines GitHub adds to the message.
- Delete the branch after merging, wait for the Pages deploy and open the affected page once.
- No merges after the freeze (Mon Oct 12, 20:00 BRT).
