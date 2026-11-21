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

## 6. Suite (demande de la direction, 18/11/2026)

### 6.1 Dates du certificat que l'app ne connaît pas (art. 105)

Règle appliquée (charte : « le moteur ne devine jamais »). Quand la fenêtre de 14 jours calendaires, le classement court ou long ou le compte des 5 jours dépend d'une date que l'app ne connaît pas, le jour concerné passe en « à confirmer ». Il n'est plus retenu ni payé en silence. Aucune saisie n'a été ajoutée.

Mécanisme (payroll.ts, `sickLectures`). L'app calcule 16 combinaisons :
- lecture 1 ou lecture 2 du texte (T-033) ;
- début du certificat : premier jour d'accueil manqué, ou au plus tôt le lendemain du dernier jour d'accueil prévu avant l'absence ;
- fin du certificat : dernier jour manqué, ou au plus tard la veille du retour prévu ;
- un férié chômé ou un congé de l'AM entre deux absences : couvert par le même certificat (une seule absence) ou non (deux absences).

Un jour retenu dans les 16 combinaisons est retenu. Un jour payé dans les 16 est payé. Sinon il est « à confirmer ». Le message nomme la date en cause (« le premier jour du certificat (entre le 04/04 et le 07/04) », « si un même certificat couvre aussi le férié du 06/04 ») et chiffre les lectures en jours (« 9 à 10 jours de cette absence sont retenus »). Le montant en euros est déjà donné par le mois (« X € de salaire à confirmer, non compris dans le total »).

Le compteur des 12 mois glissants est couvert aussi. La période de 12 mois d'une absence est prise à la date de début de chaque combinaison. Un certificat qui a pu commencer avant la date anniversaire change donc de période, et le jour passe « à confirmer ».

Tests écrits avant la correction. Ils ont d'abord échoué (« expected true to be false » et « expected [] to deeply equal [...] »), puis réussi après le commit e1cd63f :
- lundi de Pâques 6 avril 2026 férié, absence du mardi 7 au lundi 20 : le lundi 20 était retenu en silence ; il est maintenant « à confirmer », et 9 jours sont retenus ;
- absence du 30 mars au 3 avril, puis du 7 au 10 avril, avec le férié du 6 entre les deux : les 4 jours d'avril étaient payés en silence (la lecture 1 sur une seule absence les retient) ; ils sont maintenant « à confirmer » ;
- planning régulier sans férié (9 au 23 mars) : inchangé ;
- avril 2026 : 1 jour d'enfant malade à confirmer, chiffré à part ; fin de contrat (9 mois d'ancienneté) : « Indemnité de rupture à confirmer », qui cite le salaire d'enfant malade.

Le message du constat M-6 (commit 3aeb056) est remplacé par ce message général : « le dernier jour du certificat (entre le 20/03 et le 22/03) ». Le test M-6 a été mis à jour.

Contrôle des autres endroits :
- Régularisation à l'avenant : elle lit les jours via `dayInfo` et `monthBase` (lectures « dus » et « retenus »). Les nouveaux jours à confirmer y passent sans code ajouté.
- Fin de contrat : même chemin (`naturesAConfirmer`, nature « maladie »), vérifié par test. La fin de contrat borne la fin possible du certificat au dernier jour du contrat.
- Compteur des 12 mois : traité ci-dessus.
- Ambiguïtés restantes, sans lien avec une date inconnue, non tranchées :
  - (a) une absence qui chevauche la date anniversaire est comptée en entier dans la période de son premier jour ;
  - (b) une absence de 5 jours prévus ou moins, mais de 14 jours calendaires ou plus (accueil 1 ou 2 jours par semaine), est toujours traitée en absence courte, car `ep.length > 5` est exigé dans les deux lectures ;
  - (c) le solde « jours déjà déduits avant l'app » ne dit pas si ces jours venaient d'une absence courte ou longue.
  Le texte ne règle aucun de ces trois cas. Les cas (a) et (b) peuvent changer un jour retenu. Je les remonte à la direction sans les corriger, car ils dépassent la demande.

### 6.2 Valeur 4,37 € du titre (relue à la source)

La valeur est juste, mais le libellé de l'app était faux.

Source : Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », « Mis à jour le 01 juin 2026 ». https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/remunerer-salarie-domicile.html . Lue le 18/11/2026 dans le navigateur intégré, page entière, tableaux dépliés.
- Le tableau « Salaire horaire minimum pour l'emploi d'un assistant maternel », « Au 1er juin 2026 », porte : « Salaire horaire brut majoré (4 %)* 4,37 € ». C'est la même valeur en métropole et Drom et en Bas-Rhin, Haut-Rhin et Moselle. Mayotte : « Non concerné ». Net majoré : 3,41 € (3,35 € en Alsace-Moselle).
- Renvoi * : « Le montant horaire minimum peut être majoré de 4 % (sauf à Mayotte) si l'assistant maternel est titulaire du titre « Assistant maternel - garde d'enfants ». »
- Date d'effet : 1er juin 2026.

Défaut corrigé. L'écran nommait le titre « AM-AP » (Assistant maternel – Assistant parental), alors que la source dit « Assistant maternel - garde d'enfants ». Le libellé est corrigé, et la source est citée dans rates.ts (`MINIMUM_TITRE_AM_AP`). Le simulateur ne s'applique déjà pas à Mayotte (`MESSAGE_ZONE_SIMULATEUR`). Je n'ai pas cherché l'avenant de la CCN sur Légifrance : la source Urssaf, admise, suffit à fixer le montant et la date.

Commit 05e8d28.

### 6.3 Contrôles de la suite

- npm test : 486 tests réussis (22 fichiers). tsc : aucune erreur. npm run build : construit.
- Comparateur (copie /home/claude/m10-comp, A = m10 au commit 05e8d28) : 5 884 sorties, F1 4 071, F2 48, F3 850, F4 24, N 891 ; cas officiels F1 35, F2 0, F3 32, F4 16, N 22, ERREUR 0. Identique à la base de départ. Les situations du comparateur ne contiennent pas d'absence d'enfant malade autour d'un férié ou d'un planning irrégulier.
- URL de la suite : la page Urssaf ci-dessus. L'art. 105 avait déjà été lu en entier (§ 1).

## 7. Suite 2 (direction, 18/11/2026) : ambiguïtés (a), (b), (c) de l'art. 105, puis T-044 (entretien)

### 7.1 Art. 105, ambiguïtés (a), (b), (c) — commit 89677c2

Texte relu (art. 105, déjà lu en entier, § 1). Il ne tranche aucun des trois cas :
- (a) Une absence à cheval sur la date anniversaire. Le texte dit « Ces limites sont appréciées par période de 12 mois glissants à compter de la date d'effet de l'embauche ou de sa date anniversaire ». Il ne dit pas dans quelle période compter une absence qui touche les deux.
- (b) Une absence de 14 jours calendaires ou plus qui ne compte que 5 jours d'accueil ou moins (accueil 1 ou 2 jours par semaine). Le texte définit l'absence courte par « 5 jours d'absence » et l'absence longue par « 14 jours calendaires consécutifs ». Il ne dit pas laquelle s'applique quand les deux conviennent. Le guide DREETS Bourgogne-Franche-Comté (fiche 03, IV, source secondaire) parle de « deux types d'absence différentes : courtes ou d'une durée minimale de 14 jours consécutifs », mais « sous réserve de l'appréciation souveraine des tribunaux ». Il ne tranche donc pas.
- (c) Les jours déjà retenus avant le suivi par l'app (`maladieDeduits`). Le solde ne dit pas s'ils venaient d'absences courtes ou d'une absence longue.

Correction. Trois nouvelles lectures sont ajoutées aux combinaisons de `sickLectures` (payroll.ts) :
- `couper` : l'absence est coupée à la date anniversaire ;
- `longue14` : l'absence de 14 jours calendaires ou plus est l'absence longue, même avec 5 jours d'accueil ou moins ;
- `soldeLong` : le solde vient d'une absence longue.

Un jour qui change selon la lecture passe « à confirmer ». Le message nomme le point non tranché, et le mois chiffre le salaire de ces jours, hors du total. Aucune saisie n'est ajoutée.

Défaut corrigé au passage. Avec plus de 5 jours déjà retenus, l'app gardait l'absence longue disponible. Or plus de 5 jours retenus impliquent déjà une absence longue. La lecture « courtes » met donc `longUsed` à vrai au-delà de 5 jours.

Tests écrits avant la correction (tests/t041.test.ts, bloc « suite 2 »). Les trois échouaient avec le payroll.ts d'avant, vérifié en remettant l'ancien fichier, puis réussissent :
- (a) contrat du 11/03/2025 ; 5 jours retenus en février 2026 ; absence du 9 au 13 mars 2026. Les 11, 12 et 13 mars sont « à confirmer », car ils sont payés ou retenus selon la période retenue. Message : « date anniversaire du contrat (11/03) ».
- (b) accueil le lundi seulement ; 4 lundis isolés, puis les 2, 9 et 16 mars. Le 9 mars est « à confirmer ».
- (c) 6 jours déjà retenus avant l'app ; absence de 3 jours. Les 3 jours sont « à confirmer ». Le test d'origine (4 jours déjà retenus, 1 jour retenu sur 2) reste vrai.

Comparateur après ce commit : identique à la base (F1 4 071, F2 48, F3 850, F4 24, N 891 ; cas officiels 35, 0, 32, 16, 22).

### 7.2 T-044, indemnité d'entretien — commit 7cf046d

Sources lues en entier le 18/11/2026, dans le navigateur intégré :
- CCN IDCC 3239, socle AM, art. 114 (114.1 et 114.2 en vigueur, plus l'ancienne 114.2), « EN VIGUEUR ÉTENDU ». https://www.legifrance.gouv.fr/conv_coll/id/KALISCTA000043941701?idConteneur=KALICONT000044594539
  - 114.1 : « Elle est versée en cas de travail effectif, par heure de travail. »
  - 114.1 : « Le montant horaire de cette indemnité est prévu dans le contrat de travail. Il varie en fonction de la durée de travail effectif, sans pouvoir être inférieur à 90 % du minimum garanti lorsque la durée de travail journalière est de 9 heures. »
  - 114.1 : « Quel que soit le nombre d'heures de travail effectif par jour de travail, le montant journalier de cette indemnité ne peut pas être inférieur à 2,65 €. »
  - 114.2 porte sur l'indemnité de repas et ne touche pas l'entretien.
- Même page, art. 99 « Décompte du temps de travail », lu en entier. Le travail débute à l'heure prévue, ou à l'arrivée de l'enfant « si celle-ci est antérieure ». Il prend fin à l'heure prévue, ou au départ de l'enfant « si celle-ci est postérieure ».
- Renvoi de 114.1 aux « dispositions légales et réglementaires de droit commun ». CASF D423-6 et D423-7 sont lus en entier, « EN VIGUEUR DEPUIS LE 01 MAI 2008 ». D423-7 : « au moins 85 % du minimum garanti [...] par enfant et pour une journée de neuf heures. Ce montant est calculé en fonction de la durée effective d'accueil quotidien. » https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074069/LEGISCTA000018256011/
- Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », mise à jour du 01/06/2026, section entretien. Elle donne « Montant journalier par enfant pour 9 heures de garde* » : 3,83 € du 1er janvier au 31 mai 2026, 3,92 € au 1er juin 2026. Renvoi : « Ce montant est proratisable en fonction du nombre d'heures d'accueil par jour. Il ne peut être inférieur à 2,65 €. » Et : « Elle n'est pas versée en cas d'absence de l'enfant. » https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/remunerer-salarie-domicile.html
- service-public.fr F12812, « Vérifié le 17 juin 2026 » : « au moins égale à 3,92 € par enfant et pour une journée de 9 heures. Son montant varie en fonction de la durée d'accueil. Mais il ne peut pas être inférieur à 2,65 €. » https://www.service-public.gouv.fr/particuliers/vosdroits/F12812

Réponses établies :
1. Le contrat fixe un montant horaire. C'est la lettre de 114.1 (« Le montant horaire de cette indemnité est prévu dans le contrat »). Les tableaux Urssaf et la fiche service-public donnent des montants « pour 9 heures » : ce sont des minimums de référence, pas une règle de tarif par jour. Aucun texte n'interdit d'écrire en plus un équivalent journalier. Mais aucun ne dit ce que vaut un montant par jour écrit seul quand la journée change de durée.
2. Un jour plus long ou plus court : l'employeur doit le montant horaire du contrat × la durée de travail du jour (114.1 « par heure de travail », « varie en fonction de la durée de travail effectif »), et au moins le minimum du jour. Ce minimum vaut 90 % du MG pour 9 h, proratisé (Urssaf), sans descendre sous 2,65 €. La durée de travail se compte selon l'art. 99 : un enfant qui part plus tôt ne raccourcit pas la journée, et un enfant qui reste plus tard l'allonge.

Corrections :
- Saisie « par heure » ou « par jour » au contrat et à l'avenant. Le nouveau composant src/screens/EntretienSaisie.tsx propose « par heure » par défaut, ce que le texte prévoit. Le nouveau champ `entretienHeure` (model.ts, conditions d'avenant) donne pour chaque jour : tarif × durée de travail, avec au moins le minimum.
- Durée de travail selon l'art. 99 : heures prévues plus présence hors des plages prévues ; hors planning, la présence. Elle sert aussi au minimum. Avant, l'app prenait la présence seule. Un enfant parti à midi faisait donc tomber le minimum à 2,65 € au lieu de 8 × 0,435 = 3,48 €.
- Tarif « par jour », c'est-à-dire tous les contrats existants. Le texte ne dit pas si ce tarif vaut pour la journée, quelle que soit sa durée (lecture 1), ou pour les heures prévues ce jour-là (lecture 2). Quand la durée de travail diffère du planning et que les deux lectures diffèrent, l'app verse le plus bas des deux, et au moins le minimum. L'écart est « à confirmer », hors du total. Il apparaît dans le détail du mois, le texte aux parents, la liste « sans ... à confirmer » et l'alerte du mois. Pour un jour hors planning, aucune durée de référence n'existe : seul le minimum est versé, le reste du tarif du jour est « à confirmer ».
- Contrôle du bulletin : un montant déclaré entre les deux lectures n'est plus signalé comme « différent ».
- Arrondi : les montants du jour sont sommés sans arrondi, puis le mois est arrondi une fois. Aucun texte ne fixe l'arrondi. L'écart avec un arrondi par jour est de quelques centimes (2 centimes sur l'exemple G-C52). Ce point n'est pas tranché ; il rejoint A-36.

Exemple du constat (situation G-C52-H32-T420-S10, septembre 2026, 4,00 € par jour pour 8 h, soit 0,50 € de l'heure) :
- Avec un contrat « par heure » à 0,50 €, l'app donne 72,50 €. C'est la lecture horaire du constat (test).
- Avec un contrat « par jour » à 4,00 € (le cas du comparateur), l'app verse 69,31 €, soit la lecture 1 et le minimum les jours longs. L'écart avec la lecture 2 est « à confirmer ». Pour le seul 7 septembre (10 h) : 4,35 € versés, 0,65 € à confirmer (test).

Tests écrits avant la correction (tests/t044.test.ts). Les quatre premiers échouaient (6307 au lieu de 7250 ; pas de part à confirmer ; 5833 au lieu de 5916). Ils passent après, avec un cinquième test sur le contrôle du bulletin.

A-35 et A-36 ne sont pas modifiés (moteur B, autre agent) :
- A-35 (formule pour une journée autre que 9 h) est concerné indirectement. La formule de minimum de A est inchangée (MG ÷ 10 par heure, au moins 2,65 €). Seule la durée à laquelle elle s'applique change (art. 99).
- A-36 (arrondi de 0,90 × MG) n'est pas modifié. L'arrondi au mois décrit ci-dessus relève de la même famille de question.

fin.ts n'est pas modifié (branche m11 de M11).

Comparateur après le commit 7cf046d : identique à la base (F1 4 071, F2 48, F3 850, F4 24, N 891 ; cas officiels 35, 0, 32, 16, 22). La raison : l'adaptateur du comparateur ne transmet que `entretien_jour` à A. Pour les jours plus longs, la part versée par A reste la lecture 1. Les 31 F2 « entrée de l'entretien » relevés par C4 subsistent donc côté comparateur. Si l'adaptateur transmettait `entretien_horaire` en `entretienHeure`, A donnerait la lecture horaire (72,50 € sur G-C52). C'est le domaine de C4, je n'y ai pas touché.

### 7.3 Contrôles

- npm test : 494 tests réussis, 23 fichiers. tsc : aucune erreur. npm run build : construit.
- Rendu des écrans (saisie par heure ou par jour) : non vu dans un navigateur. Le typage et la construction passent.
- URL consultées pour la suite 2 : les quatre du § 7.2, en plus de l'art. 105 (§ 1).

## 8. T-044b : corrections après la relecture V5 (périmètre 2) — commit 66b3011

Constats traités : /home/claude/v5-relecture.md, « Périmètre 2 » (P2-B1, C2-1, C2-2, C2-3), plus la demande de la direction de ne pas présélectionner le mode « par heure ».

### 8.1 P2-B1 : durée d'accueil ou durée de travail

Sources (déjà lues en entier au § 7.2, plus l'art. 98.1.1 relu par V5 sur la même page Légifrance) :
- CCN 98.1.1 : « Les périodes de travail correspondent au temps d'accueil de l'enfant ».
- CCN 114.1 : l'indemnité couvre « les frais occasionnés par l'accueil de l'enfant », et elle est versée « par heure de travail ».
- CASF D423-7 : « durée effective d'accueil quotidien ».
- Urssaf : « proratisable en fonction du nombre d'heures d'accueil par jour ».
- service-public F12812 : « varie en fonction de la durée d'accueil ».
- CCN 99 : décompte du temps de travail (heure prévue, ou arrivée plus tôt, ou départ plus tard).

Conclusion. Aucun texte ne dit si la durée qui sert à l'entretien est le temps de présence de l'enfant ou le temps de travail de l'art. 99. En T-044, j'avais retenu l'art. 99 seul : c'était une lecture appliquée en silence. Je l'ai retirée.

Correction (payroll.ts, `computeRange`). Pour chaque jour d'accueil, l'app calcule toutes les lectures non tranchées :
- les deux durées : présence de l'enfant, ou travail selon l'art. 99 ;
- avec un tarif par jour, deux valeurs de ce tarif : pour la journée entière, ou pour les heures prévues ;
- avec un tarif par jour, un jour hors planning n'a aucune durée de référence : seul le minimum est certain.

Chaque montant est porté au minimum du jour, calculé sur la même durée, puis arrondi (§ 8.4). L'app verse le plus bas. L'écart avec le plus haut est « à confirmer », hors du total. Le message donne le montant versé, le montant le plus haut possible et la raison de chaque écart.

Sonde V5 reprise en test : contrat à 0,50 € de l'heure, enfant parti à midi. L'app verse 2,65 € (4 h de présence, au minimum) et met 1,35 € « à confirmer » (4,00 € sur 8 h de travail). Avant, elle versait 4,00 € sans rien dire.

La contradiction relevée par V5 est levée. Une absence de toute la journée ne donne aucun entretien : c'est la règle de l'Urssaf (« Elle n'est pas versée en cas d'absence de l'enfant ») et de la CCN 114.1 (« en cas de travail effectif »). Une demi-journée n'est plus payée comme une journée travaillée : seule la part de présence est certaine, le reste est « à confirmer ».

Mode « par heure » ou « par jour » : choix explicite, sans valeur présélectionnée (EntretienSaisie.tsx, liste de choix). Chaque option a une phrase qui explique la différence. Le choix est obligatoire pour enregistrer un nouveau contrat (« Indique si l'indemnité d'entretien est fixée par heure ou par jour. »). Le nouveau champ `entretienMode` fait partie des conditions d'avenant. Le simulateur ne transmet le mode que si un montant y a été saisi.

### 8.2 C2-1 : aucun mois passé modifié en silence

- Moteur. Le montant versé est le plus bas des lectures. L'ancien calcul (tarif du jour, au minimum sur la présence) est toujours l'une de ces lectures. Si le montant versé change par rapport à l'ancien calcul, c'est donc que les lectures diffèrent, et une part est « à confirmer ». Pour un mois terminé, cette part déclenche l'alerte « Si ce mois est déjà déclaré à Pajemploi… » (test sur la sonde S3 de V5 : tarif de 3,00 € par jour, enfant parti à midi).
- Écrans. Sur un contrat existant, le mode et le montant de l'entretien sont affichés en lecture seule, avec le renvoi : « Pour la changer, fais un avenant daté : les mois d'avant gardent leur calcul. » Dans l'avenant, si la date est avant le mois en cours et que l'entretien change, un bandeau dit que les mois passés seront recalculés et redonne la consigne « mois déjà déclaré ».

### 8.3 C2-2 : récapitulatif des impôts

fiscal.ts affiche maintenant deux messages :
- « Indemnité d'entretien à confirmer : X en <mois> ne sont pas comptés. Ajoute-les une fois confirmés avec les parents. »
- pour les km à confirmer : « ils ne sont pas comptés, comme tous les frais kilométriques dans ce récapitulatif ». Les km ne sont jamais dans les sommes reçues de ce récapitulatif ; le message évite seulement qu'ils disparaissent sans un mot.

### 8.4 C2-3 : arrondi (décision ARR-01 du DG)

Niveau d'arrondi : chaque montant du jour, au centime le plus proche. Trois raisons :
- la décision ARR-01 du DG (18/11/2026, journal) fixe le centime le plus proche, jusqu'à la réponse de la DDETS ;
- le DG a gardé l'arrondi jour par jour pour les km (« arrondi jour par jour gardé, décision ARR-01 étendue ») ;
- le minimum de l'entretien est un montant journalier (CCN 114.1, « le montant journalier […] ne peut pas être inférieur à 2,65 € »), déjà arrondi par jour dans l'app.

Quand l'arrondi du seul total du mois donnerait un autre montant, l'app le dit : « Indemnité d'entretien : X en arrondissant chaque jour au centime le plus proche. En arrondissant seulement le total du mois, elle serait de Y. Aucun texte ne dit à quel moment arrondir… ». Exemple G-C52 avec un contrat « par heure » à 0,50 € : 72,52 € versés, 72,50 € avec l'arrondi du mois (4 jours de 9 h 45 à 4,875 € chacun). Avec un tarif par jour, les montants du jour sont déjà en centimes : pas d'écart (sondes V5 S1, S7, S8).

### 8.5 Tests

Tests ajoutés dans tests/t044.test.ts, bloc « T-044b ». Avec le moteur de 1dff034 (payroll.ts, fiscal.ts et model.ts remis temporairement), trois échouent :
- P2-B1 ;
- C2-1 ;
- C2-2.

Un quatrième (absence toute la journée = 0 €) passait déjà : c'est un garde-fou. Tous passent après la correction.

Deux tests de T-044 ont changé d'attendu, par décision et non par régression :
- G-C52 « par heure » : 72,52 € avec l'alerte d'arrondi (au lieu de 72,50 €) ;
- enfant parti à midi avec un tarif sous le minimum : 2,65 € versés et 0,83 € à confirmer (au lieu de 3,48 € versés).

Résultats : npm test 498 tests réussis (23 fichiers), tsc sans erreur, npm run build construit. Les écrans (choix du mode, lecture seule, bandeau de l'avenant) n'ont pas été vus dans un navigateur : seuls le typage et la construction les vérifient.

### 8.6 Comparateur

Adaptateur de /home/claude/v11/tests/comparateur-ab : il transmet `entretien_horaire` en `entretienHeure` quand A le connaît. Deux copies à moi :
- /home/claude/m10-c-avant, avec A = 1dff034 ;
- /home/claude/m10-c-apres, avec A = 66b3011.

Moteur B : celui de v11. CORRECTION (T-044c, constat de la direction) : la comparaison que j'avais publiée ici était faussée et ne vaut rien. J'avais conclu que les copies donnaient le même résultat et qu'aucune sortie ne différait. Mais les deux lancements, faits en même temps, construisaient A dans le même dossier /tmp du comparateur : l'un a pu utiliser le A de l'autre. Le comparateur utilise maintenant un dossier unique. La direction l'a relancé avec A = 66b3011 : F1 4 724, F2 6, F4 90. Les situations X-ENTH-* sortent bien en « à confirmer ».

fin.ts n'est pas modifié (branche m11).

Non tranché, remonté au DG :
1. durée d'accueil ou durée de travail pour l'entretien (P2-B1) ;
2. valeur d'un tarif par jour pour une journée d'une autre durée ;
3. niveau d'arrondi, jusqu'à la réponse de la DDETS (ARR-01 appliqué au jour).

Constat mineur n-3 (nom de constante `MINIMUM_TITRE_AM_AP`) : non changé, c'est cosmétique.

## 9. T-044c : libellé de la raison de l'entretien à confirmer — voir le commit ci-dessous

Constat de la direction. Sur la situation X-ENTH-DEPART-5H (contrat « par heure », 0,60 €), le texte aux parents disait « tarif du contrat par jour, journées d'une autre durée que le planning ». C'était faux : l'écart vient de la durée retenue, présence de l'enfant ou temps de travail.

Correction :
- Le mois compte maintenant les jours à confirmer par raison : durée d'accueil ou de travail ; tarif par jour avec une durée différente du planning ; jour hors planning au tarif par jour. Ces compteurs sont sommés quand un avenant coupe le mois.
- Le texte aux parents (month.ts, `raisonsEntretienAConfirmer`) donne seulement les raisons du mois. Contrat « par heure » : « une journée comptée en temps de présence de l'enfant ou en temps de travail, selon la lecture ». Contrat « par jour » : on y ajoute « tarif du contrat par jour, journée d'une autre durée que le planning », ou « hors planning » selon le cas.
- L'alerte du mois (payroll.ts) distinguait déjà ces raisons. Elle ne change pas.

Tests : tests/t044.test.ts, bloc « T-044c » (départ après 5 h ; contrat par heure à 0,60 €, puis contrat par jour). Les deux tests échouaient avec le month.ts d'avant et passent maintenant. npm test : 500 tests réussis. tsc sans erreur. Build construit.
