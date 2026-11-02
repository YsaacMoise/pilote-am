"""Instant de chaque mot dans une voix off (reconnaissance vocale locale, modèle Whisper « small »).
Usage : python3 scripts/mots.py public/voix/essais-nika.wav  → affiche « mot début fin » par ligne et écrit un .mots.json à côté.
"""
import json
import subprocess
import sys

import numpy as np

from faster_whisper import WhisperModel

chemin = sys.argv[1]
modele = WhisperModel("small", device="cpu", compute_type="int8")
brut = subprocess.run(["ffmpeg", "-v", "error", "-i", chemin, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(brut, dtype=np.float32)
segments, _ = modele.transcribe(audio, language="fr", word_timestamps=True, beam_size=5)
mots = []
for seg in segments:
    for m in seg.words:
        mots.append({"mot": m.word.strip(), "debut": round(m.start, 3), "fin": round(m.end, 3)})
        print(f"{m.word.strip():<18} {m.start:6.2f} {m.end:6.2f}")
with open(chemin.rsplit(".", 1)[0] + ".mots.json", "w") as f:
    json.dump(mots, f, ensure_ascii=False, indent=1)
