import json, sys, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
D = sys.argv[1]
fin = "Voilà, l'icône est sur ton écran d'accueil. Ouvre-la, et connecte-toi avec ton adresse i-mèl. Ensuite, l'application marche même sans réseau."
LIGNES = {
 'q0': "Voici Arvéla, le carnet de bord des assistantes maternelles. Suivons une journée ensemble.",
 'q1': "Le matin, Inèsse arrive. Un geste sur Arrivée, et l'heure est notée. Une erreur ? Touche, Annuler.",
 'q2': "Dans le carnet, touche Repas, puis, A tout mangé. C'est noté, avec l'heure.",
 'q3': "Le soir, un seul appui, et les parents reçoivent le résumé de la journée.",
 'q4': "À la fin du mois, Arvéla prépare ce qu'il faut déclarer sur Pajemploi, ligne par ligne. Vérifie toujours avant de déclarer.",
 'q5': "Et tes congés sont comptés pour toi.",
 'q6': "Arvéla. Gratuit pendant la phase de test.",
 'i0': "Installons Arvéla sur ton iPhone. Ouvre le site arvéla point èf èr, dans Safari.",
 'i1': "Touche le bouton Partager, en bas de l'écran.",
 'i2': "Fais défiler, puis choisis, Sur l'écran d'accueil.",
 'i3': "Touche Ajouter, en haut à droite.",
 'i4': fin,
 'a0': "Installons Arvéla sur ton téléphone Android. Ouvre le site arvéla point èf èr, dans Chrome.",
 'a1': "Touche les trois petits points, en haut à droite.",
 'a2': "Choisis, Installer l'application.",
 'a3': "Confirme avec Installer.",
 'a4': fin,
}
k = Kokoro(f"{D}/kokoro-v1.0.onnx", f"{D}/voices-v1.0.bin")
dur = {}
for key, txt in LIGNES.items():
    s, sr = k.create(txt, voice="ff_siwis", speed=0.94, lang="fr-fr")
    # coupe les silences de début et de fin
    idx = np.where(np.abs(s) > 0.004)[0]; s = s[max(0, idx[0] - 1200): idx[-1] + 6000]
    sf.write(f"{D}/out/{key}.wav", s, sr); dur[key] = round(len(s) / sr, 3)
json.dump(dur, open(f"{D}/out/durees.json", "w"), indent=1); print(dur)
