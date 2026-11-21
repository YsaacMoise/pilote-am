"""Contrôle automatique de la paie par le second moteur (décision du DG du 21/11/2026).

Lance le comparateur A/B (verification/comparateur-ab/comparer.py) sur le code du dépôt :
- A = moteur de paie de l'app (src/engine), construit avec esbuild depuis la racine du dépôt ;
- B = second moteur, écrit à part à partir des seuls textes (verification/moteur-b).

Échec (code de sortie 1) si une seule sortie est en désaccord (famille F2), si un cas officiel
est en désaccord, ou si un adaptateur plante (famille ERREUR). Les familles F3 (B refuse de
conclure), F4 (A refuse) et N (les deux refusent) sont comptées et affichées, sans échec.

Lancement, depuis la racine du dépôt, après npm ci : python3 verification/verifier_paie.py
"""
import collections
import json
import os
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
COMPARATEUR = os.path.join(ICI, "comparateur-ab")


def main() -> int:
    env = dict(os.environ)
    env["ARVELA_A_RACINE"] = RACINE
    env["ARVELA_B_RACINE"] = os.path.join(ICI, "moteur-b")
    subprocess.run([sys.executable, os.path.join(COMPARATEUR, "comparer.py")], check=True, env=env, cwd=COMPARATEUR)

    lignes = json.load(open(os.path.join(COMPARATEUR, "resultats", "resultats.json"), encoding="utf-8"))
    officiels = {s["id"] for s in json.load(open(os.path.join(COMPARATEUR, "situations", "officiels.json"), encoding="utf-8"))}
    tout = collections.Counter(l["famille"] for l in lignes)
    off = collections.Counter(l["famille"] for l in lignes if l["situation"] in officiels)

    texte = ["## Second moteur de paie", "",
             f"Toutes les sorties ({len(lignes)}) : " + ", ".join(f"{k} {v}" for k, v in sorted(tout.items())),
             "Cas officiels : " + ", ".join(f"{k} {v}" for k, v in sorted(off.items())), ""]
    desaccords = [l for l in lignes if l["famille"] in ("F2", "ERREUR")]
    for l in desaccords[:50]:
        texte.append(f"- {l['famille']} {l['situation']} {l['cle']} : A {l['a']} ; B {l['b']}")
    ok = not desaccords
    texte.append("")
    texte.append("Résultat : aucun désaccord." if ok else f"Résultat : {len(desaccords)} désaccord(s). La mise à jour est bloquée.")
    sortie = "\n".join(texte)
    print(sortie)
    resume = os.environ.get("GITHUB_STEP_SUMMARY")
    if resume:
        with open(resume, "a", encoding="utf-8") as f:
            f.write(sortie + "\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
