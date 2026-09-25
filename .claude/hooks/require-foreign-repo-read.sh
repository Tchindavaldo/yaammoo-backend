#!/usr/bin/env bash
# PreToolUse — bloque tout Bash/Grep/Glob visant un AUTRE depot yaammoo tant que
# le CLAUDE.md ET le architecture/ de CE depot n'ont pas ete lus dans la session.
#
# Motif (R2) : « Interdit d'ouvrir, lire, explorer ou modifier les autres projets
# yaammoo sans autorisation EXPLICITE. Pas de Read, pas de grep, pas d'agent. »
# Aucun hook n'appliquait cette regle : no-bash-file-edit.sh ne filtre que la
# nature de la commande (lecture/edition), jamais le CHEMIN vise. Resultat, un
# `grep -rn ... ../Y0/BACKEND/` passait sans rien declencher.
#
# Meme logique que require-architecture-read.sh, appliquee au PERIMETRE au lieu
# de la feature : on n'interdit pas definitivement (l'utilisateur autorise
# souvent l'acces en cours de session), on exige d'avoir lu les regles du projet
# d'en face AVANT d'y toucher — son CLAUDE.md, qui porte ses propres R1..Rn, et
# son architecture/, qui evite l'exploration a l'aveugle.
#
# Le marqueur vit dans /tmp, cle par session ET par depot : il disparait a
# chaque nouvelle session, et chaque depot doit etre lu une fois.

set -uo pipefail

# shellcheck source=lib-payload.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib-payload.sh"

payload=$(cat)

tool=$(payload_get "$payload" '.tool_name') || payload_die
session=$(payload_get "$payload" '.session_id') || payload_die
[ -z "$session" ] && session="nosession"
marker_dir="/tmp/claude-foreign-read-${session}"

mkdir -p "$marker_dir" 2>/dev/null

# --- Depots voisins connus : <cle>:<motif de chemin> ---
# La cle nomme le marqueur ; le motif identifie le depot dans un chemin.
# Vu depuis le BACKEND : les depots etrangers sont l'app mobile et le site web.
FOREIGN_REPOS="mobile:Y0/yaammoo website:yaammoo-website"

# Nom du depot etranger mentionne dans une chaine, ou "" si aucun.
foreign_of() {
  local s="$1" entry key pat
  for entry in $FOREIGN_REPOS; do
    key="${entry%%:*}"
    pat="${entry#*:}"
    case "$s" in
      *"$pat"*) printf '%s' "$key"; return ;;
    esac
  done
}

# --- Cas 1 : lecture d'un CLAUDE.md / architecture/ d'un depot etranger ---
# On pose un marqueur par type de document ; l'acces exige les deux.
if [ "$tool" = "Read" ]; then
  path=$(payload_get "$payload" '.tool_input.file_path') || payload_die
  repo=$(foreign_of "$path")
  if [ -n "$repo" ]; then
    case "$path" in
      */CLAUDE.md)         : > "$marker_dir/${repo}.claude" ;;
      */architecture/*)    : > "$marker_dir/${repo}.arch" ;;
    esac
  fi
  exit 0
fi

# --- Cas 2 : determiner la cible selon l'outil ---
target=""
case "$tool" in
  Grep|Glob)
    pattern=$(payload_get "$payload" '.tool_input.pattern') || payload_die
    gpath=$(payload_get "$payload" '.tool_input.path') || payload_die
    target="${pattern} ${gpath}"
    ;;
  Bash)
    target=$(payload_get "$payload" '.tool_input.command') || payload_die
    ;;
  *)
    exit 0
    ;;
esac

repo=$(foreign_of "$target")
[ -z "$repo" ] && exit 0

# Les deux lectures sont exigees : les regles ET l'architecture du projet vise.
missing=""
[ -f "$marker_dir/${repo}.claude" ] || missing="CLAUDE.md"
[ -f "$marker_dir/${repo}.arch" ] || missing="${missing:+$missing et }architecture/"
[ -z "$missing" ] && exit 0

# Chemin reel du depot, pour donner une consigne directement actionnable.
case "$repo" in
  mobile)  repo_path="../yaammoo" ;;
  website) repo_path="../../yaammoo-website" ;;
  *)       repo_path="../${repo}" ;;
esac

cat >&2 <<EOF
BLOQUE (R2) — acces au depot "${repo}" sans avoir lu son ${missing}.

Commande refusee : ${target}

R2 : le travail par defaut se fait UNIQUEMENT dans yaammoo-website. Les autres
projets yaammoo ne s'explorent ni au Read, ni au grep, ni par un agent, sans
autorisation EXPLICITE de l'utilisateur.

Si l'utilisateur a donne cette autorisation, lis d'abord les regles du projet
d'en face — elles ne sont PAS celles d'ici :
  Read ${repo_path}/CLAUDE.md
  Read ${repo_path}/architecture/README.md

Une fois les deux lus, l'acces a CE depot est autorise pour le reste de la
session. Sans autorisation, demande-la et attends la reponse.

NOTE : pour un simple contrat d'API, R2 demande un curl sur l'endpoint plutot
que la lecture du code source du backend.
EOF
exit 2
