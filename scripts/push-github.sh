#!/usr/bin/env bash
# push-github.sh — pull latest, commit all local changes, and push to GitHub.
# Run via the "Push to GitHub" workflow or: bash scripts/push-github.sh
#
# Requires GITHUB_TOKEN to be set as a Replit Secret.
set -euo pipefail

REPO="baby-droid/digit-killer001"
BRANCH="${GITHUB_BRANCH:-replit-agent}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M UTC')

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN secret is not set."
  echo "Add it in Replit Secrets (padlock icon) and try again."
  exit 1
fi

echo "=== Digit Killer GitHub Full Sync ==="
echo "Repo  : $REPO"
echo "Branch: $BRANCH"
echo ""

# ── Configure git identity (required in Replit's container) ─────────────────
git config user.email "replit-agent@digit-killer.local" 2>/dev/null || true
git config user.name  "Replit Agent" 2>/dev/null || true

# ── Authenticate remote ───────────────────────────────────────────────────────
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${REPO}.git" 2>/dev/null || \
  git remote add origin "https://${GITHUB_TOKEN}@github.com/${REPO}.git"

# ── Step 1: Fetch remote ──────────────────────────────────────────────────────
echo "Fetching remote..."
git fetch origin "${BRANCH}" 2>/dev/null || echo "(Branch ${BRANCH} doesn't exist on remote yet — will create on push.)"

REMOTE_EXISTS=$(git branch -r --list "origin/${BRANCH}" | wc -l | tr -d ' ')

# ── Step 2: Merge any remote-only commits (Replit changes win on conflict) ───
if [ "$REMOTE_EXISTS" -gt "0" ]; then
  BEHIND=$(git rev-list "HEAD..origin/${BRANCH}" --count 2>/dev/null || echo "0")
  if [ "$BEHIND" -gt "0" ]; then
    echo "Remote has $BEHIND new commit(s). Merging (ours strategy)…"
    git merge --no-edit -X ours "origin/${BRANCH}" 2>/dev/null || {
      echo "Auto-merge failed — aborting merge, keeping local state."
      git merge --abort 2>/dev/null || true
    }
  else
    echo "Remote is up to date — no merge needed."
  fi
fi

# ── Step 3: Stage and commit all local changes ────────────────────────────────
git add -A

if git diff --staged --quiet; then
  echo "Nothing new to commit — workspace is already in sync."
else
  echo ""
  echo "Staged changes:"
  git diff --staged --stat
  echo ""
  git commit -m "Replit sync: ${TIMESTAMP}"
  echo ""
  echo "Committed: Replit sync: ${TIMESTAMP}"
fi

# ── Step 4: Push ──────────────────────────────────────────────────────────────
echo ""
echo "Pushing to origin/${BRANCH}…"
if [ "$REMOTE_EXISTS" -gt "0" ]; then
  git push origin "HEAD:${BRANCH}"
else
  # First push: create the remote branch
  git push --set-upstream origin "HEAD:${BRANCH}"
fi

# ── Cleanup: remove auth token from remote URL ────────────────────────────────
git remote set-url origin "https://github.com/${REPO}.git" 2>/dev/null || true

echo ""
echo "=== Push complete! GitHub is up to date. ==="
echo ""
echo "Tip: Restart the 'API Server' and 'Start application' workflows"
echo "     if you pulled dependency changes from GitHub."
