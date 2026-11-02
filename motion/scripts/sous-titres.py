"""Sous-titres (.vtt) d'une vidéo finie, calés sur ce qu'on entend vraiment dans la vidéo.

La reconnaissance vocale écoute la vidéo ; le texte exact des fiches voix (dans l'ordre) est aligné sur les mots entendus ;
chaque phrase devient un sous-titre, de son premier à son dernier mot. Les fautes de la reconnaissance n'apparaissent jamais :
c'est le texte des fiches qui est affiché.
Usage : python3 scripts/sous-titres.py video.mp4 sortie.vtt fiche1 [fiche2 …]
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


def hms(t):
    h, r = divmod(max(0.0, t), 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


video, sortie, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
phrases = []
for i in ids:
    texte = json.load(open(os.path.join(ICI, "voix", i + ".json"), encoding="utf-8"))["texte"]
    phrases += [p.strip() for p in re.split(r"(?<=[.?!])\s+", texte) if p.strip()]

brut = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vn", "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
modele = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = modele.transcribe(np.frombuffer(brut, dtype=np.float32), language="fr", word_timestamps=True, beam_size=5)
mots = [w for s in segs for w in s.words if norme(w.word)]
entendus = [norme(w.word) for w in mots]

# Mots écrits, phrase par phrase
attendus, appartient = [], []
for k, p in enumerate(phrases):
    for x in re.findall(r"[\w'’]+", p):
        if norme(x):
            attendus.append(norme(x))
            appartient.append(k)
vers = [None] * len(attendus)
for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=attendus, b=entendus, autojunk=False).get_opcodes():
    for k in range(i1, i2):
        if op == "equal":
            vers[k] = j1 + (k - i1)
        elif op == "replace":
            vers[k] = min(j2 - 1, j1 + (k - i1) * (j2 - j1) // max(1, i2 - i1))

lignes = ["WEBVTT", ""]
n = 0
for k, p in enumerate(phrases):
    idx = [vers[i] for i, a in enumerate(appartient) if a == k and vers[i] is not None]
    if not idx:
        continue
    debut, fin = mots[min(idx)].start, mots[max(idx)].end
    n += 1
    lignes += [str(n), f"{hms(debut)} --> {hms(fin + 0.25)}", p.replace("’", "’"), ""]
open(sortie, "w", encoding="utf-8").write("\n".join(lignes))
print(f"{os.path.basename(sortie)} : {n} sous-titres sur {len(phrases)} phrases")
