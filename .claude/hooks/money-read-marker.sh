#!/usr/bin/env bash
# PostToolUse (Read) — ARGENT (R22). Note l'heure de la dernière lecture de
# architecture/money-rules.md. require-money-rules.sh exige qu'elle date de
# moins de 15 minutes avant toute écriture qui touche à l'argent.

set -uo pipefail
. "$(dirname "$0")/lib-payload.sh"

payload=$(cat)
file=$(payload_get "$payload" '.tool_input.file_path') || exit 0
session=$(payload_get "$payload" '.session_id')

case "$file" in
  *money-rules.md) mkdir -p /tmp/claude-money-read && touch "/tmp/claude-money-read/${session:-nosession}" ;;
esac
exit 0
