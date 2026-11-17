#!/usr/bin/env bash
# Stop : travail fini sur une branche non fusionnee dans dev -> on bloque la fin
# du tour et on exige une DEMANDE de fusion a boutons (AskUserQuestion).
# R29 frontend / R25 backend.
payload=$(cat)
# Deuxieme passage (le user a deja ete sollicite dans ce tour) : on laisse finir.
echo "$payload" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
case "$branch" in main|dev|HEAD) exit 0 ;; esac
git rev-parse --verify -q origin/dev >/dev/null || exit 0
ahead=$(git rev-list --count origin/dev..HEAD 2>/dev/null || echo 0)
[ "$ahead" -gt 0 ] || exit 0
reason="R29/R25 : la branche '$branch' a $ahead commit(s) absents de dev. Avant de finir, envoie une DEMANDE via l'outil AskUserQuestion (boutons Valider / Refuser) pour fusionner '$branch' dans dev. Valider = fusion + push de dev. Jamais un simple message texte."
printf '{"decision":"block","reason":"%s"}\n' "$reason"
exit 0
