#!/usr/bin/env bash
# SessionStart — BASE DE PROD (R23). Installe le mod db-guard (claude-mods/) à
# chaque nouvelle session (cloud comprise), sans intervention. Idempotent et
# non bloquant : les hooks du dépôt restent la couche garantie s'il échoue.
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ -f "$root/.claude-plugin/marketplace.json" ] || root="$(cd "$(dirname "$0")/../.." && pwd)"
command -v claude >/dev/null 2>&1 || exit 0
if ! claude plugin list 2>/dev/null | grep -q 'db-guard'; then
  claude plugin marketplace add "$root" >/dev/null 2>&1 || claude plugin marketplace update yaammoo >/dev/null 2>&1 || true
  claude plugin install db-guard@yaammoo --scope user >/dev/null 2>&1 || true
fi
if claude plugin list 2>/dev/null | grep -q 'db-guard'; then
  echo "db-guard (garde-fou base de prod, R23) : installé."
else
  echo "⚠️ db-guard non installé : seuls les hooks du dépôt protègent la base de prod (R23)."
fi
exit 0
