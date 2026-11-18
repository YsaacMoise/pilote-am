# T-045 — Préavis non exécuté (constat B-2 de V5) — agent M11

Branche m11 (depuis m10 89677c2), dossier /home/claude/m11. Rapport écrit au fil de l'eau.

## 1. Point de départ (code lu)
- src/engine/fin.ts l. 235 : `const dernierJour = preavisFin;` La fin de contrat va toujours jusqu'à la fin théorique du préavis.
- `finDeContrat(ctx, notif, motif, enfants, presentation)` ignore `ctx.c.end` (remplacé par `dernierJour`, l. 236).
- Aucun chemin « dispense » ni « inexécution » dans src/.
- L'écran Contrat permet de saisir une date de fin (src/screens/Contrat.tsx l. 175) ; l'écran Fin n'a aucune saisie de dispense.
- Comparateur : l'adaptateur passe `end: k.fin` au contrat. La situation G-*-S18 de la base (démission notifiée le 30/10, fin le 30/10, moins de 3 mois) a donc une fin antérieure à la fin du préavis (06/11).

## 2. Lecture des textes

### 2.1 CCN IDCC 3239, socle commun (lu en entier : art. 63.2, 64, 64.1, 64.2, 64.3, 64.4, 65, 65.1, 65.2, 66)
Légifrance, texte de base KALITEXT000043941642?idConteneur=KALICONT000044594539, version en vigueur étendue consultée le 18/11/2026.
- Art. 64 : la date de fin du contrat correspond « à la date de fin du préavis, en cas d'exécution totale » ; « à la date prévue de fin du préavis, en cas d'inexécution totale ou partielle du préavis à l'initiative du particulier employeur » ; « au dernier jour travaillé, en cas d'inexécution totale ou partielle du préavis à l'initiative du salarié ».
- Art. 64.1 (version en vigueur) : délai préfix ; « Le préavis ne peut pas être interrompu. » Suspension seulement pour AT/MP survenant pendant le préavis, congé maternité ou adoption, congés payés (cumul possible avec accord écrit signé). En exécution totale, la fin est prorogée de ces suspensions.
- Art. 64.2, al. 1 : « L'inexécution totale ou partielle du préavis imposée par le particulier employeur donne droit à une indemnité compensatrice de préavis jusqu'à la date prévue de fin du contrat de travail. » Soumise à cotisations, égale à « la rémunération brute correspondant à la durée du préavis ». La période non exécutée compte pour les congés payés et l'ancienneté.
- Art. 64.2, al. 2 : « L'inexécution de la totalité ou d'une partie du préavis, à la demande du salarié, peut être acceptée par le particulier employeur. Dans ce cas, le contrat de travail prend fin au dernier jour travaillé. » Sans accord, l'inexécution imposée par le salarié ouvre droit, pour l'employeur, à une indemnité égale à la rémunération nette de la durée non exécutée.
- Art. 66 : l'indemnité compensatrice de préavis « correspond à la rémunération due au salarié jusqu'à la date de fin du contrat de travail ».
- Art. 63.2.1 : démission par écrit (LRAR ou remise contre décharge), point de départ du préavis à la première présentation ou à la remise.

### 2.2 CCN, socle AM (lu en entier : art. 119 à 119.5, 120, 121, 121.1, 121.2, 122)
- Art. 120 : complète l'art. 64 ; durées 8 jours, 15 jours, 1 mois ; point de départ ; ancienneté à l'envoi.
- Art. 122 : préavis finissant en cours de mois, déduction d'absence de l'art. 111 pour calculer l'indemnité compensatrice ; versement selon l'art. 66.
- Rien d'autre sur la dispense dans le socle AM : il renvoie au socle commun (art. 64, 64.2).

### 2.3 CASF (lu en entier : L423-23 à L423-27, version en vigueur au 18/11/2026)
Légifrance, section LEGISCTA000006187061. Applicable aux AM du particulier employeur (sous-section « assistants maternels employés par des particuliers »).
- L423-24 : retrait par l'employeur ; « L'inobservation de ce préavis donne lieu au versement d'une indemnité compensatrice du congé dû. »
- L423-26 : démission de l'AM après 3 mois, préavis d'un mois « à moins que l'employeur n'accepte d'abréger cette durée » ; l'inobservation est une rupture abusive ouvrant droit, pour l'employeur, à des dommages et intérêts.

### 2.4 Service-public.fr (lues en entier, sections dépliées)
- F33164 « Démission d'une assistante maternelle », vérifiée le 21/07/2026 : dispense décidée par l'employeur, l'AM « est rémunérée comme si elle avait travaillé » et la période compte pour les congés et l'ancienneté ; dispense demandée par l'AM et acceptée, « Le contrat de travail prend fin au dernier jour travaillé » et l'AM « n'est pas payée pour la partie du préavis non réalisé » ; refus de l'employeur, l'AM doit faire le préavis, sinon l'employeur peut demander une indemnité égale à la rémunération nette du préavis non réalisé, en saisissant le conseil de prud'hommes, et des dommages-intérêts.
- F16842 « Rupture du contrat de travail d'une assistante maternelle par un particulier employeur », vérifiée le 13/06/2025 : mêmes règles dans la question « Peut-on être dispensé de préavis ? », pour le retrait de l'enfant.
- Écart relevé, hors sujet T-045 : F33164 donne « Pas de préavis » pour une démission avant 3 mois ; la CCN art. 120 donne 8 jours (sujet T-023 et T-024, non touché).

### 2.5 Urssaf (lues en entier)
- « Particulier employeur : déclarer la fin de contrat avec votre salarié », mise à jour le 14/09/2026 : « Si le préavis n'est pas effectué, vous devez déclarer une indemnité compensatrice de préavis » ; la période de préavis est déclarée pour chaque mois civil. La page ne distingue pas qui est à l'origine de l'inexécution. Elle ne contredit pas l'art. 64.2 : elle décrit le cas général, sans viser la dispense demandée par le salarié.
- « Particulier employeur : les différents motifs de fin de contrat de travail » : rien sur la dispense.

## 3. Cas établis
| Cas | Texte | Date de fin | Somme liée au préavis | Décision dans A |
|---|---|---|---|---|
| A. Dispense demandée par l'AM, acceptée par les parents (totale ou partielle) | CCN 64 (3e tiret), 64.2 al. 2 ; SP F33164, F16842 | dernier jour travaillé | aucune ; la partie non faite n'est pas payée | calculé |
| B. Dispense à l'initiative des parents (totale ou partielle) | CCN 64 (2e tiret), 64.2 al. 1, 66, 122 ; CASF L423-24 | date prévue de fin du préavis | indemnité compensatrice = rémunération brute jusqu'à cette date, avec la déduction de l'art. 111 si fin en cours de mois ; compte pour congés et ancienneté | non géré (montants) ; la date et la règle sont affichées |
| C. AM qui ne fait pas son préavis sans accord | CCN 64 (3e tiret), 64.2 al. 2 fin ; CASF L423-26 ; SP F33164 | dernier jour travaillé | l'AM doit aux parents une indemnité égale au salaire net de la durée non faite ; dommages et intérêts possibles | non géré (montants) ; date et règle affichées |
| « Préavis interrompu en cours » | CCN 64.1 : « Le préavis ne peut pas être interrompu » ; 64 et 64.2 visent l'inexécution « totale ou partielle » | cas A, B ou C selon qui en prend l'initiative | idem | traité comme A, B ou C |

Pourquoi B et C sont refusés (le texte ne tranche pas tout) :
- B : aucun texte lu ne dit si l'indemnité compensatrice entre dans les « salaires bruts perçus » de l'indemnité de rupture (art. 121.1), ni comment la régularisation (heures « réellement effectuées ») traite la période non travaillée, ni si elle entre dans la base du dixième des congés. Le montant même de l'indemnité serait calculable (fonction existante du décès de l'enfant), mais le total dû ne l'est pas sans ces trois points.
- C : la créance des parents (salaire net de la durée non faite) se règle devant le conseil de prud'hommes selon SP F33164. Aucun texte lu ne dit si elle peut être retenue sur le solde de tout compte. L'app ne donne donc pas de « total dû ».

## 4. Code (branche m11)
Commit ae979df (moteur et tests) :
- src/engine/fin.ts : nouveau type `Inexecution { demandeur: 'am_acceptee' | 'employeur' | 'am_sans_accord'; dernierJourTravaille }`, 6e paramètre optionnel de `finDeContrat`.
- Cas A : `dernierJour` = dernier jour travaillé ; plus de variantes liées à la fin du préavis à confirmer (15 jours ou 1 mois, jour de présentation), puisque la fin ne dépend plus du préavis ; alerte qui cite les art. 64 et 64.2 ; `preavisFin` reste la fin théorique, pour information.
- Cas B, C : refus « non géré » avec la règle et la date de fin dans le message.
- Saisies incohérentes refusées : motif sans préavis (inaptitude, décès, faute grave, essai), dernier jour avant l'envoi de la lettre, dernier jour après la fin du préavis calculée.
- Garde B-2 : sans réponse sur le préavis, une date de fin du contrat saisie (`c.end`) antérieure à la fin calculée donne « non géré » au lieu d'un calcul silencieux jusqu'à la fin du préavis.
- tests/t045.test.ts : 7 tests, écrits avant la correction (6 échecs, 1 réussite pour le cas inchangé), puis 7 réussites. Les montants du cas A sont comparés au calcul de l'app pour un contrat qui finit le même jour sans préavis (faute grave), jamais à un chiffre calculé à la main.

Commit 4817f1e (écrans) :
- src/screens/Fin.tsx : question « Le préavis est-il fait en entier ? » (oui ou en cours ; non, à ma demande, accepté ; non, les parents m'en dispensent ; non, sans leur accord) et « Dernier jour travaillé », pour le retrait et la démission seulement.
- src/screens/Regles.tsx : règle et choix complétés.

## 5. Contrôles
- npm test : 23 fichiers, 496 tests réussis. npx tsc --noEmit -p . : aucune erreur. npm run build : réussi.
- Comparateur (copie /home/claude/m11-comp, A = m11) :
  - Base A = m10 89677c2 relancée : F1 4 071, F2 48, F3 850, F4 24, N 891 (conforme au brief).
  - A = m11, comparateur inchangé : F1 4 031, F2 32, F3 846, F4 80, N 895. Les 120 sorties qui changent sont toutes des G-*-S18 (30 situations) : indemnite_rupture F1 → F4 (30), regularisation_fin F1 → F4 (10), F2 → F4 (16), F3 → N (4) ; date_fin_preavis et iccp restent N (nouvelle note « non géré »). C'est l'effet voulu : A refuse une fin antérieure au préavis au lieu de calculer jusqu'au 06/11. Les 16 F2 de S18 étaient ce désaccord.
  - Essai (dans ma copie seulement, non commité ailleurs) : S18 avec `inexecution: am_acceptee, dernier jour 30/10` passée par l'adaptateur. Résultat F1 4 087, F2 32, F3 850, F4 24, N 891 : les 16 F2 de régularisation deviennent F1 (A et B d'accord au centime avec fin au 30/10) ; les 4 F3 restants sont des refus ARR-01 de B (arrondi de mensualisation), sans lien.
  - Recommandation pour le pôle comparateur (C4) : ajouter le champ `inexecution` à S18 dans generer_situations.py et le passer dans adaptateur_a.ts (une ligne : `finDeContrat(..., k.presentation, k.inexecution)`), comme le demande V5 (B-2 : garder une situation « démission, préavis non exécuté à la demande de l'AM »). Je ne l'ai pas fait dans /home/claude/projet.

## 6. Points non tranchés (à remonter au DG)
1. Cas B (dispense par les parents) : place de l'indemnité compensatrice dans l'indemnité de rupture (1/80), la régularisation et le dixième des congés. Question possible à la DDETS.
2. Cas C (départ sans accord) : la créance des parents peut-elle être déduite du solde de tout compte ?
3. Cas A, dernier jour travaillé égal à la fin calculée du préavis alors que cette fin est « à confirmer » : la fin vaut ce jour dans les deux lectures ; l'alerte dit « préavis non fait en entier » même si, dans la lecture de l'app, il a été fait. Sans effet sur les montants.
4. `c.end` postérieur à la fin calculée : A l'ignore toujours (comportement antérieur, hors T-045).
5. Écart service-public F33164 (pas de préavis pour une démission avant 3 mois) contre CCN art. 120 (8 jours) : à signaler aux tâches T-023 et T-024.

## 7. Couvert, non couvert, URL
Couvert : lecture intégrale des art. 63.2, 63.2.1, 63.2.2, 64, 64.1, 64.2, 64.3, 64.4, 65 à 66, 119 à 122 de la CCN ; CASF L423-23 à L423-27 ; fiches SP F33164 et F16842 entières ; deux pages Urssaf. Code, tests, écrans, comparateur.
Non couvert : art. 67 et 123 à 124 de la CCN (congés et régularisation de fin) non relus : sans objet pour le cas A, qui ne change que la date de fin ; ce sont eux qu'il faudrait lire pour trancher le cas B. Pas de jurisprudence cherchée. Aucune réponse DDETS.
URL consultées :
- https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000043941642?idConteneur=KALICONT000044594539
- https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074069/LEGISCTA000006187061/
- https://www.legifrance.gouv.fr/search/code (recherche de numéro d'article L423-26)
- https://www.service-public.gouv.fr/particuliers/vosdroits/F33164
- https://www.service-public.gouv.fr/particuliers/vosdroits/F16842
- https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-la-fin-du-contrat-de-trava/declarer-fin-contrat.html (redirection depuis l'ancienne page Pajemploi « les indemnités de fin de contrat »)
- https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-la-fin-du-contrat-de-trava/motifs-fin-contrat.html
Navigateur : onglet tab-1 ouvert par tabs_create, fermé à la fin.
