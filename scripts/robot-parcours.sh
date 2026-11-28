#!/usr/bin/env bash
# T-112 : robot des parcours d'Arvela. Même commande sur GitHub et en local.
#   bash scripts/robot-parcours.sh faux         niveau A : parcours existants, faux service en mémoire (scripts/fake-cloud.mjs)
#   bash scripts/robot-parcours.sh emulateurs   niveau B : vrai code Firebase sur les émulateurs Auth et Firestore (projet demo-arvela)
# Construit le site de test dans .robot/ (jamais dans dist/), lance chaque parcours avec la garde (scripts/e2e-garde.cjs :
# aucune requête vers l'extérieur), note la durée et le résultat de chacun, et sort en échec si un seul parcours échoue.
# Ports : variables ROBOT_PORT_* (par défaut ceux de GitHub ; la session de travail locale utilise 4900 à 4909).
# Captures : scripts/out/ (pièce jointe du passage sur GitHub).
set -uo pipefail
cd "$(dirname "$0")/.."
NIVEAU="${1:-faux}"
P_SITE="${ROBOT_PORT_SITE:-4900}"      # site, avec la règle de sécurité (CSP) de firebase.json
P_SITE2="${ROBOT_PORT_SITE2:-4902}"    # site sans CSP, pour les parcours qui injectent axe-core
P_FAUX="${ROBOT_PORT_FAUX:-4901}"      # faux service (niveau A)
P_AUTH="${ROBOT_PORT_AUTH:-4905}"      # émulateur Auth (niveau B, voir firebase.robot.json)
P_FS="${ROBOT_PORT_FS:-4906}"          # émulateur Firestore (niveau B, voir firebase.robot.json)
mkdir -p .robot scripts/out
RESUME=".robot/resume-$NIVEAU.md"
: > "$RESUME"
export AXE="$PWD/node_modules/axe-core/axe.min.js"
PIDS=()
finir() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
trap finir EXIT

echec=0
lancer() { # lancer <nom> <commande…> : un parcours, sa durée, son résultat
  local nom="$1"; shift
  local t0=$(date +%s)
  echo "::group::$nom"
  timeout 600 "$@" 2>&1 | tee ".robot/$nom.log"
  local code=${PIPESTATUS[0]}
  echo "::endgroup::"
  local d=$(( $(date +%s) - t0 ))
  if [ "$code" -eq 0 ]; then echo "| $nom | vert | ${d} s |" >> "$RESUME"; echo "OK $nom (${d} s)"
  else
    echec=1
    echo "| $nom | ROUGE (code $code) | ${d} s |" >> "$RESUME"
    echo "::error title=Parcours $nom::$(grep -E 'ÉCHEC|Error|Délai|Timeout' ".robot/$nom.log" | head -3 | tr '\n' ' ' | cut -c1-400)"
  fi
}
parcours() { lancer "$1" node --require ./scripts/e2e-garde.cjs "scripts/$1.cjs"; }

if [ "$NIVEAU" = "faux" ]; then
  VITE_FAKE_CLOUD="http://localhost:$P_FAUX" npx vite build --outDir .robot/dist-faux --emptyOutDir > .robot/build.log 2>&1 || { cat .robot/build.log; exit 1; }
  node scripts/fake-cloud.mjs "$P_FAUX" > .robot/faux-service.log 2>&1 & PIDS+=($!)
  DIST=.robot/dist-faux CSP=1 CSP_CONNECT="http://localhost:$P_FAUX" node scripts/serve.mjs "$P_SITE" > .robot/site.log 2>&1 & PIDS+=($!)
  DIST=.robot/dist-faux node scripts/serve.mjs "$P_SITE2" > .robot/site2.log 2>&1 & PIDS+=($!)
  sleep 1
  export CLOUD="http://localhost:$P_FAUX"
  export BASE="http://localhost:$P_SITE/pilote-am/"
  for f in e2e e2e-sync e2e-carnet e2e-sante e2e-cle-acces; do parcours "$f"; done
  export BASE="http://localhost:$P_SITE2/pilote-am/"
  # Ces trois parcours injectent axe-core (accessibilité) : site servi sans CSP.
  for f in e2e-parent e2e-releve axe; do parcours "$f"; done
elif [ "$NIVEAU" = "emulateurs" ]; then
  # Construction d'essai seulement : VITE_EMU_* branche backend-firebase.ts sur les émulateurs (projet demo-arvela, App Check coupé).
  VITE_EMU_AUTH="http://127.0.0.1:$P_AUTH" VITE_EMU_FIRESTORE="127.0.0.1:$P_FS" npx vite build --outDir .robot/dist-emu --emptyOutDir > .robot/build.log 2>&1 || { cat .robot/build.log; exit 1; }
  DIST=.robot/dist-emu CSP=1 CSP_CONNECT="http://127.0.0.1:$P_AUTH http://127.0.0.1:$P_FS" node scripts/serve.mjs "$P_SITE" > .robot/site.log 2>&1 & PIDS+=($!)
  sleep 1
  export BASE="http://localhost:$P_SITE/pilote-am/" EMU_AUTH="http://127.0.0.1:$P_AUTH" EMU_FS="http://127.0.0.1:$P_FS"
  # firebase-tools exige Java 21 ; les runners GitHub l'ont préinstallé à côté de Java 17.
  if [ -n "${JAVA_HOME_21_X64:-}" ]; then export JAVA_HOME="$JAVA_HOME_21_X64"; export PATH="$JAVA_HOME/bin:$PATH"; fi
  lancer e2e-firebase npx firebase emulators:exec --config firebase.robot.json --only auth,firestore --project demo-arvela \
    "node --require ./scripts/e2e-garde.cjs scripts/e2e-firebase.cjs"
else
  echo "Niveau inconnu : $NIVEAU (faux ou emulateurs)"; exit 2
fi

{ echo "## Robot des parcours, niveau $NIVEAU"; echo; echo "| Parcours | Résultat | Durée |"; echo "|---|---|---|"; cat "$RESUME"; } > "$RESUME.tmp" && mv "$RESUME.tmp" "$RESUME"
cat "$RESUME"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$RESUME" >> "$GITHUB_STEP_SUMMARY"
exit $echec
