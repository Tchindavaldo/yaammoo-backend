#!/usr/bin/env bash
# PreToolUse — refuse les commandes Bash qui LISENT ou MODIFIENT un fichier
# alors que Read / Write / Edit font le travail.
#
# Motif : un `sed -i` qui ne matche rien reussit en silence ; `Edit` echoue et
# le signale. Un heredoc Python qui reecrit un fichier passe sous le radar du
# suivi de fichiers du harness. Les outils dedies sont plus surs et tracables.
#
# ⚠️ Ce hook ne bloque QUE l'edition/lecture de fichier. Bash reste libre pour
# ce qu'il sait faire seul : git, adb, npx, builds, mesures, pipelines.

set -uo pipefail

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty')
[ "$tool" = "Bash" ] || exit 0

cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')

# ⚠️ Les chevrons a l'interieur d'une chaine ne sont PAS des redirections : un
# message de commit contient `Co-Authored-By: <noreply@…>`, un echo peut citer
# du HTML. On analyse donc une version PRIVEE de ses contenus entre quotes,
# sinon le hook se declenche sur du texte.
stripped=$(printf '%s' "$cmd" | sed "s/'[^']*'/''/g; s/\"[^\"]*\"/\"\"/g")

# `git commit -m` / `git tag -m` : tout ce qui suit est un message, souvent
# multiligne (donc hors de portee du filtrage ci-dessus, qui travaille ligne par
# ligne) et contenant des chevrons legitimes (`Co-Authored-By: <mail>`).
# Ces commandes n'ecrivent aucun fichier du projet.
case "$cmd" in
  *"git commit"*|*"git tag "*|*"git merge"*|*"git revert"*) exit 0 ;;
esac

deny() {
  cat >&2 <<EOF
BLOQUE — cette commande Bash edite ou lit un fichier : ${1}

Utilise l'outil dedie a la place :
  lire un fichier            -> Read
  remplacer du texte         -> Edit
  creer / reecrire un fichier -> Write

Pourquoi : \`sed -i\` qui ne matche rien reussit en silence, Edit echoue et le
signale. Les outils dedies sont suivis par le harness, pas les heredocs.

Bash reste libre pour git, adb, npx, builds, mesures et pipelines.
EOF
  exit 2
}

# --- Redirection qui ecrit dans un fichier : `> f`, `>> f`, `tee f` ---
# On ignore /dev/null et les redirections vers le scratchpad (fichiers de
# travail temporaires, hors projet).
if printf '%s' "$stripped" | grep -qE '(^|[^0-9<>&])>>?[[:space:]]*[^&|[:space:]]' \
   && ! printf '%s' "$stripped" | grep -qE '>>?[[:space:]]*/dev/null' \
   && ! printf '%s' "$cmd" | grep -q '/scratchpad/'; then
  deny "redirection vers un fichier (> ou >>)"
fi

if printf '%s' "$stripped" | grep -qE '(^|\|[[:space:]]*|&&[[:space:]]*|;[[:space:]]*)tee[[:space:]]'; then
  deny "tee ecrit dans un fichier"
fi

# --- Edition en place ---
if printf '%s' "$cmd" | grep -qE '\bsed[[:space:]]+(-[a-zA-Z]*i|--in-place)'; then
  deny "sed -i (edition en place)"
fi
if printf '%s' "$cmd" | grep -qE '\bperl[[:space:]]+.*-i'; then
  deny "perl -i (edition en place)"
fi
if printf '%s' "$cmd" | grep -qE '\btruncate\b'; then
  deny "truncate modifie un fichier"
fi

# --- Heredoc vers un interpreteur : le motif exact utilisé pour reecrire des
#     fichiers en contournant Write. ---
if printf '%s' "$cmd" | grep -qE '\b(python3?|node|ruby|perl)\b.*<<'; then
  deny "heredoc vers un interpreteur (reecriture de fichier deguisee)"
fi

# --- Lecture pure d'un fichier -> Read ---
# Uniquement quand la commande se resume a ca : `cat f`, `head -n 20 f`.
# Un `cat` dans un pipe (`cat f | grep x`) reste autorise, c'est du traitement.
if ! printf '%s' "$cmd" | grep -qE '\||&&|;'; then
  if printf '%s' "$cmd" | grep -qE '^[[:space:]]*(cat|head|tail|less|more)[[:space:]]+(-[a-zA-Z0-9]+[[:space:]]+|[0-9]+[[:space:]]+)*[^-][^[:space:]]*[[:space:]]*$'; then
    # `tail -f` est un suivi de flux, pas une lecture ponctuelle.
    printf '%s' "$cmd" | grep -qE '\btail[[:space:]]+.*-f' || deny "lecture d'un fichier"
  fi
  if printf '%s' "$cmd" | grep -qE '^[[:space:]]*sed[[:space:]]+-n[[:space:]]+.[0-9]+,[0-9]+p'; then
    deny "sed -n '<debut>,<fin>p' = lecture d'une plage (Read a offset/limit)"
  fi
fi

exit 0
