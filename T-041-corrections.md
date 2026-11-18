# T-041 — Moteur A, constats M-6 et R-2 de la relecture V4

Agent M10, branche m10 (départ 19f985f), 18/11/2026. Constats tirés de regles/t036-relecture.md (M-6, R-2).

## 1. Sources relues

- Légifrance, CCN IDCC 3239, socle AM, titre Ier, chapitre V « Absences » (art. 104 et 105), lu en entier, « EN VIGUEUR ÉTENDU », affiché le 18/11/2026. https://www.legifrance.gouv.fr/conv_coll/id/KALISCTA000043941866?idConteneur=KALICONT000044594539
  - Art. 105, al. 1 : « Les périodes pendant lesquelles l'enfant est confié à l'assistant maternel étant prévues au contrat de travail, les temps d'absence non prévus sont rémunérés. »
  - Art. 105, al. 3, 2e tiret : « en cas d'absence durant 14 jours calendaires consécutifs. Au-delà de 14 jours calendaires consécutifs, le particulier employeur doit reprendre le paiement du salaire ou rompre le contrat de travail conformément à l'article 119.1 ».
  - Art. 105, al. 2 : le certificat sert à justifier l'absence ; il est transmis « au plus tard au retour de l'enfant ». Le texte ne dit nulle part que la durée se mesure sur les dates du certificat.
- Renvoi lu en entier : art. 119.1 (rupture à l'initiative du particulier employeur), « EN VIGUEUR ÉTENDU ». https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000043942309 . Il traite du retrait de l'enfant, pas de la mesure de l'absence.
- Source secondaire (DREETS, admise) : DREETS Bourgogne-Franche-Comté, guide des assistantes maternelles, mise à jour 06/2026, fiche 03, partie IV « Absences de l'enfant gardé pour raison médicale (article 105) », lue en entier. https://bourgogne-franche-comte.dreets.gouv.fr/sites/dreets-bourg-fc/files/2026-08/Assistante%20maternelles%20Maj%2006%202026.pdf . Elle reprend « 14 jours calendaires consécutifs » et parle d'une absence « d'une durée minimale de 14 jours consécutifs ». Elle ne dit pas non plus comment compter les jours sans accueil couverts par le certificat.

## 2. M-6 : mesure de l'absence d'enfant malade (art. 105)

Constat. L'app mesure l'absence du premier au dernier jour d'accueil prévu (payroll.ts, `sickLectures`). Un certificat du lundi 9 au dimanche 22 mars couvre 14 jours calendaires ; l'app en compte 12 (du 9 au vendredi 20).

Conclusion. Le texte ne tranche pas. Il compte en « jours calendaires » (les week-ends situés à l'intérieur de l'absence comptent déjà dans l'app). Mais il ne dit pas si les jours sans accueil prévu situés après le dernier jour d'absence, ou avant le premier, font partie de « l'absence ». L'al. 1 définit l'absence par rapport aux « périodes pendant lesquelles l'enfant est confié » ; le certificat ne sert qu'à la justifier. La lecture « dates du certificat » et la lecture « jours d'accueil manqués » sont toutes deux fondées. Ambiguïté listée, pas tranchée (charte, règles des agents).

Décision appliquée. La mesure est inchangée. Les jours concernés restaient déjà « à confirmer » (lecture 1 : retenus ; lecture 2 : absence courte), jamais retenus en silence. Pas de saisie de la date de fin du certificat : elle ne servirait que si le texte retenait les dates du certificat, ce qu'il ne fait pas. Le message « à confirmer » ajoute une phrase quand les jours sans accueil qui suivent l'absence lui font atteindre 14 jours calendaires : « Si le certificat médical couvre aussi les jours sans accueil jusqu'au 22/03, l'absence dure 14 jours calendaires. La convention ne dit pas si ces jours sans accueil comptent dans les 14 jours : l'app ne les compte pas et ne tranche pas. »

Commit 3aeb056 (src/engine/payroll.ts, tests/t041.test.ts).

Preuve par test (tests/t041.test.ts, bloc M-6, 3 tests) :
- du lundi 9 au vendredi 20 mars : 5 jours retenus dans les deux lectures, 5 jours à confirmer, message avec « jusqu'au 22/03, l'absence dure 14 jours calendaires » ;
- du lundi 9 au mercredi 18 mars (l'enfant revient le jeudi) : pas de phrase en plus ;
- absence du 9 au 23 mars (14 jours calendaires sur les jours prévus) : 10 jours retenus, rien à confirmer (inchangé).

Point résiduel, non corrigé. Au début de l'absence, la même question existe : un certificat qui commence un jour sans accueil ferait partir la fenêtre de 14 jours plus tôt. Avec un planning hebdomadaire régulier, cela ne change aucun jour retenu (les jours en tête de fenêtre et en fin de fenêtre tombent les mêmes jours de la semaine, donc sans accueil). Un écart n'est possible qu'avec un planning irrégulier (semaines différentes, jour férié). Dans ce cas, l'app retient un jour de plus que la lecture « dates du certificat », dans les deux lectures, donc sans « à confirmer ». À décider par la direction : accepter le risque ou demander la date de début du certificat.

## 3. R-2 : textes figés qui citent un montant ou une date de barème

Recherche faite dans src/ (« € », « depuis le », « 2025 », « 2026 », « 2027 », pourcentages). Textes traités, tous lus maintenant à la date du calcul :

| Écran | Texte figé avant | Lu désormais dans |
|---|---|---|
| Simulateur, taux horaire | « 4,37 € avec le titre AM-AP » (constante de l'écran) | `minimumTitreAmAp(d)` dans rates.ts ; non cité si la grille a changé depuis le 1er juin 2026 |
| Simulateur, bandeau sous le minimum | « depuis le 1er juin 2026 » | `minConvDepuis(d)` : date depuis laquelle le minimum conventionnel brut est inchangé |
| Simulateur, entretien | « 0,435 € par heure », « 2,65 € » | `entretienHoraireMin(d)` (MG ÷ 10) et `entretienPlancherJour` |
| Simulateur, résidence alternée | « 875 € » (deux fois) | `CREDIT_PLAFOND_DEPENSES ÷ 2 × CREDIT_TAUX` |
| Simulateur, « Comment c'est calculé » | « 21,88 / 23,18 % », « 43,55 % », « 5 € par mois » | `cotisParams(d)` |
| Simulateur, heures majorées | « 11,31 % » | `cotisParams(d).reductionHeuresMajorees` |
| Simulateur, crédit d'impôt | « 50 % », « 2,65 € », « 1 750 € », « Règles en vigueur au 1er novembre 2026 » | constantes `CREDIT_*` ; « Règles en vigueur le <date du calcul> », ou « Règles connues au 30 novembre 2026 » si les barèmes sont provisoires |
| Aperçu du simulateur (accueil) | « règles 2026 » | année de la date du calcul, bornée à `BAREMES_VERIFIES_JUSQU_AU` |
| Contrat, repas fournis par les parents | « 5,50 € par jour en 2026 » | `repasAvantageAu(aujourd'hui)` ; sinon « valeur de <année> pas encore dans l'app » |
| Impôts, « Comment c'est calculé » | « 5,50 € en 2026 » | `repasAvantageParAnnee()` : toutes les années lues à la source |
| Comment l'app calcule (Règles) | « Au moins 2,65 € par jour » | `entretienPlancherJour` du jour |
| Contrôle du bulletin (moteur) | « minimum net … depuis le <date de la dernière ligne de barèmes> » | `valeurDepuis(mois, 'minConvNet')` |

Le dernier point est un vrai défaut trouvé par la recherche. Avec une ligne SMIC au 1er décembre 2026, le message aurait dit « 3,28 € depuis le 01/12/2026 » au lieu du 01/06/2026.

Non traités, avec la raison :
- legal.ts (dates de fin de test, de mise à jour, Pajemploi+ au 1er septembre 2027) : ce ne sont pas des barèmes. La date Pajemploi+ vient de la LFSS 2026, art. 101.
- « réforme de septembre 2025 » (CMG) : c'est une date de réforme, pas de barème.
- Simulateur, abattement CAF « 30 % » ; Impôts, « 2,9 % de 98,25 % » ; Règles, « environ 78 % » : ce sont des taux de règle ou des repères de contrôle, pas des montants datés dans rates.ts. À dater plus tard si la direction le veut.
- « 4,37 € » (titre AM-AP) : valeur déplacée telle quelle, non relue à la source par moi (avenant n° 10). Elle n'est plus citée dès que la grille change.

Commit 57a32f5 (src/engine/rates.ts, money.ts, controle.ts ; src/screens/Simulateur.tsx, SimApercu.tsx, Contrat.tsx, Fiscal.tsx, Regles.tsx ; tests/t041.test.ts). Aucun montant de paie changé.

Preuve par test (tests/t041.test.ts, blocs R-2, 5 tests) :
- au 18/11/2026 : « 1er juin 2026 », « 0,435 € », « 2,65 € », 4,37 €, repas 5,50 € en 2026 ;
- formats « 875 € », « 1 750 € », « 5 € », « 2,60 € » ;
- lignes de test ajoutées puis retirées de RATES (SMIC et MG au 1er décembre 2026, grille au 1er janvier 2027) : le minimum date toujours du 1er juin 2026 en décembre, l'entretien suit le MG, puis en janvier la date passe au 1er janvier 2027 et le minimum AM-AP n'est plus cité ;
- contrôle du bulletin de décembre 2026 avec la ligne du 1er décembre : « (3,28 €) depuis le 01/06/2026 » ;
- minimum net : date de la première ligne qui le porte (1er janvier 2025), rien avant.

Rendu à l'écran non vérifié : le navigateur intégré tourne sur l'ordinateur de YKM et ne voit pas le serveur local de mon espace, et Chrome sans écran de l'espace n'a pas monté l'app. Contrôle fait à la place sur le paquet construit : plus aucun des textes figés listés, et « Règles en vigueur le ${…} » présent.

## 4. Contrôles

- npm test : 22 fichiers, 481 tests réussis (473 au départ, plus 8 nouveaux).
- npx tsc --noEmit -p . : aucune erreur.
- npm run build : construit sans erreur.
- Comparateur, copie /home/claude/m10-comp, A = /home/claude/m10 après les deux commits : 5 884 sorties, F1 4 071, F2 48, F3 850, F4 24, N 891 ; cas officiels F1 35, F2 0, F3 32, F4 16, N 22, ERREUR 0. Identique à la base de départ (master 19f985f). Aucune régression. Moteur B non lu.

## 5. Bilan

- Couvert : M-6 (art. 105 et renvoi 119.1 lus en entier, guide DREETS BFC lu, ambiguïté listée, message précisé, testé) ; R-2 (tous les textes de src/ qui citent un montant ou une date de barème, plus un défaut du contrôle du bulletin).
- Non couvert : rendu visuel des écrans (raison ci-dessus) ; relecture à la source de la valeur 4,37 € (hors tâche) ; date de début du certificat (point résiduel du § 2, à décider).
- URL consultées : les quatre du § 1.
