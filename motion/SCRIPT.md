# Arvela — vidéos en motion design (v2)

Principe : le motion design met tout le monde au même niveau. Ton d'égal à égal, jamais condescendant.
La vidéo « Au quotidien » montre réellement où toucher dans l'app (vrais écrans, doigt, repères), sans ton de professeur.
Charte : albâtre, encre, argile, sauge ; Cormorant Garamond, Plus Jakarta Sans, JetBrains Mono. Perle d'argile comme fil conducteur.
Musique instrumentale douce (Lyria, app Gemini) sous la voix, petits sons sur les gestes. Format 1080 × 1920, 30 images/s.

## Vidéo 1 — « Une journée avec Arvela » (≈ 75 s)

1. **Ouverture** (validée) — « Une journée d'assistante maternelle, c'est des arrivées, des départs, des repas, des siestes… et, à la fin du mois, tout à recompter. Avec Arvela, tout se note au fil de la journée. Et le mois se prépare tout seul. »
2. **Aujourd'hui** — « Tout commence sur l'écran Aujourd'hui. Chaque enfant a sa carte, avec ses horaires prévus. Il arrive : touche Arrivée. Il repart : Départ. Une erreur ? Annuler, en bas de l'écran. Une absence ou un imprévu ? Modifier. »
   Image : téléphone stylisé avec le vrai écran ; zoom sur la carte d'Inès ; doigt sur Arrivée, l'étiquette verte apparaît ; repère sur Annuler ; doigt sur Modifier, la fiche s'ouvre.
3. **Carnet** — « Dans l'onglet Carnet, choisis l'enfant, puis Repas, Sieste ou Change. L'heure s'ajoute toute seule. Le soir, envoie le résumé aux parents. »
   Image : onglet Carnet qui s'allume ; doigt sur Inès, sur Repas, choix « A tout mangé » ; la ligne 11h50 s'écrit ; doigt sur « Envoyer le résumé ».
4. **Mois** — « L'onglet Mois affiche ce que la famille doit verser, puis les montants à reporter sur Pajemploi, ligne par ligne. Vérifie-les, et envoie-les au parent en un geste. »
   Image : bloc encre 849,56 € ; défilement des lignes Pajemploi avec repères ; doigt sur « Envoyer au parent ». Mention : « Montants à vérifier avant déclaration. Pajemploi fait foi. »
5. **Plus** — « Dans Plus, tu retrouves tes congés, le contrôle de tes bulletins et tes réglages. »
   Image : onglet Plus, la liste, zoom sur Congés et ses compteurs 18 · 5 · 13.
6. **Signature** — « Arvela. Le carnet de bord des assistantes maternelles. » arvela.fr · Gratuit pendant la phase de test.

## Vidéos 2 et 3 — « Installer Arvela » (≈ 20 s, iPhone et Android)

Voix déjà enregistrées : « Arvela s'installe comme une application. Sans passer par l'App Store (le Play Store). / Dans Safari, ouvre arvela.fr, puis touche Partager. (Dans Chrome, ouvre arvela.fr, puis le menu, en haut à droite.) / Choisis : Sur l'écran d'accueil. (Installer l'application.) / Puis : Ajouter. (Installer.) / C'est fait. Arvela t'attend sur ton écran d'accueil, et fonctionne même sans réseau. »

## Vidéos 4 à 6 — tutoriels courts (≈ 35 s chacun), voix Nika

Voix générées dans Google AI Studio (Gemini 3.8 Flash TTS, voix Nika), style : « Voix française naturelle, chaleureuse et posée, d'égale à égale, comme une collègue qui montre l'app à une autre. Débit lent et détendu, une vraie respiration entre chaque phrase, sourire dans la voix, jamais commercial ni robotique. »
Fichiers : `public/voix/mois.wav`, `inviter.wav`, `simulateur.wav`. Scène commune pilotée par des données : `src/scenes/Tuto.tsx` ; réglages de chaque vidéo : `src/Tutos.tsx`.
Écrans : vraies captures 390 × 844 (double résolution) dans `public/ecrans/` (préfixes `m-`, `i-`, `s-`), positions des éléments dans `public/ecrans/tuto.json`. Les écrans des parents viennent du faux service en ligne (`scripts/fake-cloud.mjs`), aucun compte réel.

4. **Ta fin de mois, prête à déclarer** (Mois) — « Fin du mois. Ouvre l'onglet Mois. En haut, ce que la famille te doit : salaire, entretien et repas compris. Juste en dessous, les montants à déclarer sur Pajemploi, dans l'ordre des cases. Une déclaration par enfant. C'est le parent qui déclare. Touche Envoyer au parent : il reçoit tout, prêt à recopier. Un jour à corriger ? Il est là, dans Ce qui a changé ce mois-ci. Et quand le bulletin Pajemploi arrive, Contrôler le bulletin vérifie qu'il correspond à tes chiffres. »
5. **Inviter les parents** (Inviter) — « Les parents peuvent suivre la journée de leur enfant. Sans compte, sans mot de passe. Dans Plus, ouvre la fiche de l'enfant, puis touche Créer le lien. Un code à quatre chiffres s'affiche. Donne-le de vive voix : il n'est jamais dans le lien. Puis envoie le lien par message. Les parents voient les arrivées, le carnet, et leurs cases Pajemploi. Ils ne peuvent rien modifier. Et tu peux couper le lien quand tu veux. »
6. **Simuler un accueil** (Simulateur) — « Une famille t'appelle pour une place. Combien va lui coûter l'accueil ? Ouvre Simuler un accueil. Entre les horaires, ton tarif brut, l'entretien et les repas. Ajoute la situation de la famille et son revenu. Le coût réel s'affiche, après l'aide de la CAF et le crédit d'impôt. Mois par mois, la famille voit quand elle paie, et quand les aides arrivent. Envoie la simulation : la famille entre ses revenus chez elle. Toi, tu ne les vois pas. »

Rendu : `npx remotion render Mois out/raw-Mois.mp4 --browser-executable=<chrome>` puis `scripts/final.sh out/raw-Mois.mp4 ../public/videos/arvela-mois.mp4` (idem Inviter, Simulateur).
