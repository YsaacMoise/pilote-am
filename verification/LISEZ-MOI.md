# Vérification d'Arvela (ne part jamais sur le site)

Ce dossier contient des outils de contrôle. Il n'est ni importé par l'app, ni construit par Vite, ni vérifié par `tsc` (tsconfig.json ne vise que src et tests). Décision du DG (YKM) du 21/11/2026.

- `moteur-b/` : second moteur de paie, écrit en Python à partir des seuls textes (convention collective IDCC 3239, code du travail, code de l'action sociale et des familles, Urssaf), sans lire le code de l'app. Ses propres tests : `cd verification/moteur-b && python3 -m unittest discover -s tests`.
- `comparateur-ab/` : fait calculer les mêmes situations (cas officiels et grille de situations fictives) par le moteur de l'app (A) et par le moteur B, et classe chaque sortie : F1 accord, F2 désaccord, F3 B refuse, F4 A refuse, N les deux refusent.
- `verifier_paie.py` : lance le comparateur sur le code du dépôt et échoue au moindre désaccord. Lancé par GitHub à chaque demande de fusion (workflow « Second moteur », contrôle second-moteur).

## Règle d'indépendance
Un agent qui travaille sur `moteur-b/` ne lit jamais `src/` ni le résultat de sa construction : il part des textes. Le comparateur construit A dans un dossier temporaire neuf, hors de ce dossier. Toute correction de B se fait à partir d'un texte cité, jamais pour « coller » à A.

## Référence au 21/11/2026 (fusion T-050, commit 0fe9386)
Toutes les sorties : F1 4 790, F2 0, F3 271, F4 24, N 988. Cas officiels : F1 52, F2 0, F3 15, F4 16, N 22. Historique et rapports : dépôt YsaacMoise/calculateur-arvela (moteur/, rapports/).
