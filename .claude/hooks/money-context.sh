#!/usr/bin/env bash
# UserPromptSubmit — ARGENT (R22). Dès que le message parle d'argent, injecte
# architecture/money-rules.md EN ENTIER, à CHAQUE message (pas une fois par
# session) : même si le fichier a déjà été lu, il est relu. Exécuté par le
# harness : l'agent ne peut pas l'oublier.

set -uo pipefail
. "$(dirname "$0")/lib-payload.sh"

payload=$(cat)
prompt=$(payload_get "$payload" '.prompt') || payload_die
session=$(payload_get "$payload" '.session_id')
project_dir=$(payload_get "$payload" '.cwd')
[ -n "${CLAUDE_PROJECT_DIR:-}" ] && project_dir="$CLAUDE_PROJECT_DIR"

rules=""
for c in "$project_dir/architecture/money-rules.md" "$project_dir/yaammoo-backend/architecture/money-rules.md" "$project_dir/../yaammoo-backend/architecture/money-rules.md" "$(dirname "$0")/../../architecture/money-rules.md"; do
  [ -f "$c" ] && { rules="$c"; break; }
done

# Vocabulaire de l'argent (FR + EN). Large exprès : mieux vaut injecter à tort.
MONEY_RE='(frais|marge|retrait|d[ée]p[ôo]t|paiement|payer|pay[ée]|solde|cr[ée]dit|d[ée]bit|portefeuille|wallet|fcfa|xaf|[0-9] ?f\b|francs?|argent|prix|tarif|commission|r[ée]serve|kiosque|payout|deposit|pawapay|digikuntz|mobilewallet|mobile wallet|orange money|momo|mtn|r[èe]glement|settlement|reverse|rembours|transaction|facture|montant|livraison|course|bonus|gratuit|offert|caisse|money|fee|margin|refund|balance|price)'

if printf '%s' "$prompt" | grep -qiE "$MONEY_RE"; then
  if [ -z "$rules" ]; then
    echo "⚠️ ARGENT (R22) : architecture/money-rules.md INTROUVABLE. Ne donne aucun chiffre d'argent et ne modifie aucun fichier d'argent avant de l'avoir retrouvé et lu."
    exit 0
  fi
  # Le contenu est fourni : vaut relecture pour le garde-fou PreToolUse.
  mkdir -p /tmp/claude-money-read && touch "/tmp/claude-money-read/${session:-nosession}"
  echo "=== ARGENT — RÈGLES OBLIGATOIRES (hook money-context, R22) ==="
  echo "Ce message touche à l'argent RÉEL. Applique le fichier ci-dessous à la lettre :"
  echo "aucun chiffre de mémoire, relis settings_* en base et le code source avant chaque chiffre."
  echo "----- BEGIN architecture/money-rules.md -----"
  cat "$rules"
  echo "----- END architecture/money-rules.md -----"
fi
exit 0
