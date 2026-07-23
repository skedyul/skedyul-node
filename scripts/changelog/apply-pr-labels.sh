#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?PR number required}"
CLASSIFICATION="${2:?classification required}"

CLASSIFICATION_LABELS=(
  "Bug Fix"
  "New Feature"
  "Infrastructure"
  "Data Fix or Migration"
)

valid=false
for label in "${CLASSIFICATION_LABELS[@]}"; do
  if [ "$label" = "$CLASSIFICATION" ]; then
    valid=true
    break
  fi
done

if [ "$valid" != "true" ]; then
  echo "Invalid classification: $CLASSIFICATION" >&2
  exit 1
fi

for label in "${CLASSIFICATION_LABELS[@]}"; do
  gh pr edit "$PR_NUMBER" --remove-label "$label" 2>/dev/null || true
done

gh pr edit "$PR_NUMBER" --add-label "$CLASSIFICATION"
gh pr edit "$PR_NUMBER" --add-label "auto-templated" 2>/dev/null || true

echo "Applied classification label: $CLASSIFICATION"
