# Vidéos de prise en main (motion design)

Trois vidéos 1080 × 1920, 30 images/s, H.264 + AAC, dans `public/videos/` :
`arvela-quotidien` (54 s), `arvela-installer-iphone` et `arvela-installer-android` (33 s), chacune avec ses sous-titres `.vtt`.

Fabrication, entièrement sur la machine (aucun service en ligne) :
1. `capture.cjs` : captures des vrais écrans de l'app en démonstration (Playwright), dans `assets/`, avec les polices de la charte copiées depuis `node_modules/@fontsource*`.
2. `voix.py` : voix française `ff_siwis` du modèle Kokoro (kokoro-onnx, licence Apache 2.0), une phrase par scène ; écrit `durees.json`.
3. `engine.html` + `render.cjs <film> video <sortie.mp4>` : chaque image est dessinée sur un canevas en fonction du temps, puis encodée par ffmpeg. La durée de chaque scène suit celle de sa phrase.
4. `audio.py` : place les phrases sur la chronologie, normalise le volume (−16 LUFS), écrit les sous-titres et assemble le fichier final.

Les vidéos ne sont pas mises en cache hors ligne (voir `scripts/sw-plugin.ts`).
