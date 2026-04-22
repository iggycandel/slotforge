#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# update-prompt-doc-sync.sh
#
# Updates the "Last sync" line in docs/prompt-architecture.md to the current
# commit (short SHA) + ISO-8601 UTC date, so the doc always references a
# machine-readable state. Invoked automatically by .githooks/pre-commit when
# any prompt-related file is staged; can also be run by hand:
#
#   $ ./scripts/update-prompt-doc-sync.sh
#
# Idempotent — running it when the line already reflects the current HEAD
# does nothing (no spurious commits).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || { echo "not in a git repo" >&2; exit 1; })"
DOC_PATH="$REPO_ROOT/slotforge-web/docs/prompt-architecture.md"

if [[ ! -f "$DOC_PATH" ]]; then
  # Repo root varies by checkout style; try the alternate path.
  DOC_PATH="$REPO_ROOT/docs/prompt-architecture.md"
fi
if [[ ! -f "$DOC_PATH" ]]; then
  echo "[update-prompt-doc-sync] doc not found at expected paths" >&2
  exit 0  # non-fatal — don't block a commit if the repo layout changed
fi

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE=$(date -u +%Y-%m-%d)
NEW_LINE="Last sync: \`$SHA\` — $DATE"

# Replace any existing "Last sync: …" line; insert if absent.
if grep -q '^Last sync:' "$DOC_PATH"; then
  # macOS sed requires '' after -i; GNU sed doesn't. Detect and branch.
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^Last sync:.*|$NEW_LINE|" "$DOC_PATH"
  else
    sed -i '' "s|^Last sync:.*|$NEW_LINE|" "$DOC_PATH"
  fi
else
  # Put it just after the opening description line.
  echo "[update-prompt-doc-sync] 'Last sync' line missing; appending to file." >&2
  printf '\n%s\n' "$NEW_LINE" >> "$DOC_PATH"
fi

# Stage the change if we're inside a pre-commit hook run
if [[ -n "${GIT_AUTHOR_NAME:-}" || -n "${RUNNING_PRE_COMMIT:-}" ]]; then
  git add "$DOC_PATH"
fi
