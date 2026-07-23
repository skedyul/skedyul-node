#!/usr/bin/env bash
set -euo pipefail

if [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  echo "OIDC token not available — ensure id-token: write is set on the publish-npm workflow job." >&2
  exit 1
fi

strip_auth_lines() {
  local file="$1"
  [ -f "$file" ] || return 0
  sed -i '/_authToken/d' "$file"
  sed -i '/^always-auth/d' "$file"
}

strip_auth_lines "${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}"
strip_auth_lines "$HOME/.npmrc"
if [ -n "${RUNNER_TEMP:-}" ]; then
  strip_auth_lines "$RUNNER_TEMP/.npmrc"
fi

unset NODE_AUTH_TOKEN NPM_TOKEN

echo "Prepared npmrc for OIDC trusted publishing."
