# Vidéos Arvela (motion design)

Projet Remotion qui fabrique les trois vidéos de `public/videos/` :
`Quotidien` (1 min, prise en main), `InstallerIphone` et `InstallerAndroid` (21 s).

- Voix : Google AI Studio (Gemini TTS, voix « Nika », style voix off chaleureuse), fichiers dans `public/voix/`.
- Musique : générée avec Lyria dans l'app Gemini (« Measured Grace », « Patterns in the Grain »), dans `public/musique/`.
- Sons d'interface : fabriqués par `scripts/sfx.py`.
- Écrans : vraies captures de l'app en démonstration, dans `public/ecrans/` (+ `taps.json`, positions des boutons).

Rendu : `npm i`, puis `npx remotion render Quotidien out/arvela-quotidien.mp4 --browser-executable=<chrome>`,
puis `scripts/final.sh out/arvela-quotidien.mp4 final/arvela-quotidien.mp4` (limiteur, −16 LUFS, H.264 allégé).
Remotion est gratuit pour un particulier ou une équipe de 3 personnes au plus.
