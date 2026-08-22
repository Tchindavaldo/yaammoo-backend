#!/usr/bin/env bash
# PreToolUse — bloque toute recherche (Grep/Glob/grep-shell) tant que l'agent
# n'a pas lu l'architecture/<feature>.md CORRESPONDANT au fichier/dossier vise.
#
# Motif (R3) : lire un seul architecture/*.md (ex. README.md) une fois par
# session ne dit rien sur l'ecran/la feature reellement grep-ee ensuite. On
# exige donc la lecture du doc de la feature concernee, par feature.
#
# Detection AUTOMATIQUE, sans liste codee en dur : la feature est deduite du
# chemin cible (segment apres src/features/, ou nom de fichier app/(tabs)/).
# Une feature (dossier ou fichier) qui n'a pas encore de architecture/*.md
# n'est simplement pas couverte par le hook -> pas de blocage sur elle, rien a
# maintenir a chaque nouvelle feature.
#
# Le marqueur vit dans /tmp, cle par session ET par feature : il disparait a
# chaque nouvelle session, et chaque feature doit etre lue une fois.

set -uo pipefail

payload=$(cat)

tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty')
session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')
marker_dir="/tmp/claude-arch-read-${session}"
arch_dir="${CLAUDE_PROJECT_DIR:-.}/architecture"

# --- Deduit le nom de doc feature (sans .md) depuis un chemin/pattern, en ne
# se basant QUE sur la structure du repo (src/features/<x>, app/(tabs)/<x>.tsx)
# puis en verifiant qu'un architecture/<x>.md existe reellement. ---
feature_of() {
  local s="$1" candidate=""

  # Backend : la feature est le segment apres services/, controllers/,
  # repositories/supabase/ ou routes/ (l'equivalent de src/features/ cote front).
  # Les fichiers plats (getFastFoods.js, orders.repo.js) portent aussi le nom.
  if [[ "$s" =~ src/services/([a-zA-Z0-9_-]+) ]]; then
    candidate="${BASH_REMATCH[1]}"
  elif [[ "$s" =~ src/controllers/([a-zA-Z0-9_-]+) ]]; then
    candidate="${BASH_REMATCH[1]}"
  elif [[ "$s" =~ src/repositories/supabase/([a-zA-Z0-9_-]+)\.repo ]]; then
    candidate="${BASH_REMATCH[1]}"
  elif [[ "$s" =~ src/routes/([a-zA-Z0-9_-]+) ]]; then
    candidate="${BASH_REMATCH[1]}"
  fi

  # `.repo`, `.service`, `.controller` ne font pas partie du nom du doc.
  candidate="${candidate%.repo}"
  candidate="${candidate%.service}"
  candidate="${candidate%.controller}"

  [ -z "$candidate" ] && return

  # Le nom du dossier/fichier de code ne colle pas toujours 1:1 au nom du doc
  # (ex. feature "orders" -> orders-client.md / orders-merchant.md). On
  # cherche donc tout architecture/*.md dont le nom COMMENCE par le candidat.
  local match
  match=$(find "$arch_dir" -maxdepth 1 -iname "${candidate}*.md" 2>/dev/null | head -1)
  [ -z "$match" ] && return
  basename "$match" .md
}

mkdir -p "$marker_dir" 2>/dev/null

# --- Cas 1 : lecture d'un architecture/*.md -> on pose le marqueur pour CETTE feature ---
if [ "$tool" = "Read" ]; then
  path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
  case "$path" in
    */architecture/*.md)
      base=$(basename "$path" .md)
      : > "$marker_dir/$base"
      ;;
  esac
  exit 0
fi

# --- Cas 2 : agent d'exploration -> INTERDIT sans condition (R3) ---
#
# R3 interdit de lancer un agent pour "decouvrir" le projet : architecture/ est
# ecrit precisement pour ca. Aucun marqueur ne leve ce blocage — contrairement
# aux recherches, il n'y a pas de lecture prealable qui rendrait l'agent
# legitime. Les agents non exploratoires (ex. statusline-setup) passent.
if [ "$tool" = "Agent" ] || [ "$tool" = "Task" ]; then
  subagent=$(printf '%s' "$payload" | jq -r '.tool_input.subagent_type // empty')
  case "$subagent" in
    Explore|general-purpose|Plan)
      cat >&2 <<EOF
BLOQUE (R3) — agent "${subagent}" lance pour explorer le projet.

R3 : « INTERDIT : lancer un agent Explore pour "decouvrir" le projet. »
architecture/README.md et les .md par feature sont ecrits pour eviter cette
perte de temps. Lis-les avec Read direct (1 seul appel), c'est suffisant.

Un agent ne se justifie QUE pour une recherche ultra-precise introuvable dans
architecture/ (ex. une signature de fonction exacte) — et dans ce cas, fais la
recherche toi-meme avec Grep plutot que de deleguer.
EOF
      exit 2
      ;;
  esac
  exit 0
fi

# --- Cas 3 : recherche -> determiner la feature visee et verifier son marqueur ---
target=""
case "$tool" in
  Grep|Glob)
    target=$(printf '%s' "$payload" | jq -r '(.tool_input.pattern // "") + " " + (.tool_input.path // "")')
    ;;
  Bash)
    cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')
    case "$cmd" in
      *grep*|*"rg "*|*"find "*) target="$cmd" ;;
      *) exit 0 ;;
    esac
    ;;
  *)
    exit 0
    ;;
esac

feature=$(feature_of "$target")

# Chemin non reconnu (recherche generique, config...) -> pas de blocage.
if [ -z "$feature" ]; then
  # Sous-cas : le chemin DESIGNE bien une feature, mais elle n'a aucun
  # architecture/*.md. Le hook ne peut rien exiger — on le SIGNALE au lieu de
  # laisser passer en silence, sinon une feature non documentee reste un angle
  # mort permanent (cas rencontre avec "restaurants", qui est pourtant le home).
  raw=""
  if [[ "$target" =~ src/(services|controllers|routes)/([a-zA-Z0-9_-]+) ]]; then
    raw="${BASH_REMATCH[2]}"
  fi
  if [ -n "$raw" ]; then
    cat >&2 <<EOF
NOTE (R3) — la feature "${raw}" n'a pas de architecture/${raw}*.md.

La recherche est autorisee (rien a exiger), mais R9 demande que chaque feature
soit documentee. Pense a creer architecture/${raw}.md et a l'ajouter a l'index
de architecture/README.md.
EOF
  fi
  exit 0
fi

# Marqueur deja pose pour CETTE feature -> ok.
[ -f "$marker_dir/$feature" ] && exit 0

cat >&2 <<EOF
BLOQUE (R3) — recherche sur la feature "${feature}" avant d'avoir lu son architecture.

Recherche refusee : ${target}

Lis d'abord architecture/${feature}.md avec l'outil Read (architecture/README.md
donne l'index general). Chaque feature grep-ee doit avoir son doc lu au moins
une fois dans la session, pas seulement un README generique.

Une fois architecture/${feature}.md lu, les recherches sur CETTE feature sont
autorisees pour le reste de la session.
EOF
exit 2
