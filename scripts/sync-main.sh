#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-main}"
STASHED=0
STASH_NAME="sync-main-autostash-$(date +%Y%m%d%H%M%S)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Saving local uncommitted work..."
  git stash push -u -m "$STASH_NAME"
  STASHED=1
fi

restore_stash() {
  if [[ "$STASHED" == "1" ]]; then
    echo "Restoring local uncommitted work..."
    git stash pop
    STASHED=0
  fi
}

on_exit() {
  local status=$?
  if [[ "$status" -ne 0 && "$STASHED" == "1" ]]; then
    echo
    echo "Sync stopped before local work was restored."
    echo "Your work is still safe in git stash. Run: git stash list"
  fi
}
trap on_exit EXIT

echo "Rebasing local commits on ${REMOTE}/${BRANCH}..."
git pull --rebase "$REMOTE" "$BRANCH"

echo "Pushing ${BRANCH}..."
git push "$REMOTE" "$BRANCH"

restore_stash

echo "Done."
