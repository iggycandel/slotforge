#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install-hooks.sh
#
# One-time setup per dev checkout: points git at the repo's .githooks/
# directory so shared hooks (like the prompt-architecture doc sync) fire
# for everyone without each developer symlinking manually.
#
# Usage:
#   $ ./scripts/install-hooks.sh
#
# Safe to re-run. Sets `core.hooksPath` for the current repo only — does
# not touch global git config.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || { echo "not in a git repo" >&2; exit 1; })"

# Locate .githooks directory — the repo has code under slotforge-web/
# so the hooks directory might live under that prefix.
HOOKS_DIR="$REPO_ROOT/.githooks"
if [[ ! -d "$HOOKS_DIR" ]]; then
  HOOKS_DIR="$REPO_ROOT/slotforge-web/.githooks"
fi
if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "[install-hooks] .githooks directory not found — aborting." >&2
  exit 1
fi

# Make every hook executable (git silently skips non-exec hooks).
chmod +x "$HOOKS_DIR"/* 2>/dev/null || true
chmod +x "$REPO_ROOT/slotforge-web/scripts/"*.sh 2>/dev/null || true
chmod +x "$REPO_ROOT/scripts/"*.sh 2>/dev/null || true

# Point git at the shared hooks dir. Computed relative to the repo root
# so git commands run in any subdirectory pick it up correctly.
REL_HOOKS_DIR="$(realpath --relative-to="$REPO_ROOT" "$HOOKS_DIR" 2>/dev/null || python3 -c "import os,sys; print(os.path.relpath('$HOOKS_DIR', '$REPO_ROOT'))")"

git config core.hooksPath "$REL_HOOKS_DIR"

echo "[install-hooks] core.hooksPath set to $REL_HOOKS_DIR"
echo "[install-hooks] installed hooks:"
ls -la "$HOOKS_DIR" | grep -v '^d' | awk 'NR>1 {print "  " $NF}'
