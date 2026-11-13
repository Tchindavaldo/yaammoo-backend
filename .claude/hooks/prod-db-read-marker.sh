#!/usr/bin/env bash
# PostToolUse (Read) — BASE DE PROD (R23). Note l'heure de la dernière lecture
# de architecture/prod-db-rules.md. prod-db-guard.sh exige qu'elle date de
# moins de 15 minutes avant tout appel à la base de prod.

set -uo pipefail
. "$(dirname "$0")/lib-payload.sh"

payload=$(cat)
file=$(payload_get "$payload" '.tool_input.file_path') || exit 0
session=$(payload_get "$payload" '.session_id')

case "$file" in
  *prod-db-rules.md) mkdir -p /tmp/claude-prodb-read && touch "/tmp/claude-prodb-read/${session:-nosession}" ;;
esac
exit 0
