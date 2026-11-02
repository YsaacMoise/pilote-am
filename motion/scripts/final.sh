#!/usr/bin/env bash
# Finition d'une vidéo rendue par Remotion, avant de la publier dans public/videos/ :
# volume ramené à -16 LUFS (niveau des vidéos web), crêtes limitées, H.264 allégé, lecture qui démarre tout de suite.
# Usage : scripts/final.sh out/raw-Mois.mp4 ../public/videos/arvela-mois.mp4
set -euo pipefail
in="$1"
out="$2"
ffmpeg -y -v error -i "$in" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.89" \
  -c:v libx264 -preset veryfast -crf 24 -profile:v high -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -ar 48000 \
  "$out"
echo "ok : $out"
