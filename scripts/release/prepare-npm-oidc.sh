#!/usr/bin/env bash
set -euo pipefail

if [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  echo "OIDC token not available — ensure id-token: write is set."
  exit 1
fi

NPMRC_PATH="${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}"
if [ -f "$NPMRC_PATH" ]; then
  sed -i '/_authToken/d' "$NPMRC_PATH"
fi
if [ -f "$HOME/.npmrc" ] && [ "$HOME/.npmrc" != "$NPMRC_PATH" ]; then
  sed -i '/_authToken/d' "$HOME/.npmrc"
fi
unset NODE_AUTH_TOKEN
