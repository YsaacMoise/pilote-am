#!/bin/bash
# Version finale pour le site : limiteur (aucun écrêtage), volume normalisé à −16 LUFS, vidéo H.264 allégée, lecture rapide.
in=$1; out=$2
ffmpeg -y -loglevel error -i "$in" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart \
  -af "alimiter=limit=0.8:level=false,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -c:a aac -b:a 128k "$out.tmp.mp4" && mv "$out.tmp.mp4" "$out"
ffprobe -v error -show_entries format=duration,size -of csv=p=0 "$out"
ffmpeg -nostats -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tr -s ' ' | tr '\n' ' '; echo
