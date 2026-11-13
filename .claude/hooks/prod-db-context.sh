#!/usr/bin/env bash
# UserPromptSubmit — BASE DE PROD (R23). Dès que le message parle de base de
# données, de prod, de migration ou de Supabase, injecte
# architecture/prod-db-rules.md EN ENTIER, à CHAQUE message. Le contenu fourni
# vaut relecture pour prod-db-guard.sh. Exécuté par le harness : l'agent ne
# peut pas l'oublier.

set -uo pipefail
. "$(dirname "$0")/lib-payload.sh"

payload=$(cat)
prompt=$(payload_get "$payload" '.prompt') || payload_die
session=$(payload_get "$payload" '.session_id')
project_dir=$(payload_get "$payload" '.cwd')
[ -n "${CLAUDE_PROJECT_DIR:-}" ] && project_dir="$CLAUDE_PROJECT_DIR"

rules=""
for c in "$project_dir/architecture/prod-db-rules.md" "$project_dir/yaammoo-backend/architecture/prod-db-rules.md" "$project_dir/../yaammoo-backend/architecture/prod-db-rules.md" "/home/user/yaammoo-backend/architecture/prod-db-rules.md" "$(dirname "$0")/../../architecture/prod-db-rules.md"; do
  [ -f "$c" ] && { rules="$c"; break; }
done

# Large exprès : mieux vaut injecter à tort.
DB_RE='(\bbd\b|\bdb\b|base de donn|database|supabase|\bsql\b|table|migr|\bprod|production|yaammoo|yamo|schema|sch[ée]ma|requ[êe]te|query|insert|update|delete|drop|truncate|backup|sauvegard|dump|restaur|vrais? clients?|utilisateurs?|\busers?\b|donn[ée]es)'

if printf '%s' "$prompt" | grep -qiE "$DB_RE"; then
  if [ -z "$rules" ]; then
    echo "⚠️ BASE DE PROD (R23) : architecture/prod-db-rules.md INTROUVABLE. N'effectue AUCUN appel à la base de prod avant de l'avoir retrouvé et lu."
    exit 0
  fi
  mkdir -p /tmp/claude-prodb-read && touch "/tmp/claude-prodb-read/${session:-nosession}"
  echo "=== BASE DE PROD — RÈGLES OBLIGATOIRES (hook prod-db-context, R23) ==="
  echo "La base yaammoo (projet vcuskusfywrigdrkgnur) est celle des VRAIS CLIENTS."
  echo "Annonce chaque requête en une phrase, aucune écriture sans accord explicite."
  echo "----- BEGIN architecture/prod-db-rules.md -----"
  cat "$rules"
  echo "----- END architecture/prod-db-rules.md -----"
fi
exit 0
