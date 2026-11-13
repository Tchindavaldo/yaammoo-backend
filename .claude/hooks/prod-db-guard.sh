#!/usr/bin/env bash
# PreToolUse — BASE DE PROD (R23). Cible : compte Supabase yaammoo@ (vrais
# clients), joint par l'API de gestion api.supabase.com (jeton injecté par le
# proxy) ou par MCP si un connecteur pointe un jour le projet de prod.
#
#   RELECTURE : tout appel prod (même en lecture) exige que
#               architecture/prod-db-rules.md ait été lu < 15 min.
#   DENY      : gestion du compte/projet, DELETE/PATCH/PUT, SQL destructif ou
#               système, DELETE/UPDATE sans WHERE, jeton envoyé à la main,
#               sortie prod envoyée vers un autre hôte ou écrite hors /tmp.
#   ASK       : toute écriture SQL et tout POST hors SQL — validation de
#               l'utilisateur à CHAQUE fois, même en mode automatique.
#               Commande visant la prod HORS API de gestion (machine Fly,
#               stockage) : ASK aussi, sauf suppression (DENY).
#   TEST      : appel à la seule base de test (xaocrc…) : hors périmètre.
#   ARGENT    : écriture sur une table d'argent => money-rules.md relu < 15 min.
#   READ      : lectures autorisées.
# Chaque décision est journalisée dans .claude/prod-audit.log. Fail-closed :
# payload illisible => blocage. Règles : architecture/prod-db-rules.md.

set -uo pipefail
. "$(dirname "$0")/lib-payload.sh"

PROD_REF='vcuskusfywrigdrkgnur'
TEST_REF='xaocrcxnueqxnyfqaayf' # base de test yamo@, seul autre projet autorisé
TTL=900
payload=$(cat)
tool=$(payload_get "$payload" '.tool_name') || payload_die

case "$tool" in
  Bash)
    c=$(payload_get "$payload" '.tool_input.command') || payload_die
    printf '%s' "$c" | grep -qiE "api\.supabase\.com|$PROD_REF" || exit 0
    via=api ;;
  mcp__*execute_sql|mcp__*apply_migration)
    pid=$(payload_get "$payload" '.tool_input.project_id')
    [ "$pid" = "$PROD_REF" ] || exit 0
    c=$(payload_get "$payload" '.tool_input.query') || payload_die
    via=mcp ;;
  mcp__*)
    pid=$(payload_get "$payload" '.tool_input.project_id')
    [ "$pid" = "$PROD_REF" ] || exit 0
    c="$tool"
    case "$tool" in
      *list_*|*get_project*|*get_advisors|*get_logs|*search_docs|*generate_typescript_types) via=mcp-read ;;
      *) via=mcp-admin ;;
    esac ;;
  *) exit 0 ;;
esac

session=$(payload_get "$payload" '.session_id')
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
log="$root/.claude/prod-audit.log"
lc=$(printf '%s' "$c" | tr '[:upper:]' '[:lower:]')

audit() {
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "${session:-?}" "$tool" "$1" \
    "$(printf '%s' "$c" | tr '\n\t' '  ' | cut -c1-800)" >>"$log" 2>/dev/null || true
}
deny() {
  audit "DENY:$1"
  cat >&2 <<EOF
BLOQUÉ (R23 — BASE DE PROD yaammoo, vrais clients) : $1.
Garde-fou architecture/prod-db-rules.md. Si l'action est vraiment nécessaire,
l'utilisateur la fait lui-même dans le dashboard Supabase.
EOF
  exit 2
}
ask() {
  audit "ASK:$1"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"BASE DE PROD yaammoo (vrais clients) : %s. Valider seulement apres avoir lu la requete."}}\n' "$1"
  exit 0
}
fresh() { # fresh <dossier marqueur>
  local m="/tmp/$1/${session:-nosession}" age
  [ -f "$m" ] || return 1
  age=$(( $(date +%s) - $(stat -c %Y "$m" 2>/dev/null || stat -f %m "$m") ))
  [ "$age" -lt "$TTL" ]
}

# 0. Relecture des règles prod exigée pour TOUT appel prod.
fresh claude-prodb-read || deny "architecture/prod-db-rules.md non relu dans les 15 dernières minutes (Read obligatoire avant tout appel prod)"

[ "$via" = "mcp-admin" ] && deny "outil d'administration MCP sur le projet de prod ($tool)"
[ "$via" = "mcp-read" ] && { audit READ; exit 0; }

if [ "$via" = "api" ]; then
  # 0bis. Base de TEST seule (aucune mention de la prod) : hors périmètre prod.
  if ! printf '%s' "$lc" | grep -q "$PROD_REF"; then
    refs=$(printf '%s' "$lc" | grep -oE 'api\.supabase\.com/v1/projects/[a-z0-9]+' | sed 's|.*/||' | sort -u)
    if [ -n "$refs" ] && [ "$refs" = "$TEST_REF" ]; then audit TEST; exit 0; fi
  fi
  # 0ter. Vise la prod SANS passer par l'API de gestion (machine Fly prod,
  # stockage, script lancé avec les clés de la machine) : les règles de l'API
  # de gestion ne s'appliquent pas, mais l'utilisateur valide CHAQUE appel.
  if ! printf '%s' "$lc" | grep -q 'api\.supabase\.com'; then
    printf '%s' "$lc" | grep -qE 'drop[[:space:]]+(database|schema|table)|truncate([[:space:]]|;)|delete[[:space:]]+from|remove\(|\.remove\(|emptybucket|deletebucket|-x[[:space:]]*['\''"]?delete' \
      && deny "suppression ou SQL destructif hors API de gestion"
    ask "commande qui vise la prod hors API de gestion (machine Fly, stockage)"
  fi
  # 1. Jeton : jamais à la main (le proxy l'injecte).
  printf '%s' "$lc" | grep -qE 'authorization:|bearer[[:space:]]|sbp_[a-z0-9]|apikey:|x-api-key|service_role' \
    && deny "jeton ou en-tête d'authentification envoyé à la main"
  # 2. Exfiltration : un seul client HTTP par commande (pas de relais vers un
  #    autre hôte), aucun outil d'envoi, sortie fichier seulement dans /tmp.
  nclients=$(printf '%s' "$lc" | grep -oE '(^|[^a-z_])(curl|wget|http|httpie|xh)[[:space:]]' | wc -l)
  [ "$nclients" -gt 1 ] && deny "plusieurs clients HTTP dans la même commande (relais possible des données prod)"
  printf '%s' "$lc" | grep -qE '(^|[^a-z_])(wget|nc|ncat|socat|scp|rsync|ssh|ftp|sftp|sendmail|mail|gsutil|aws|rclone)[[:space:]]' \
    && deny "outil réseau ou d'envoi dans une commande prod"
  TARGET='['\''"]?(\.|~|\$|/(home|root|workspace|srv|opt|var|etc|usr)|[a-z_][a-z0-9_./-]*\.(sql|json|csv|tsv|txt|dump|log|gz|zip|bak))'
  printf '%s' "$lc" | grep -qE "(>>?|tee([[:space:]]+-a)?)[[:space:]]*$TARGET|(^|[[:space:]])(-o|--output)[[:space:]]+$TARGET" \
    && deny "sortie prod écrite hors de /tmp (données clients jamais dans le dépôt)"
  # 3. Méthodes et endpoints de gestion.
  printf '%s' "$lc" | grep -qE '(-x|--request)[[:space:]]*['\''"]?(delete|patch|put)' \
    && deny "méthode DELETE/PATCH/PUT sur l'API de gestion"
  printf '%s' "$lc" | grep -qE '/(pause|restore|unpause|upgrade|api-keys|secrets|branches|network-restrictions|network-bans|ssl-enforcement|custom-hostname|vanity-subdomain|billing|readonly|jit|postgrest|config/|functions|storage|organizations|backups|transfer|members|oauth)' \
    && deny "endpoint de gestion du compte ou du projet"
  printf '%s' "$lc" | grep -qE 'api\.supabase\.com/v1/projects/?([[:space:]'\''"?]|$)' \
    && printf '%s' "$lc" | grep -qE '(-x|--request)[[:space:]]*['\''"]?post|(^|[[:space:]])(-d|--data[a-z-]*|-f|--form)[[:space:]]' \
    && deny "création de projet"
  # 4. Seuls la prod et le projet de test yamo connus peuvent être visés.
  printf '%s' "$lc" | grep -qE 'api\.supabase\.com/v1/projects/[a-z0-9]+' \
    && ! printf '%s' "$lc" | grep -qE "api\.supabase\.com/v1/projects/($PROD_REF|$TEST_REF)" \
    && deny "projet inconnu sur le compte de prod"
fi

is_sql=0
[ "$via" = "mcp" ] && is_sql=1
printf '%s' "$lc" | grep -qE '/database/(query|migrations)' && is_sql=1

if [ "$is_sql" = 1 ]; then
  printf '%s' "$lc" | grep -qE 'drop[[:space:]]+(database|schema|table|owned|role|user|policy|trigger|function|extension|publication)|truncate([[:space:]]|;)|pg_terminate_backend|pg_cancel_backend|alter[[:space:]]+(role|user|system|database)|disable[[:space:]]+(row[[:space:]]+level[[:space:]]+security|trigger)|no[[:space:]]+force[[:space:]]+row|copy[[:space:]].*(program|to[[:space:]])|pg_read_file|pg_ls_dir|pg_read_binary|lo_import|lo_export|dblink|set[[:space:]]+session_replication_role|security[[:space:]]+definer' \
    && deny "SQL destructif, système ou contournant la sécurité"
  printf '%s' "$lc" | grep -qE 'delete[[:space:]]+from[[:space:]]' \
    && ! printf '%s' "$lc" | grep -qE 'delete[[:space:]]+from[[:space:]].*[[:space:]]where[[:space:]]' \
    && deny "DELETE sans WHERE"
  printf '%s' "$lc" | grep -qE 'update[[:space:]]+[a-z0-9_."]+[[:space:]]+set[[:space:]]' \
    && ! printf '%s' "$lc" | grep -qE 'update[[:space:]]+[a-z0-9_."]+[[:space:]]+set[[:space:]].*[[:space:]]where[[:space:]]' \
    && deny "UPDATE sans WHERE"
  if printf '%s' "$lc" | grep -qE '(^|[^a-z_])(insert|update|delete|alter|create|drop|grant|revoke|comment|merge|call|do|reindex|vacuum|cluster|refresh|set|select[[:space:]].*into[[:space:]])([[:space:]]|$)'; then
    if printf '%s' "$lc" | grep -qE '(^|[^a-z_])(transactions|order_settlements|order_deliveries|withdrawals|pending_payments|transaction_settlements|platform_revenues|settings_pricing|settings_withdrawal|settings_delivery|platform_transfer_locks|app_errors)([^a-z_]|$)'; then
      fresh claude-money-read || deny "écriture sur une table d'argent sans relecture de architecture/money-rules.md (< 15 min, R22)"
    fi
    ask "requete SQL d ECRITURE"
  fi
  audit READ_SQL
  exit 0
fi

# 5. Tout autre envoi de données.
printf '%s' "$lc" | grep -qE '(-x|--request)[[:space:]]*['\''"]?post|(^|[[:space:]])(-d|--data[a-z-]*|-f|--form|-t|--upload-file)[[:space:]]' \
  && ask "requete POST sur l API de gestion"

audit READ
exit 0
