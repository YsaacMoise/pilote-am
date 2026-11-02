"""Identifie un fichier de voix par ce qu'il dit, jamais par son nom (AI Studio nomme les fichiers à la minute près).
Compare la transcription avec le texte de chaque fiche de motion/voix/ et, si l'option --ranger est donnée,
copie le fichier à l'emplacement de la fiche reconnue. Usage : python3 scripts/identifier-voix.py [--ranger] fichier.wav ...
"""
import difflib
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

import numpy as np
from faster_whisper import WhisperModel

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def mots(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", t)


fiches = [json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob(os.path.join(ICI, "voix/*.json")))]
ranger = "--ranger" in sys.argv
modele = WhisperModel("small", device="cpu", compute_type="int8")
for chemin in [a for a in sys.argv[1:] if not a.startswith("--")]:
    brut = subprocess.run(["ffmpeg", "-v", "error", "-i", chemin, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    if not brut:
        print(f"{os.path.basename(chemin)} : illisible ou vide")
        continue
    segs, _ = modele.transcribe(np.frombuffer(brut, dtype=np.float32), language="fr")
    entendu = " ".join(s.text for s in segs).strip()
    notes = sorted(((difflib.SequenceMatcher(a=mots(f["texte"]), b=mots(entendu)).ratio(), f) for f in fiches), key=lambda x: -x[0])
    score, f = notes[0]
    duree = len(brut) / 64000
    verdict = f["id"] if score >= 0.65 else "aucune fiche"
    print(f"{os.path.basename(chemin)} ({duree:.1f} s) → {verdict} (ressemblance {score:.0%})\n  entendu : {entendu}")
    if ranger and score >= 0.65 and os.path.abspath(chemin) != os.path.join(ICI, f["fichier"]):
        shutil.copyfile(chemin, os.path.join(ICI, f["fichier"]))
        print(f"  rangé dans {f['fichier']}")
