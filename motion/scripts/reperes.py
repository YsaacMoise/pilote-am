"""Repères d'une voix off, mesurés automatiquement à partir de sa fiche (motion/voix/<id>.json).

1. Reconnaissance vocale locale (Whisper « small ») : l'instant de chaque mot entendu.
2. Chaque repère de la fiche (« geste » : "geste", ou { "mot": "direct", "bord": "fin", "n": 2 }) reçoit l'instant du mot.
3. La première attaque de la voix est prise au silence près (Whisper la place souvent trop tôt).
4. Les mots du texte de la fiche qui ne sont pas entendus tels quels sont signalés : à écouter (prononciation).

Écrit public/voix/<id>.reperes.json, lu par les vidéos. Usage : python3 scripts/reperes.py voix/accueil-journee.json
"""
import difflib
import json
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np
from faster_whisper import WhisperModel

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def norme(m):
    m = unicodedata.normalize("NFD", m.lower())
    m = "".join(c for c in m if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", m.split("'")[-1].split("’")[-1])


def attaque(chemin):
    """Instant où la voix commence (fin du premier silence)."""
    sortie = subprocess.run(["ffmpeg", "-v", "info", "-i", chemin, "-af", "silencedetect=n=-40dB:d=0.15", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"silence_start: 0(?:\.0+)?\s.*?silence_end: ([\d.]+)", sortie, re.S)
    return float(m.group(1)) if m else 0.0


def main(chemin_fiche):
    fiche = json.load(open(chemin_fiche, encoding="utf-8"))
    son = os.path.join(ICI, fiche["fichier"])
    brut = subprocess.run(["ffmpeg", "-v", "error", "-i", son, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    modele = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = modele.transcribe(np.frombuffer(brut, dtype=np.float32), language="fr", word_timestamps=True, beam_size=5)
    mots = [{"mot": w.word.strip(), "n": norme(w.word), "debut": round(w.start, 3), "fin": round(w.end, 3)} for s in segments for w in s.words]
    mots = [m for m in mots if m["n"]]
    debut_voix = attaque(son)
    if mots and mots[0]["debut"] < debut_voix:
        mots[0]["debut"] = round(debut_voix, 3)

    reperes, erreurs = {}, []
    for cle, cible in fiche["reperes"].items():
        if isinstance(cible, str):
            cible = {"mot": cible}
        trouves = [m for m in mots if m["n"] == norme(cible["mot"])]
        rang = cible.get("n", 1)
        if len(trouves) < rang:
            erreurs.append(f"repère « {cle} » : le mot « {cible['mot']} » n'est pas entendu (occurrence {rang})")
            continue
        m = trouves[rang - 1]
        reperes[cle] = m["fin"] if cible.get("bord") == "fin" else m["debut"]

    # Mots du texte qui ne sont pas entendus tels quels : à écouter
    attendus = [norme(x) for x in re.findall(r"[\w'’-]+", fiche["texte"])]
    attendus = [x for x in attendus if x]
    entendus = [m["n"] for m in mots]
    a_ecouter = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=attendus, b=entendus, autojunk=False).get_opcodes():
        if op in ("replace", "delete"):
            t = mots[j1]["debut"] if j1 < len(mots) else None
            a_ecouter.append({"attendu": " ".join(attendus[i1:i2]), "entendu": " ".join(m["mot"] for m in mots[j1:j2]), "vers": t})

    sortie = {
        "source": f"Mesuré par scripts/reperes.py depuis {os.path.relpath(chemin_fiche, ICI)} — ne pas modifier à la main",
        "fichier": fiche["fichier"].removeprefix("public/"),
        "duree": round(len(brut) / 4 / 16000, 3),
        "mots": reperes,
        "a_ecouter": a_ecouter,
    }
    cible = os.path.join(ICI, "public/voix", fiche["id"] + ".reperes.json")
    json.dump(sortie, open(cible, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{fiche['id']} : {len(reperes)} repères" + (f", {len(a_ecouter)} passage(s) à écouter" if a_ecouter else ""))
    for x in a_ecouter:
        print(f"  à écouter vers {x['vers']} s : attendu « {x['attendu']} », entendu « {x['entendu']} »")
    if erreurs:
        print("\n".join("  ERREUR " + e for e in erreurs))
        sys.exit(1)


if __name__ == "__main__":
    for f in sys.argv[1:]:
        main(f)
