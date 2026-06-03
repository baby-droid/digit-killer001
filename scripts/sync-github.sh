#!/usr/bin/env bash
# sync-github.sh — pull latest changes from GitHub into this Replit.
#
# Requires GITHUB_TOKEN to be set as a Replit Secret.
# Run via the "Sync from GitHub" workflow or manually:
#   bash scripts/sync-github.sh
#
set -euo pipefail

REPO="baby-droid/digit-killer001"
BRANCH="${GITHUB_BRANCH:-replit-agent}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN secret is not set."
  echo "Add it in Replit Secrets (padlock icon) and try again."
  exit 1
fi

echo "=== Digit Killer GitHub Sync ==="
echo "Repo  : $REPO"
echo "Branch: $BRANCH"
echo ""

# Configure authenticated remote
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${REPO}.git"

# Fetch latest
echo "Fetching from GitHub..."
git fetch origin "$BRANCH"

# Show incoming commits
INCOMING=$(git rev-list HEAD..origin/"$BRANCH" --count 2>/dev/null || echo "0")
if [ "$INCOMING" = "0" ]; then
  echo "Already up to date. No new commits."
  git remote set-url origin "https://github.com/${REPO}.git"
  exit 0
fi

echo "$INCOMING new commit(s) incoming:"
git log HEAD..origin/"$BRANCH" --oneline

# Apply changes
echo ""
echo "Applying changes..."
git merge --ff-only origin/"$BRANCH" || git reset --hard origin/"$BRANCH"

# Install any new dependencies
echo ""
echo "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Remove auth token from remote URL for safety
git remote set-url origin "https://github.com/${REPO}.git"

echo ""
echo "=== Sync complete! Restarting workflows... ==="
