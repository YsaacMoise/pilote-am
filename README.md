# Arvela (ex-Pilote AM), version de travail

> Cette branche `main` est la version de travail, en ligne sur https://ysaacmoise.github.io/pilote-am/ .
> Elle part d'une copie de la version Claude Code du 28/10/2026. L'original (`base-claude-code-v1`, à ne jamais
> modifier) et l'ancienne version « Registre » (`archive-registre-v1`) sont archivés dans le dépôt privé
> `YsaacMoise/pilote-am-archives`, avec une copie de l'historique de `main` au 29/10/2026.
> Stockage propre à cette version : bases IndexedDB `pam-donnees` et `pam-demo`, caches `pam-…`.
>
> Avenants : `Contract.avenants` (conditions datées au 1er d'un mois : taux, planning, entretien, repas, km, majoration).
> `termsAt(contrat, date)` donne les conditions en vigueur ; le calcul de chaque mois et les jours prévus l'utilisent.

---

## Notes d'origine (version Claude Code)


L’app de bord d’une assistante maternelle (AM) : pointage par exception, carnet de liaison, déclaration Pajemploi par enfant, contrôle du bulletin, congés payés, fin de contrat, impôts. Tout reste sur le téléphone.

En ligne : **https://ysaacmoise.github.io/pilote-am/cc/**

Cette version a été conçue, codée, testée et publiée de bout en bout par Claude (Claude Code), sans question posée, pour le pilote de phase 1 (une AM, en France, sur iPhone). Les choix ci-dessous sont les miens.

---

## Installer sur iPhone

1. Ouvrir https://ysaacmoise.github.io/pilote-am/cc/ dans **Safari**.
2. Toucher **Partager**, puis **Sur l’écran d’accueil**, puis **Ajouter**.
3. Ouvrir **Pilote AM** depuis l’icône : c’est là qu’on travaille.

Important : Safari et l’icône ont des **données séparées** (c’est le fonctionnement d’iOS). Ce qui est saisi dans Safari n’apparaît pas dans l’app installée. La page d’accueil le dit avant toute saisie.

Pour découvrir sans rien saisir : **« Voir avec des enfants d’exemple »** sur la page d’accueil (3 enfants fictifs, une base de données à part, un bandeau jaune pour en sortir).

---

## Les 10 fonctions

| # | Fonction | Où |
|---|---|---|
| 1 | Contrats saisis par l’AM : enfant, famille, date de début réelle, année complète (52 sem.) ou incomplète (≤ 46 sem.) avec semaines sans accueil, planning type par jour avec 2 plages possibles, taux net, entretien, repas, km. Reprise d’un contrat en cours : soldes de départ (congés restants, congés en cours, jours d’enfant malade déjà déduits) et import des bulletins Pajemploi en PDF (pdf.js, build *legacy*, lu sur le téléphone) avec saisie manuelle de secours. Alerte en fin de contrat si l’historique est incomplet. | Plus › enfant |
| 2 | Pointage par exception : le planning remplit les journées ; « Arrivée » puis « Départ » en un geste ; départ oublié signalé (pastille sur le jour, bandeau, heure prévue retenue en attendant). | Aujourd’hui |
| 3 | Absences : enfant malade avec ou sans certificat, absence voulue par les parents, sans solde ; pour l’AM (tous les enfants) : congés payés, maladie, enfant malade, événement familial, sans solde. | Aujourd’hui › Modifier, « Je serai absente » |
| 4 | Calcul mensuel par enfant dans l’ordre de la déclaration Pajemploi, envoyé au parent par la feuille de partage (une déclaration par enfant depuis le 25/01/2026, faite par le parent). | Mois |
| 5 | Contrôle du bulletin déclaré, brut compris (cohérence net/brut, minimum conventionnel). | Mois › Contrôler le bulletin |
| 6 | Congés payés : compteur (à prendre, pris, restants, en cours) et indemnité (dixième contre maintien). | Plus › Congés |
| 7 | Fin de contrat : préavis, indemnité de rupture, régularisation, congés non pris. Aucun document officiel. | Plus › Fin de contrat |
| 8 | Carnet de liaison : boutons rapides (repas, sieste, change, humeur, soin, note), dictée par le micro du clavier, résumé du jour partagé aux parents. | Carnet |
| 9 | Compteur fiscal : abattement spécifique et revenu imposable estimé, par enfant et au total. | Plus › Impôts |
| 10 | Données du pilote : bouton « Ça coince » en haut de chaque écran, journal d’usage local, export mensuel anonymisé (enfants A/B/C, aucun prénom, aucune note du carnet, prénoms effacés des remarques). | Partout, Plus › Données du pilote |

---

## Skills utilisés

Avant de coder, j’ai cloné et lu des skills Claude publics (dans `.claude/skills/`, exclu du dépôt par `.gitignore`). Je n’ai exécuté aucun de leurs scripts : seules les instructions ont servi.

- **frontend-design** (anthropics/skills) : partir du sujet (une nounou, un enfant dans les bras, des gommettes de couleur), plan de jetons couleur/typo avant le code, éviter les looks « générés » (crème + terracotta, noir + vert acide, cartes identiques, étiquettes en capitales), une seule audace visuelle.
- **ui-ux-pro-max** (nextlevelbuilder/ui-ux-pro-max-skill) : priorités accessibilité > tactile > performance, et sa check-list « Pre-Delivery » pour mobile : cibles ≥ 44 pt, zones sûres, contraste vérifié séparément en sombre, pas d’emoji comme icône, retours au toucher.
- **accessibility** et **best-practices** (addyosmani/web-quality-skills) : méthode d’audit WCAG (POUR), noms accessibles, focus visible, aria-live, cibles, mouvement réduit.
- **webapp-testing** (anthropics/skills) : reconnaissance puis action avec Playwright, captures à chaque étape.
- **test-driven-development**, **verification-before-completion**, **requesting-code-review** (obra/superpowers) : cas chiffrés écrits pour chaque règle, aucune affirmation « ça marche » sans commande rejouée, relectures indépendantes par sous-agents.

Deux sous-agents ont relu le travail sans voir mes conclusions : l’un sur le moteur de paie (5 bugs chiffrés trouvés et corrigés, chacun couvert par un test de non-régression), l’autre sur le design et l’accessibilité (contraste du bouton « Annuler » en sombre, cibles de la barre des jours, ordre de l’écran Aujourd’hui, etc., tout corrigé).

---

## Choix de design

- **Idée directrice : les gommettes.** Chaque enfant a une pastille ronde de couleur avec son initiale (Myrtille, Menthe, Abricot, Framboise, Prune, Lagon), reprise en liseré sur sa carte. On reconnaît l’enfant d’un coup d’œil, sans lire.
- **Palette** : papier bleuté `#F4F6FB`, encre indigo `#1B2340`, action indigo `#3346C8`, jaune d’œuf `#FFC857` réservé au mode exemple. Sombre automatique (`prefers-color-scheme`), chaque couple vérifié ≥ 4,5:1 (texte) et ≥ 3:1 (bordures).
- **Typographie** : *Atkinson Hyperlegible Next* (conçue pour la lisibilité) pour le texte, *Bricolage Grotesque* pour les titres ; les chiffres et heures en police système arrondie (SF Rounded sur iPhone), chiffres tabulaires. Polices embarquées (sous-ensemble latin), donc disponibles hors ligne.
- **Une main, zone du pouce** : barre d’onglets en bas (Aujourd’hui, Carnet, Mois, Plus), gros bouton d’action en bas de chaque carte enfant, feuilles qui montent du bas pour les détails. Les cartes enfants passent avant les bandeaux d’information.
- **2 gestes max** : arrivée ou départ = 1 toucher ; absence d’hier = jour puis « Modifier » ; note de carnet = bouton puis choix ; envoyer le mois = onglet Mois puis « Envoyer au parent ».
- **Annulation partout** : chaque action laisse un toast « Annuler » (10 s). Suppressions comprises.
- **Zéro jargon, tutoiement** : « Salaire de base (le même chaque mois) » plutôt que « mensualisé », explications de calcul repliées sous « Comment c’est calculé ».
- **« Ça coince »** : petit bouton constant en haut à droite, il note l’écran concerné.

## Choix techniques

- **Preact + TypeScript + Vite**, site statique : `npm run build` produit `dist/`. Chemins relatifs (`base: './'`), routage par `#`, donc indifférent au sous-dossier `/cc/`.
- **Moteur de paie pur** (`src/engine/`), sans dépendance à l’interface, montants en **centimes entiers**, durées en minutes, dates en UTC (pas de piège d’heure d’été).
- **Taux datés** (`src/engine/rates.ts`) : une revalorisation = une ligne. Chaque mois est calculé avec les taux en vigueur ce mois-là.
- **Stockage** : IndexedDB `cc-pilote-am` (et `cc-pilote-am-demo` pour l’exemple), clé localStorage `cc-pilote-am-mode`, caches du service worker `cc-pilote-am-<version>` ; le préfixe `cc-` évite tout conflit avec l’autre version sur la même origine, et le service worker ne supprime que ses propres caches.
- **Stockage persistant** demandé (`navigator.storage.persist()`) au démarrage et depuis l’écran Sauvegarde.
- **Copies automatiques** : une copie complète par jour d’utilisation dans IndexedDB, les 7 dernières gardées, restaurables ; une copie de sécurité est faite avant toute restauration.
- **Sauvegarde hebdomadaire** : rappel après 7 jours ; fichier JSON partagé **seul**, sans texte ni titre (contournement du bug WebKit 244408) ; repli en téléchargement. La restauration vérifie le format, la version et chaque contrat avant de remplacer quoi que ce soit (testé).
- **Hors ligne** : service worker généré au build avec la liste exacte des fichiers (dont pdf.js et son worker), enregistré en relatif (`./sw.js`, portée `./`). Une mise à jour s’annonce par un toast « Mettre à jour » au lieu de recharger d’autorité.
- **Aucun serveur, aucun compte, aucune analytique.** Le journal d’usage est local ; seul l’export anonymisé, partagé à la main, en sort.

## Interprétations de paie (CCN IDCC 3239)

Sources vérifiées le 28/10/2026 : fiche DREETS Pays de la Loire du 12/06/2026 (SMIC 12,31 €, MG 4,35 €, minimum AM 4,20 € brut / 3,28 € net, entretien), fiche DREETS ARA congés et absences (art. 105, 47, 48), weblex.fr et salerya.fr sur la déclaration Pajemploi par enfant depuis le 25/01/2026, article 80 sexies du CGI. Quand une règle laisse un doute, l’app choisit l’interprétation **qui ne fait pas perdre d’argent à l’AM**, l’applique et l’affiche (Plus › Comment l’app calcule).

- **Mensualisation (art. 109)** : complète h/sem × 52 ÷ 12 ; incomplète × semaines ÷ 12. Les heures contractuelles au-delà de 45 h sont majorées dans la mensualisation.
- **Heures en plus (art. 96, 110)** : tout temps de présence hors des plages prévues du jour ; jusqu’à 45 h dans la semaine au taux du contrat, au-delà majoré (10 % par défaut, réglable). La base de la semaine est l’horaire prévu cette semaine-là (semaine sans accueil ou semaine d’embauche comprises). Une arrivée tardive ou un départ anticipé voulus par les parents ne sont pas déduits.
- **Retenue (art. 111)** : heures (complète) ou jours (incomplète) non payés ÷ heures ou jours prévus dans le mois. Fériés chômés et congés de l’AM hors diviseur. Même méthode pour les mois d’entrée et de sortie.
- **Enfant malade (art. 105)** : avec certificat, par année de contrat, retenue dans la limite de 5 jours d’absences courtes (5 jours prévus au plus chacune) **et** d’une absence longue de 14 jours calendaires consécutifs au plus ; les deux limites se cumulent (fiche DREETS Auvergne-Rhône-Alpes, mars 2024) ; sans certificat ou au-delà, payé. Un férié ou un congé de l’AM pendant la maladie ne consomme pas le quota.
- **Fériés (art. 47)** : chômés et payés si l’AM a travaillé le dernier jour prévu avant et le premier jour prévu après, sauf absence autorisée (congés, événement familial, absence voulue par les parents) ; une maladie de l’AM ou de son enfant ces jours-là rend le férié non payé ; 1er mai chômé toujours payé ; 1er mai travaillé +100 %, autre férié travaillé +10 % (un pointage un jour férié vaut « travaillé »). La majoration est ajoutée au salaire net ; la case « heures majorées » de Pajemploi ne reprend que les heures au-delà de 45 h.
- **Congés (art. 48, 102)** : 2,5 jours ouvrables par période de 4 semaines d’accueil (équivalence légale « 4 semaines = 1 mois », légèrement plus favorable qu’un décompte en mois), arrondi au supérieur, 30 au plus ; en année incomplète au prorata des semaines programmées. +2 jours par enfant à charge de moins de 15 ans, sans dépasser 30. Indemnité = max(maintien, dixième), dixième calculé sur les salaires nets de la période, indemnités de congés déjà versées comprises. Année complète : congés dans le salaire, complément du dixième en juin ; année incomplète : en juin, à la prise principale ou au fur et à mesure (douzième et 10 % mensuel non proposés).
- **Préavis (art. 120)** : 8 jours < 3 mois, 15 jours < 1 an, 1 mois au-delà, comptés à partir du jour de l’annonce (dernier jour = veille du même quantième).
- **Indemnité de rupture (art. 121)** : 1/80e des salaires bruts depuis l’embauche si l’ancienneté atteint 9 mois **à la date d’envoi de la lettre** (comme pour le préavis) ; décès de l’enfant : même calcul, 9 mois d’ancienneté au décès ; inaptitude d’origine professionnelle 2/80e ; rien en cas de démission, faute grave, période d’essai. Brut estimé depuis le net quand il manque.
- **Régularisation (art. 124)** : en année incomplète, heures prévues réellement dues (hors absences retenues) moins heures payées par la mensualisation, depuis l’embauche ou le début du suivi par l’app ; versée seulement si le solde est positif.
- **Congés non pris** : période en cours au plus favorable (dixième ou maintien) + jours restants de la période précédente moins ce qui a déjà été versé (rien n’est payé deux fois).
- **Entretien (art. 114.1)** : max(2,65 €, MG ÷ 10 par heure de présence), ou le montant du contrat s’il est supérieur ; seulement les jours d’accueil.
- **Brut** : net/brut ≈ 78,1 % (3,28/4,20, repère officiel). Le contrôle signale un rapport hors 74–82 % et un brut horaire sous le minimum conventionnel.
- **Impôts (CGI 80 sexies)** : 3 SMIC (4 si l’enfant ouvre droit à la majoration) par jour d’accueil et par enfant, prorata sous 8 h, plafonné aux sommes reçues (net imposable estimé + entretien + repas, km exclus). SMIC du 1er janvier de l’année des revenus.

## Tests et vérifications

- `npm test` : **59 cas chiffrés** du moteur (mensualisation, retenues, maladie, heures en plus, fériés, entretien, congés, fin de contrat, impôts, contrôle, déclaration), dont 7 tests de non-régression issus de la relecture.
- `node scripts/serve.mjs 4173 & node scripts/e2e.cjs` : **parcours complet Playwright** à 390×844, en clair puis en sombre : accueil, création d’un contrat repris, import d’un bulletin PDF (fichier fictif `tests/fixtures/bulletin-test.pdf`), arrivée/annulation/départ, enfant malade, absence de l’AM, carnet et résumé, mois et texte pour le parent, contrôle du bulletin, « Ça coince », sauvegarde puis restauration (et refus d’un faux fichier), export anonymisé sans prénom, rechargement **hors ligne**, rien qui dépasse de l’écran, cibles ≥ 44 px, **zéro erreur de console**.
- `AXE=…/axe.min.js node scripts/axe.cjs` : **audit axe-core WCAG 2.1 A/AA** de tous les écrans (et d’une feuille ouverte) en clair et sombre : aucune violation.
- `node scripts/shots.cjs` : captures de chaque écran, relues à l’œil.

## Limites connues

- Partage iOS non testable en automatique : dans Chromium, l’app retombe sur le téléchargement (fichiers) ou le presse-papiers (textes). À valider sur l’iPhone.
- Lecture des PDF Pajemploi : libellés reconnus par motifs tolérants (« salaire net », « brut », « heures normales », « jours d’activité », période). Je n’ai pas eu de vrai bulletin : chaque valeur lue est présentée pour vérification avant enregistrement.
- Brut estimé à partir d’un taux moyen de cotisations : c’est un ordre de grandeur, pas un bulletin.
- Hors Alsace-Moselle (fériés et cotisations différents). Pas de gestion des absences de longue durée (maternité, accident du travail), ni de l’accueil occasionnel.
- Les semaines sans accueil d’une année incomplète sont facultatives : sans elles, le diviseur des retenues et la régularisation sont moins précis.
- La date de début du suivi par l’app est le 1er du mois de création du contrat ; les mois antérieurs viennent de l’historique.
- Phase 2 (jusqu’à 4 AM) : rien n’empêche d’installer l’app sur 4 téléphones ; il n’y a volontairement pas de synchronisation.

## Développement

```sh
npm ci
npm test            # moteur de paie
npm run build       # dist/ (site statique complet)
node scripts/serve.mjs 4173   # sert dist/ sous /pilote-am/cc/
node scripts/e2e.cjs          # parcours complet (Playwright installé à part)
```

Arborescence : `src/engine/` (règles de paie), `src/screens/` (écrans), `src/ui/` (composants et icônes), `src/store.ts` (état, annulation, copies), `src/db.ts` (IndexedDB), `src/backup.ts` (sauvegarde, export anonymisé), `src/pdf.ts` (lecture des bulletins), `scripts/` (service worker, tests de bout en bout, icônes).
