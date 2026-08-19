#!/usr/bin/env bash
# Hook UserPromptSubmit — injecte CLAUDE.md + architecture/README.md EN ENTIER
# au tout premier prompt de chaque session. Exécuté par le harness, pas par le
# modèle : la lecture ne peut donc pas être « oubliée ».
#
# Un marqueur par session_id garantit une injection unique (pas à chaque message).

set -euo pipefail

payload=$(cat)

session_id=$(printf '%s' "$payload" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
project_dir=$(printf '%s' "$payload" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$project_dir" ] || project_dir="$CLAUDE_PROJECT_DIR"

marker_dir="${TMPDIR:-/tmp}/claude-session-start"
marker="$marker_dir/${session_id:-unknown}"
mkdir -p "$marker_dir"

# Déjà injecté pour cette session → ne rien faire.
[ -f "$marker" ] && exit 0
touch "$marker"

claude_md="$project_dir/CLAUDE.md"
arch_md="$project_dir/architecture/README.md"

claude_lines=0; arch_lines=0; rules=0
[ -f "$claude_md" ] && claude_lines=$(wc -l < "$claude_md" | tr -d ' ') \
  && rules=$(grep -c '^## R[0-9]\+ — ' "$claude_md" || true)
[ -f "$arch_md" ] && arch_lines=$(wc -l < "$arch_md" | tr -d ' ')

echo "=== LECTURE DE FOND EN COMBLE (hook session-start, injection automatique) ==="
echo "Les deux fichiers ci-dessous sont fournis INTÉGRALEMENT. Applique-les"
echo "immédiatement, dès cette première réponse. Ne les résume pas."
echo
echo "ACCUSÉ OBLIGATOIRE — commence ta toute première réponse de cette session"
echo "par cette ligne EXACTE, seule sur sa ligne, puis réponds normalement :"
echo
echo "✅ CLAUDE.md lu en entier (${claude_lines} l., ${rules} règles R1→R${rules}) + architecture/README.md (${arch_lines} l.)"
echo

if [ -f "$claude_md" ]; then
  echo "----- BEGIN CLAUDE.md ($(wc -l < "$claude_md") lignes) -----"
  cat "$claude_md"
  echo "----- END CLAUDE.md -----"
else
  echo "⚠️ CLAUDE.md introuvable à $claude_md"
fi
echo

if [ -f "$arch_md" ]; then
  echo "----- BEGIN architecture/README.md ($(wc -l < "$arch_md") lignes) -----"
  cat "$arch_md"
  echo "----- END architecture/README.md -----"
else
  echo "⚠️ architecture/README.md introuvable à $arch_md"
fi
echo
echo "=== FIN LECTURE OBLIGATOIRE ==="
