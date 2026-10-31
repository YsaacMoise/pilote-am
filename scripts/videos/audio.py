# Piste de voix calée sur la chronologie de chaque film, sous-titres WebVTT, et assemblage final.
import json, re, subprocess, sys, numpy as np, soundfile as sf
V = sys.argv[1]; TTS = sys.argv[2]
SUB = {
 'q0': "Voici Arvela, le carnet de bord des assistantes maternelles. Suivons une journée ensemble.",
 'q1': "Le matin, Inès arrive. Un geste sur « Arrivée », et l’heure est notée. Une erreur ? Touche « Annuler ».",
 'q2': "Dans le carnet, touche « Repas », puis « A tout mangé ». C’est noté, avec l’heure.",
 'q3': "Le soir, un seul appui, et les parents reçoivent le résumé de la journée.",
 'q4': "À la fin du mois, Arvela prépare ce qu’il faut déclarer sur Pajemploi, ligne par ligne. Vérifie toujours avant de déclarer.",
 'q5': "Et tes congés sont comptés pour toi.",
 'q6': "Arvela. Gratuit pendant la phase de test.",
 'i0': "Installons Arvela sur ton iPhone. Ouvre le site arvela.fr dans Safari.",
 'i1': "Touche le bouton Partager, en bas de l’écran.",
 'i2': "Fais défiler, puis choisis « Sur l’écran d’accueil ».",
 'i3': "Touche « Ajouter », en haut à droite.",
 'i4': "Voilà, l’icône est sur ton écran d’accueil. Ouvre-la, et connecte-toi avec ton adresse e-mail. Ensuite, l’application marche même sans réseau.",
 'a0': "Installons Arvela sur ton téléphone Android. Ouvre le site arvela.fr dans Chrome.",
 'a1': "Touche les trois petits points, en haut à droite.",
 'a2': "Choisis « Installer l’application ».",
 'a3': "Confirme avec « Installer ».",
}
SUB['a4'] = SUB['i4']
FILMS = {'quotidien': ('q', 'arvela-quotidien'), 'iphone': ('i', 'arvela-installer-iphone'), 'android': ('a', 'arvela-installer-android')}
SR = 24000
def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"
for film, (P, name) in FILMS.items():
    tl = json.load(open(f"{V}/timeline-{film}.json"))
    total = tl['total']; track = np.zeros(int((total + 0.5) * SR), dtype=np.float32)
    cues = []
    for i, sc in enumerate(tl['scenes']):
        key = f"{P}{i}"
        if key not in SUB: continue
        s, sr = sf.read(f"{TTS}/out/{key}.wav", dtype='float32'); assert sr == SR
        off = sc['start'] + (0.6 if i == 0 else 0.35)
        a = int(off * SR); track[a:a + len(s)] += s[: len(track) - a]
        assert off + len(s) / SR <= sc['start'] + sc['d'] + 0.05, (film, key, 'la voix déborde de la scène')
        # sous-titres : une phrase (ou deux courtes) par carton, durée au prorata des lettres
        parts = [p.strip() for p in re.split(r'(?<=[.?!»])\s+(?=[A-ZÀ-ÖÉ])', SUB[key]) if p.strip()]
        groups, cur = [], ''
        for p in parts:
            if cur and len(cur) + len(p) > 80: groups.append(cur); cur = p
            else: cur = (cur + ' ' + p).strip()
        groups.append(cur)
        L = sum(len(x) for x in groups); t0 = off; d = len(s) / SR
        for gtxt in groups:
            t1 = t0 + d * len(gtxt) / L; cues.append((t0, t1 + 0.15, gtxt)); t0 = t1
    sf.write(f"{V}/out/{P}-voix.wav", track, SR)
    with open(f"{V}/out/{name}.vtt", 'w') as f:
        f.write("WEBVTT\n\n")
        for n, (a, b, txt) in enumerate(cues, 1): f.write(f"{n}\n{ts(a)} --> {ts(b)} line:80%\n{txt}\n\n")
    # assemblage : image copiée telle quelle, voix normalisée en AAC
    tmp = f"{V}/out/{name}.tmp.mp4"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f"{V}/out/{P}-video.mp4", '-i', f"{V}/out/{P}-voix.wav",
                    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000', '-c:a', 'aac', '-b:a', '96k', '-ac', '1',
                    '-shortest', '-movflags', '+faststart', tmp], check=True)
    subprocess.run(['mv', tmp, f"{V}/out/{name}.mp4"], check=True)
    print(film, 'ok', round(total, 2), 's,', len(cues), 'sous-titres')
