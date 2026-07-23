#!/usr/bin/env bash
set -euo pipefail

declare -A LABELS=(
  ["Bug Fix"]="d73a4a"
  ["New Feature"]="0e8a16"
  ["Infrastructure"]="1d76db"
  ["Data Fix or Migration"]="5319e7"
  ["auto-templated"]="cfd3d7"
)

for label in "${!LABELS[@]}"; do
  color="${LABELS[$label]}"
  if gh label list --json name --jq '.[].name' | grep -Fxq "$label"; then
    echo "Label exists: $label"
  else
    gh label create "$label" --color "$color" --force
    echo "Created label: $label"
  fi
done
