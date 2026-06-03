#!/usr/bin/env bash
# push-github.sh — commit all local changes and push to GitHub.
#
# Requires GITHUB_TOKEN to be set as a Replit Secret.
# Run: bash scripts/push-github.sh
#
set -euo pipefail

REPO="baby-droid/digit-killer001"
BRANCH="${GITHUB_BRANCH:-replit-agent}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN secret is not set."
  echo "Add it in Replit Secrets (padlock icon) and try again."
  exit 1
fi

echo "=== Digit Killer GitHub Push ==="
echo "Repo  : $REPO"
echo "Branch: $BRANCH"
echo ""

# Configure authenticated remote
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${REPO}.git"

# Stage all changes (including untracked files)
git add -A

# Check if there is anything to commit
if git diff --staged --quiet; then
  echo "Nothing to commit — already up to date."
  git remote set-url origin "https://github.com/${REPO}.git"
  exit 0
fi

# Show a summary of staged changes
echo "Staged changes:"
git diff --staged --stat

# Commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M UTC')
git commit -m "Replit sync: ${TIMESTAMP}"

# Push
echo ""
echo "Pushing to origin/${BRANCH}..."
git push origin HEAD:"${BRANCH}"

# Remove auth token from remote URL for safety
git remote set-url origin "https://github.com/${REPO}.git"

echo ""
echo "=== Push complete! ==="
