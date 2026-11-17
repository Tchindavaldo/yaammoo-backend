#!/usr/bin/env bash
# PreToolUse (Bash) : INTERDIT de creer, basculer sur ou pousser une branche
# `claude/...` (branche de session cloud). On travaille sur feature/ ou debug/,
# puis demande de fusion dans dev (R29 frontend / R25 backend).
payload=$(cat)
cmd=$(printf '%s' "$payload" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception: print("")')
if printf '%s' "$cmd" | grep -Eq 'git[^|;&]*(checkout|switch|branch|push|worktree)[^|;&]*claude/'; then
  echo "BLOQUE (R29/R25) : aucune branche claude/... Travailler sur feature/<sujet> ou debug/<sujet>, puis demander la fusion dans dev (AskUserQuestion)." >&2
  exit 2
fi
exit 0
