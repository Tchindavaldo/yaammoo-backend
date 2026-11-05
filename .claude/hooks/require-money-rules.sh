#!/usr/bin/env bash
# PreToolUse — ARGENT (R22). BLOQUE toute écriture qui touche à l'argent si
# architecture/money-rules.md n'a pas été relu (Read, ou injection par
# money-context.sh) dans les 15 dernières minutes :
#   - Edit / Write / MultiEdit / NotebookEdit sur un fichier d'argent ;
#   - Bash qui modifie un fichier d'argent, pose un secret Fly ou déploie ;
#   - SQL (MCP execute_sql / apply_migration) qui écrit sur une table d'argent.
# Même si le fichier a été lu plus tôt : au-delà de 15 min, il faut le relire.

set -uo pipefail
. "$(dirname "$0")/lib-payload.sh"

payload=$(cat)
tool=$(payload_get "$payload" '.tool_name') || payload_die
session=$(payload_get "$payload" '.session_id')
marker="/tmp/claude-money-read/${session:-nosession}"
TTL=900

MONEY_FILE='(src/services/(pricing|wallet)/|settleDelivery|settlementPrecheck|creditMerchant|creditDriver|postTransaction|mwVerdict|webhookMobilewallet|mobilewalletService|validatePaymentAmount|paymentAggregator|mobileNetwork|(transactions|orderSettlements|orderDeliveries|withdrawals|platformTransfers|pendingPayments)\.repo|settings\.keys|architecture/(money-rules|pricing[^/]*|wallet|payment[^/]*|app-errors)\.md|src/features/(wallet|checkout|payment|cart|bonus)/|money-rules|money-guard)'
MONEY_TABLES='(transactions|order_settlements|order_deliveries|withdrawals|pending_payments|transaction_settlements|platform_revenues|settings_pricing|settings_withdrawal|settings_delivery|platform_transfer_locks|app_errors)'
SQL_WRITE='(insert|update|delete|alter|drop|truncate|create)[[:space:]]'

fresh() {
  [ -f "$marker" ] || return 1
  local age=$(( $(date +%s) - $(stat -c %Y "$marker" 2>/dev/null || stat -f %m "$marker") ))
  [ "$age" -lt "$TTL" ]
}

deny() {
  cat >&2 <<EOF
BLOQUÉ (R22 — ARGENT) : $1 touche à l'argent réel.
Relis d'abord architecture/money-rules.md EN ENTIER avec l'outil Read
(relecture exigée toutes les 15 minutes, même si tu l'as déjà lu), puis
recommence. Aucun chiffre d'argent de mémoire.
EOF
  exit 2
}

case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit)
    f=$(payload_get "$payload" '.tool_input.file_path')
    [ -z "$f" ] && f=$(payload_get "$payload" '.tool_input.notebook_path')
    if printf '%s' "$f" | grep -qiE "$MONEY_FILE"; then fresh || deny "$f"; fi
    ;;
  Bash)
    c=$(payload_get "$payload" '.tool_input.command')
    if printf '%s' "$c" | grep -qiE "$MONEY_FILE" && printf '%s' "$c" | grep -qE '(sed[[:space:]]+-i|>[[:space:]]*[^&[:space:]]|tee[[:space:]]|python3?[[:space:]]|perl[[:space:]]|git[[:space:]]+(apply|checkout[[:space:]]+--))'; then
      fresh || deny "cette commande"
    fi
    if printf '%s' "$c" | grep -qE '(flyctl[[:space:]]+secrets|flyctl[[:space:]]+deploy|fly-deploy)'; then fresh || deny "ce déploiement / secret"; fi
    ;;
  mcp__*execute_sql|mcp__*apply_migration)
    q=$(payload_get "$payload" '.tool_input.query')
    if printf '%s' "$q" | grep -qiE "$SQL_WRITE" && printf '%s' "$q" | grep -qiE "$MONEY_TABLES"; then fresh || deny "cette requête SQL"; fi
    ;;
  mcp__github__actions_run_trigger)
    fresh || deny "ce déclenchement de workflow (déploiement)"
    ;;
esac
exit 0
