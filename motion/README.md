# Vidéos Arvela (motion design)

Projet Remotion qui fabrique les vidéos de `public/videos/`.

## Refaire les vidéos après un changement de l'app

Une seule commande, depuis `motion/` :

```
node scripts/videos.mjs              # toutes les vidéos de videos.json
node scripts/videos.mjs essai-B      # une seule vidéo
node scripts/videos.mjs --sans-rendu # captures et voix seulement : vérifie en 1 minute qu'aucune étape ne casse
```

Elle enchaîne, sans rien écrire à la main :

1. **Charte** (`scripts/charte.mjs`) : couleurs, polices et logo lus dans l'app (`src/styles.css`, `src/ui/Logo.tsx`),
   écrits dans `src/charte.json`. Le fond, les halos, l'heure, le logo de fin suivent la charte de l'app.
2. **App** construite avec le faux service en ligne, servie en local.
3. **Captures** : chaque scénario (`scripts/captures-*.cjs`) refait les gestes dans la vraie app, photographie chaque état
   et mesure la position de chaque bouton, feuille et ligne. Les éléments sont trouvés par leur nom, jamais par position.
   Si un bouton a changé de nom, l'arrêt est lisible : « étape 7 « Carnet → Repas » : bouton « Repas » introuvable »,
   avec la capture de l'écran à ce moment-là (`ARRET-*.png`). Il suffit alors de corriger cette étape.
4. **Voix** (`scripts/reperes.py`) : pour chaque fiche de `voix/`, l'instant de chaque repère est mesuré dans le fichier son
   (reconnaissance vocale locale). Les mots du texte qui ne sont pas entendus tels quels sont signalés « à écouter ».
5. **Rendu**, finition du son (`scripts/final.sh` : −16 LUFS, limiteur, H.264 allégé) et planche de contrôle `out/controle-<id>.png`.

`videos.json` liste chaque vidéo avec ses scénarios de capture et ses fiches voix.

## Les voix

Une fiche par voix dans `voix/<id>.json` : outil, modèle, voix, consigne de jeu, texte exact, fichier, repères.
Pour refaire une voix à l'identique : Google AI Studio, page « Generate speech », modèle et voix de la fiche,
coller la consigne dans « Style », le texte dans le bloc, générer, télécharger, remplacer le fichier.
Si seul le visuel de l'app change, les voix ne changent pas.

## Le reste

- Musique : générée avec Lyria dans l'app Gemini (« Measured Grace », « Patterns in the Grain »), dans `public/musique/`.
- Sons d'interface : fabriqués par `scripts/sfx.py`.
- Les anciennes vidéos (`Quotidien`, `Mois`, `Inviter`, `Simulateur`) ont encore des positions écrites à la main :
  elles seront remplacées par des vidéos construites comme les essais.

Remotion est gratuit pour un particulier ou une équipe de 3 personnes au plus.
