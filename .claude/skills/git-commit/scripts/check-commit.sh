#!/usr/bin/env bash
set -euo pipefail

SCOPES='site|anchor|home|i18n|config|spec|data|apps-script|design|deps|ci|docs|claude'
TYPES='feat|fix|docs|style|refactor|perf|test|build|ci|chore'

usage() {
  echo "usage: check-commit.sh [<rev>]          check a commit message (default HEAD)"
  echo "       check-commit.sh --subject \"<text>\"  check a draft subject or PR title"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then usage; exit 0; fi

if [[ "${1:-}" == "--subject" ]]; then
  message="${2:-}"
else
  message="$(git log -1 --format=%B "${1:-HEAD}")"
fi

subject="$(printf '%s\n' "$message" | head -n 1)"
fail=0

if [[ ! "$subject" =~ ^(${TYPES})!?\((${SCOPES})\):\ [a-z0-9] ]]; then
  echo "subject: expected <type>(<scope>): <lowercase description>, with a scope from: ${SCOPES//|/, }"
  fail=1
fi
if (( ${#subject} > 72 )); then
  echo "subject: ${#subject} characters, max 72"
  fail=1
fi
if [[ "$subject" =~ \.$ ]]; then
  echo "subject: remove the trailing period"
  fail=1
fi
if printf '%s\n' "$message" | grep -qiE '^(co-authored-by|claude-session|generated with|signed-off-by: claude)|claude\.ai/code|🤖'; then
  echo "message: remove bot or AI attribution lines"
  fail=1
fi

if (( fail )); then exit 1; fi
echo "ok: $subject"
