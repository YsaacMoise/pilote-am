# Moteur B — Calculateur Arvela (tâche T-007)

Second moteur de paie, écrit pour le verrou 2 (deux moteurs écrits séparément doivent donner le même résultat au centime).

## Origine et indépendance

- Écrit seulement à partir de `regles/regles-v0.md`, corrigé par `regles/contre-verification-v0.md`. En cas de conflit, la contre-vérification l'emporte.
- Le code du moteur actuel n'a jamais été lu.
- Les résultats attendus des tests viennent seulement de `tests/cas-officiels-v0.md`.

## Principes

1. Montants en centimes entiers (`int`). Exemple : 600 € s'écrit `60000`.
2. Durées en minutes. Exemple : 40 h s'écrit `2400`.
3. Taux horaire en centimes par heure. Exemple : 4,50 € s'écrit `450`.
4. Les calculs intermédiaires sont exacts (fractions). Les nombres à virgule flottante (`5.0`) sont refusés. Une valeur non entière s'écrit en chaîne exacte : `"12.5"` ou `"40/3"`.
5. Arrondi. Aucune règle d'arrondi monétaire n'est écrite dans les règles v0. Si un montant exact n'est pas un nombre entier de centimes, le moteur refuse (code `ARR-01`). Il donne la valeur exacte dans `details` pour information. Seul arrondi appliqué : les jours de congés payés (CP), à l'entier supérieur (R-CP-01, Code du travail L3141-7).
6. Le moteur calcule en brut. Le passage au net est refusé (A-34, règle R-PAJ-04 douteuse).
7. Toute ambiguïté non tranchée (A-xx), tout exemple suspect cité (SUS-xx), toute règle douteuse et tout cas exclu donnent un refus « non géré ». Le moteur ne choisit jamais entre deux lectures. Quand plusieurs lectures donnent le même résultat, il conclut.

## Forme des sorties

Chaque fonction publique renvoie un dictionnaire.

| Clé | Sens |
|---|---|
| `statut` | `ok`, `provisoire`, `non_gere` ou `erreur_saisie` |
| `regles` | identifiants des règles appliquées (R-xxx) |
| `resultat` | valeurs calculées (si `ok` ou `provisoire`) |
| `code` | identifiant du refus (si `non_gere`) : A-xx, SUS-xx, règle douteuse, EXCLU-xxx, ARR-01, etc. |
| `motif` | texte du refus |
| `quoi_faire` | conduite à tenir pour l'utilisatrice |
| `details` | valeurs exactes ou résultats par méthode, pour information |
| `avertissement` | présent si `provisoire` |
| `message` | présent si `erreur_saisie` |

Statut `provisoire` : un barème utilisé est daté après le 18/11/2026 (dernière vérification). Le SMIC et le minimum garanti (MG) sont refusés à partir du 1er décembre 2026 (A-52 : hausse annoncée, texte non publié).

## Utilisation

```python
import sys; sys.path.insert(0, "moteur/B")
import moteur_b as m
m.mensualisation(36, 2400, 500)
# {'statut': 'ok', ..., 'resultat': {'type_annee': 'incomplete', 'heures_mensualisees': '120', 'salaire_mensualise_centimes': 60000}}
```

Lancer les tests (depuis `moteur/B`) : `python3 -m unittest discover -s tests -v`.

## Fonctions publiques

Abréviations : AM = assistante maternelle. « complete » = année complète (52 semaines). « incomplete » = année incomplète (46 semaines ou moins).

### Barèmes (`baremes.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `baremes_du_jour(d, titre_am_ap=False)` | date | SMIC, MG, minimum légal exact (0,281 × SMIC), minimum conventionnel, sources | R-SAL-01 à 05 |
| `minimum_horaire_brut(d, titre_am_ap=False, titre_obtenu_dans_le_mois=False)` | date | `minimum_centimes` | R-SAL-03, 04, 05 |
| `verifier_taux_horaire(taux, d, ...)` | taux brut, date | `conforme` | R-SAL-04 |

Barèmes enregistrés, avec source dans le code :
- SMIC : 12,02 € (01/01 au 31/05/2026), 12,31 € (depuis le 01/06/2026).
- MG : 4,25 € (01/01 au 31/05/2026), 4,35 € (depuis le 01/06/2026).
- Minimum conventionnel : 3,64 € (01/04/2025 au 31/05/2026), 4,20 € (depuis le 01/06/2026). Avec titre AM-AP : 3,79 € puis 4,37 €.
- Barème kilométrique de l'administration : base depuis le 01/01/2022 ; majoré du 01/06 au 31/12/2026 ; retour à la base au 01/01/2027 (provisoire).
- Plancher d'entretien : 2,65 € par jour.
Avant ces dates : refus `BAREME-ABSENT`.

### Mensualisation (`mensualisation.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `type_annee(semaines_accueil)` | entier | `complete` / `incomplete` ; A-01 de 47 à 51 semaines | R-MENS-02 |
| `semaines_programmees(employeur, repos_am, communes)` | semaines (entiers) | `semaines_programmees` = 52 − (employeur + repos − communes) | R-MENS-02, 04, R-CP-05 |
| `mensualisation(semaines, heures_hebdo_minutes, taux, nature_taux="brut", horaires_variables=False, date_paie=None)` | | `salaire_mensualise_centimes`, `heures_mensualisees` (fraction exacte) | R-MENS-01 à 04 |
| `heures_mensualisees(semaines, heures_hebdo_minutes)` | | heures exactes, jamais arrondies (A-03) | R-MENS-03, 04 |

Refus : A-01, A-02 (taux net), A-04 (horaires variables), A-05 (semaine partielle), A-13 (plus de 45 h), ARR-01, HORS-CCN (avant 2022).

### Heures (`heures.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `temps_de_travail_jour(debut_prevu, fin_prevue, arrivee, depart)` | minutes depuis minuit | `minutes_travaillees` | R-HC-04 |
| `heures_en_plus_semaine(contrat_min, reelles_min, taux, majoration_hm_pourcent, majoration_hc_pourcent=0, absence_dans_semaine=False)` | | minutes et montants des heures complémentaires et majorées | R-HC-01 à 03 |
| `salaire_du_mois(mensualise, montants_heures_en_plus, deduction)` | centimes | `salaire_brut_mois_centimes` | R-MENS-05 |

Refus : A-09 (absence et heures en plus la même semaine), A-13. Erreur si la majoration des heures majorées est inférieure à 10 %.

### Absences et jours fériés (`absences.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `qualifier_absence(type_absence, type_annee)` | type (liste dans la docstring) | `deductible` | R-ABS-01, 05, 06, R-MENS-08, R-CP-05, R-FIN-12, M-07, M-08 |
| `absence_enfant_malade(jours, jours_calendaires, jours_accueil, justificatif, demi_journee, cumul_glissant, cumul_anniversaire, longue_absence_anterieure)` | | `jours_deductibles` (limite de 5 jours) | R-ABS-01 à 04 |
| `deduction_absence(type_annee, mensualise, non_travaille, prevu_sans_absence, semaines_non_accueil_dans_mois=0)` | minutes (complète) ou jours (incomplète) | `deduction_centimes`, `salaire_du_centimes`, `coefficient` | R-ABS-07, 08, R-JF-05 |
| `prevu_du_mois(annee, mois, planning, type_annee, contient_semaine_non_accueil=False)` | planning {0 = lundi : minutes} | dénominateur du mois | R-ABS-07, 08, R-JF-05 |
| `ferie_chome(date, jours_travailles, presence_veille, presence_lendemain, jours_non_accueil)` | | `jours_condition`, `remuneration_maintenue` | R-JF-01, 02, 04 |
| `ferie_travaille(date)` | | toujours refus A-33 | R-JF-03, 04 |

Embauche en cours de mois (T-035a, règle R-EMB-01) : `qualifier_absence("embauche_en_cours_de_mois", ...)` est déductible ; les jours du mois avant l'embauche entrent dans la déduction de l'art. 111, comme la fin de contrat (fiches DREETS Occitanie du 19/01/2023).

Absence de l'enfant « sans solde » (T-039, règle R-ABS-01) : `qualifier_absence("enfant_sans_solde", ...)` n'est pas déductible ; salaire maintenu, avec une note (CCN art. 105 al. 1, CASF L423-20, service-public F12812). Seule exception : maladie justifiée (`absence_enfant_malade`).

Refus : A-08, A-15, A-16, A-17, A-19, A-20, A-21, A-25, A-31, A-32, A-33, R-ABS-06 (événements familiaux), M-05, M-06, R-JF-02-LIMITE, EXCLU-MATERNITE, EXCLU-AT.

### Congés payés (`conges.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `acquisition_cp(type_annee, periode_complete, mois, semaines, jours, jours_par_semaine, mois_arret_maladie, semaines_arret_maladie, accident_travail, date_fin_periode, report)` | | `jours_acquis`, `resultats_par_methode` | R-CP-01, 02 |
| `jours_enfants_a_charge(jours_acquis, age_am_au_30_avril, nombre_enfants, periode_atteint_31_mai=True)` | | `jours_supplementaires`, `total` | R-CP-03 |
| `jours_fractionnement(droits, jours_principal_pris_1er_mai_31_octobre, renonciation_ecrite=False)` | | `jours_fractionnement` | R-CP-04 |
| `decompte_jours_cp(premier_jour, jour_reprise, jours_travailles, feries_travailles=())` | dates | `jours_decomptes` | R-CP-09 |
| `indemnite_cp(jours, heures_hebdo_min, taux, salaires_periode, icp_pendant, icp_precedente, heures_conge_minutes, jours_supplementaires)` | droit annuel | `indemnite_centimes`, `methode` | R-CP-06 |
| `complement_cp_annee_complete(resultat_indemnite_cp)` | | `complement_centimes` (0 si maintien) | R-CP-07 |
| `paiement_cp_annee_incomplete(modalite, indemnite, mensualise, mois_de_paie, mois_prise_principale, prise_principale_sur_deux_mois)` | `juin` / `prise_principale` / `fur_et_a_mesure` | montant du mois | R-CP-08 |
| `indemnite_cp_prise_partielle(type_annee)` | | toujours refus A-29 ou A-30 | R-CP-07, 08 |

Méthode d'acquisition. Le moteur exige les mois et les semaines (et accepte les jours). Il calcule chaque méthode : 2,5 jours par mois ; par 4 semaines ; formule Urssaf en jours (jours × 2,5 ÷ (4 × jours par semaine)). Si les résultats diffèrent : refus A-23 (année complète) ou SUS-11 (année incomplète). Maladie non professionnelle : 2 jours par mois d'arrêt ou par 4 semaines, plafond 24 (loi, A-24 levée par la contre-vérification). Plafond total : 30.

Maintien de salaire (A-26). Deux lectures : formule Urssaf (jours ÷ 6 × heures hebdomadaires × taux) et décompte réel (heures qui auraient été travaillées pendant le congé). Elles concordent pour un nombre entier de semaines. Sinon, l'appelant doit fournir `heures_conge_minutes`, faute de quoi le moteur refuse.

Dixième. Variantes testées : indemnité de CP « versée pendant la période » ou « de l'année précédente » (A-28) ; jours supplémentaires inclus ou non (CP-SUPP). Le moteur conclut si toutes les variantes donnent le même résultat final.

### Indemnités (`indemnites.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `minimum_entretien_journalier(d, duree_minutes)` | | refus A-36 (9 h) ou A-35 (autre durée) en l'état | R-IND-01, 02 |
| `verifier_entretien_journalier(montant, d, duree_minutes)` | | `conforme` (contrôle robuste) | R-IND-02 |
| `indemnite_entretien_mois(jours, montant_horaire_contrat, d)` | jours [{duree_minutes, travail_effectif}] | `indemnite_centimes` | R-IND-02, R-ABS-10 |
| `indemnite_repas_mois(repas_fournis_par_am, montant_par_repas, repas_fournis_par_employeur=False)` | | `indemnite_centimes` | R-IND-03 |
| `indemnite_kilometrique(km, taux, d, puissance_cv, employeurs_demandeurs=1, enfants_de_cet_employeur=1, enfants_transportes=1, trajet_pour_enfants_am=False, electrique=False, vehicule_de_l_employeur=False)` | puissance administrative en CV ; `electrique=None` si inconnu | `indemnite_centimes`, `quote_part` (T-027) | R-IND-04 |
| `indemnite_kilometrique_mois(trajets, taux, puissance_cv, electrique=False)` | trajets [{date, km, employeurs_demandeurs, enfants_de_cet_employeur, enfants_transportes, trajet_pour_enfants_am}] | `indemnite_centimes` (somme exacte) | R-IND-04 |

Entretien sous le minimum (T-035a) : un jour de 9 h sous le minimum est payé au minimum de la CCN (90 % du MG au centime supérieur : 3,92 € depuis le 01/06/2026), avec `jours_sous_minimum`, `ecart_minimum` et une note ; pour une autre durée, refus ENTRETIEN-SOUS-MINIMUM gardé (A-35).

Refus : A-35, A-36, A-38, ENTRETIEN-SOUS-MINIMUM (hors 9 h), KM-SOUS-PLANCHER, KM-SUR-PLAFOND, KM-PARTAGE-AM, KM-ELECTRIQUE-INCONNU, BAREME-ABSENT. Plafond : barème fiscal (CGI ann. IV art. 6 B), résultat « provisoire » pour les trajets de 2026 et après (voir T-027.md).

### Événements familiaux (`evenements.py`, T-027)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `conge_evenement_familial(evenement, date_evenement, deplacement_plus_600km=False, pathologie_ou_cancer=False)` | événement parmi `EVENEMENTS` | `jours_ouvrables_remuneres`, `jours_ouvrables_non_remuneres` | R-ABS-06 (CCN 48.1.3.1.1 à 3, C. trav. L3142-4) |
| `jours_conge_evenement(evenement, date_evenement, premier_jour, dernier_jour, ...)` | congé d'un seul tenant | statut de chaque jour : `remunere`, `non_remunere`, `hors_droit`, `non_ouvrable` | R-ABS-06 |

Refus : M-06 (congé de deuil), EVT-OUVRES-2021, EVT-VERSION, EVT-FERIE, HORS-CCN.

### Fin de contrat (`fin_contrat.py`)

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `duree_preavis(auteur, debut_accueil, date_envoi, date_premiere_presentation, motif)` | auteur `employeur` / `am` | `preavis` : None, {jours: 8 ou 15} ou {mois: 1} ; démission de 3 mois à 1 an : refus PREAVIS-DEMISSION-3-12 ; ancienneté à la date d'envoi (CCN 120) | R-FIN-02 corrigée (T-027), R-FIN-03 |
| `indemnite_compensatrice_preavis(type_annee, mois)` | liste de mois | `indemnite_centimes` | R-FIN-05 |
| `jours_a_indemniser(jours_acquis, jours_deja_payes)` | | `jours` | R-FIN-10 |
| `iccp(type_annee, motif, periodes, heures_hebdo_min, taux)` | périodes (plus ancienne d'abord) ; dernière période : `regularisation_due_centimes`, `regularisation_a_confirmer` | `iccp_centimes`, détail | R-FIN-09, 10, R-CP-06 |
| `indemnite_rupture(motif, auteur, debut_accueil, date_reference, salaires_bruts, iccp, icp, preavis, regularisation, sommes_a_confirmer)` | | `indemnite_centimes` (1/80), `assiette_centimes` | R-FIN-06, 07, 08 |
| `regularisation_annuelle(type_annee, mensualises_verses, taux, heures_effectuees_min, composantes)` | | `ecart_centimes`, paiement 0 | R-MENS-06 |
| `regularisation_finale(type_annee, ecarts_annuels_signes, mensualises_verses, taux, heures_effectuees_min, composantes)` | | `solde_centimes`, `versement_centimes` (au profit de l'AM seulement) | R-FIN-11 |
| `indemnite_precarite_cdd(remuneration_totale, exclusion=None)` | | `indemnite_centimes` (10 %) | R-FIN-13 corrigée |
| `solde_de_tout_compte(elements)` | [(libellé, valeur, nature)] | totaux | R-FIN-15 |

`composantes` de la régularisation : pour `feries_chomes_payes`, `absences_remunerees`, `heures_complementaires`, donner `{"minutes": entier ou None (inconnu), "incluses": True/False}` (comptées ou non dans `heures_effectuees_minutes`). Si l'une change le résultat : refus A-06. Le moteur conclut « rien n'est dû par l'AM » quand le solde est défavorable à l'AM dans toutes les lectures.

Choix signalés à la direction :
- R-FIN-09 est « douteuse » dans la contre-vérification pour la seule exclusion en cas de faute lourde. Le moteur refuse la faute lourde (A-49) et calcule l'ICCP dans les autres cas (CCN art. 67, confirmé).
- A-27 (CASF : dixième seul ; CCN : comparaison) ne bloque pas : le résultat de la CCN est toujours au moins égal à celui du CASF.
- A-44 (formulation du CASF L423-24) ne bloque pas : le montant de l'indemnité de préavis suit la CCN (art. 64.2 et 122), confirmée.
- R-CP-03 « acquis au 31 mai » : aucun jour pour enfant à charge si la période s'arrête avant le 31 mai.
- Régularisation finale « seulement au profit de l'AM » : consigne de la mission (A-07).

T-050b (MB6, 21/11/2026), d'après regles/t050-trois-regles.md, points 2 et 3 :
- Assiette du 1/80 (A-45). CCN art. 121.1 : « total des salaires bruts perçus pendant la durée du contrat », seule exclusion « les indemnités non soumises à contributions et cotisations sociales ». L'ICCP (ICCP : indemnité compensatrice de congés payés, les deux périodes), les CP (congés payés) payés pendant le contrat et la régularisation définitive (art. 124) sont des salaires bruts : ils entrent dans l'assiette. Contrôle : 11 662,78 € (Durand) et 9 148,57 € (Bertrand), fiches DDETS 31 du 19/01/2023. Bertrand donne 114,36 € au centime le plus proche ; la fiche écrit 114,35 € (troncature, SUS-01).
- Dixième de la dernière période (A-50). La régularisation due à l'AM entre dans la base (CCN art. 123.2, 48.1.1.5, 48.1.1.1, 124 ; CASF L423-6). Elle n'est plus testée « avec et sans ». Un solde en faveur de l'employeur compte pour 0 : il ne se retire pas de la base. Contrôle : Bertrand, 2e période, 308,57 € (base sans ICCP précédente) ; la fiche retient 348,57 € avec l'ICCP précédente.
- Refus gardés : indemnité de préavis dans l'assiette du 1/80 (A-45, art. 64.2 non relu, point rouvert par la direction) ; régularisation négative dans le 1/80 (A-45, aucun texte lu) ; ICCP de la période précédente dans le dixième (A-50, SUS-04 toujours ouvert) ; jours déjà payés sur une période (A-50) ; ICCP ou régularisation non calculée (ASSIETTE-A-CONFIRMER : jamais une assiette incomplète en silence).

T-072 (22/11/2026), voir calculateur-arvela/rapports/T-072-moteur-b.md :
- `dates_fin_preavis_possibles(date_premiere_presentation, preavis)` : les deux lectures du dernier jour (jour de départ compté ou non ; CCN 64.1, 120 ; PREAVIS-DATE-FIN reste ouvert).
- `indemnite_rupture_bulletins(motif, auteur, debut, date_reference, variantes, total_bulletins_centimes, total_jusqua, bruts_lus_centimes)` : 1/80 (CCN 121.1) quand le total des bulletins ou des bruts lus sont saisis. Les montants saisis font foi pour leurs mois. Dernier mois couvert : ICCP, régularisation et préavis sont sur ce dernier bulletin (art. 67, 123, 124), rien n'est ajouté ; régularisation inconnue → ASSIETTE-A-CONFIRMER ; régularisation négative ou préavis non nul → A-45. Dernier mois non couvert : salaires des mois non couverts, ICCP et régularisation ajoutés, toute somme inconnue → ASSIETTE-A-CONFIRMER. Une variante par date de fin possible ; assiettes différentes → FIN-DATE-A-CONFIRMER.
- `conges_apres_changement_type(types_periode_acquisition, type_annee_prise)` : jours acquis sous un type d'année et pris sous l'autre après un avenant → AVENANT-CP-A-CONFIRMER (CCN 102.1.2.1, 102.1.2.2, 48.1.1.5 muets) ; ni payé ni retenu.
- `verifier_date_effet_avenant(date_effet)` : avenant au 1er du mois seulement, sinon AVENANT-EN-COURS-DE-MOIS (CCN 109.1).
- `tests/test_t072.py` : 23 tests.

Décès de l'enfant (T-035a) : indemnité au 1/80 due quelle que soit l'ancienneté (CCN 119.4.2, service-public F16842) ; A-47 levée.

Refus : A-02, A-06, A-19, A-21, PREAVIS-DEMISSION-3-12, A-45, ASSIETTE-A-CONFIRMER, FIN-DATE-A-CONFIRMER, AVENANT-CP-A-CONFIRMER, AVENANT-EN-COURS-DE-MOIS, A-48, A-49, A-50, A-26, A-28, LIMITE-ANCIENNETE, DATE-MOIS, EXCLU-INAPTITUDE, EXCLU-RETRAITE, EXCLU-DECES-PARTIE, EXCLU-CDD-ANTICIPE, EXCLU-SAISONNIER. La date de fin du préavis n'est pas calculée (méthode non écrite, R-FIN-03).

### Périmètre et net (`perimetre.py`)

| Fonction | Sortie | Règles |
|---|---|---|
| `verifier_perimetre(departement, accueil, semaines_alternees, type_contrat, cdd_remplacement, majoration_difficultes_enfant)` | `dans_perimetre` ou refus | hors périmètre, R-MENS-10, R-SAL-07 |
| `convertir_brut_net(montant)` | toujours refus A-34 | R-PAJ-04, M-01, M-02 |

### Régions (`regions.py`, T-077, MB7)

Spécification : `regles/t077-decisions.md` (R0 à R4) du dépôt calculateur-arvela ; rapport `T-077-MB.md`.

| Fonction | Entrées | Sortie | Règles |
|---|---|---|---|
| `brut_depuis_net(net, d, region)` | net en centimes, mois de salaire | `brut_estime_centimes` (estimation, part 7 810 ; Alsace-Moselle 7 660 jusqu'à mars 2022 puis 7 680 ; Mayotte 8 820) | T077-R1 |
| `repere_net_minimum(d, region)` | date | `repere_net_centimes` (Urssaf) ; avant 2025 : REPERE-NET-ABSENT | T077-R2 |
| `feries_locaux(annee, region)` | | {date: nom} : 26/12 et Vendredi saint ; 27/04 à Mayotte | T077-R3 |
| `ferie_local_travaille(d, region, minutes, taux)` | | toujours refus A77-FERIE-LOCAL-TRAVAILLE, majoration de la lecture A dans `details` | T077-R3 |

Paramètre `region` (défaut « metropole ») ajouté à `minimum_horaire_brut`, `verifier_taux_horaire`, `baremes_du_jour` (SMIC de Mayotte), `ferie_chome` (A77-FERIE-LOCAL, A77-FERIE-VOISIN), `decompte_jours_cp` (A77-DECOMPTE-CP), `qualifier_absence` (A77-MAINTIEN-LOCAL). `verifier_perimetre` accepte 57, 67, 68 et 976 et renvoie `region`.

## Non couvert par la version 0

Engagement réciproque rompu avant l'embauche (R-ESS-04), durée de la période d'essai (R-ESS-02), déclaration Pajemploi (R-PAJ-01 à 10 : heures et jours déclarés, arrondis A-03), cotisations, CMG, frais de transport (R-IND-05), contrôle des durées maximales avec plusieurs employeurs (R-HC-01).

## Fichiers

- `moteur_b/` : code (commun, baremes, calendrier, mensualisation, heures, absences, conges, indemnites, fin_contrat, perimetre).
- `tests/test_cas_officiels.py` : 80 tests tirés des cas officiels.
- `tests/test_refus.py` : 50 tests des refus (sans montant attendu).
- `tests/test_t050b.py` : 14 tests (assiette du 1/80, régularisation dans le dixième de fin), attendus tirés des fiches DDETS 31 (T-050b).
- `tests/test_t027.py` : 29 tests (kilomètres, événements familiaux, préavis), attendus tirés des textes.
- `tests/test_t039.py` : 5 tests (absence de l'enfant « sans solde »), attendus tirés des textes (T-039-MB4.md).
- `tests/test_t077.py` : 25 tests (régions : R1 à R4), attendus chiffrés à la main depuis les textes (T-077-MB.md).
- `tests/test_t035.py` : 9 tests (embauche en cours de mois, décès de l'enfant, entretien sous le minimum), attendus tirés des textes (T-035-MB3.md).
- `ECARTS.md` : cas officiels non passés et leur cause.

## T-076 (22/11/2026, passage 1) : planning variable et CDD

D'après regles/t076-planning-variable.md, regles/t076-cdd.md et regles/t076-decisions-direction.md (sections 1 et 2). Point à confirmer : la fonction donne les deux lectures ; part sûre = la plus petite ; à confirmer = l'écart.

| Fonction (`planning_variable.py`) | Règles |
|---|---|
| `semaine_prevue(lundi, cycle, cycle_ancre, plannings_semaines)` | R-PV-02, P-PV-4 (Q1) ; refus PV-SEMAINE-SANS-PLANNING, PV-SEMAINE-PREVUE-PLUS-45H |
| `mensualisation_planning_variable(semaines, heures_mensualisees, taux, cycle, plannings_semaines)` | R-PV-03 (D423-5 14°), P-PV-1 : lecture L1 ou L2, base B |
| `heures_en_plus_semaine_planning_variable(lecture, prevu, base, reelles, taux, maj_hm, maj_hc, absence)` | R-PV-04, R-PV-05 (CCN 96.4, 110.1) |
| `mois_de_rattachement_semaine(lundi)` | E-PV-02 (source secondaire ; A-11) |
| `prevu_du_mois_planning_variable(annee, mois, plannings_par_lundi, type_annee)` | R-PV-08 (CCN 111) |
| `ferie_chome_planning_variable(date, jours_prevus, ...)` | R-PV-12, lecture F1 (CCN 47.1, 47.2) |
| `decompte_jours_cp_planning_variable(du, reprise, jours_prevus)` | R-PV-09 (CCN 48.1.1.3) |
| `indemnite_cp_planning_variable(jours, taux, h_periode, n_semaines, h_conges, salaires, icp...)` | R-PV-10, P-PV-5 (C1, C2) |
| `complement_cp_planning_variable(resultat)` | R-CP-07 ; refus A-29, P-PV-5 |

| Fonction (`cdd.py`) | Règles |
|---|---|
| `mensualisation_cdd(heures_hebdo, taux)` | R-CDD-04 (CCN 108.1, 109.1, L1242-14) |
| `cdd_moins_d_un_mois(debut, terme)`, `salaire_mois_cdd_moins_d_un_mois(...)` | P1 |
| `qualifier_semaine_sans_accueil_cdd(lecture)`, `deux_lectures_cdd(l1, l2, point)` | P2 |
| `assiette_ifc(salaires, cp, regularisation, autres)` | R-CDD-07 (L1243-8, L3221-3) |
| `ifc_due(fin_cdd)`, `indemnite_fin_cdd(brut, fin_cdd, iccp)` | R-CDD-08, R-CDD-07, P4 |
| `iccp_cdd(fin_cdd, periodes, ifc, brut, heures_hebdo, taux)` | R-CDD-10 (L1242-16, CCN 48.1.1.5), P3 |
| `preavis_et_rupture_cdd(fin_cdd)` | R-CDD-06 (L1243-5) |

Gardés tels quels (tests existants) : `mensualisation(horaires_variables=True)` refuse A-04 et `verifier_perimetre(type_contrat="CDD", cdd_remplacement=True)` refuse R-MENS-10 ; les nouvelles fonctions ci-dessus sont le chemin T-076. Tests : `tests/test_t076.py` (31 tests, dont E-PV-02, E-PV-03, E-CDD-01, E-CDD-02).

Corrections après vérification (T-076, décisions D1 à D11 de regles/t076-decisions-direction.md, section 4) :
- `heures_en_plus_semaine_planning_variable` : D1 (1er mai chômé compté ; autre jour payé non travaillé en deux lectures), D2 (refus PV-L2-ABSENCE-HC), D4 (base entière ou au prorata), `lectures_montant_complementaires`.
- `iccp_planning_variable` (R-PV-13, P-PV-5 lecture C1) ; `indemnite_cp_planning_variable(..., jours_supplementaires)` : refus CP-SUPP.
- `solde_fin_cdd` (D11, D8), `controle_dates_cdd` (D9), `verifier_cas_cdd` (D3) ; `iccp_cdd` : part sûre sur deux périodes (D10), CP-SUPP.

## T-103 (24/11/2026) : règles du tableau validé par le DG

Spécification : calculateur-arvela, rapports/T-103-inventaire.md (validé le 24/11/2026). Rapport : calculateur-arvela, rapports/T-103-moteur-b.md. Tests : `tests/test_t103.py`. Les sections plus haut restent l'historique ; en cas de conflit, cette section l'emporte.

- M1 à M3 (entretien, `indemnites.py`) : durée du jour = temps de travail de l'art. 99 (`duree_travail_art99`) ; refus ENTRETIEN-DUREE-ACCUEIL-OU-TRAVAIL levé. `indemnite_entretien_mois(jours, None, d, montant_journalier_contrat_centimes=...)` : contrat « montant fixe par journée », dû par journée de travail effectif (jour hors planning compris), au moins le minimum de 114.1 sur la durée du travail.
- F1, F8 (`fin_contrat.py`) : `date_fin_preavis(presentation, preavis)` (F1 corrigé après la porte-vérité : jour de présentation = 1er jour ; jours : présentation + n − 1 ; mois : veille du même quantième, fiche officielle F2883 ; départ après le 28 en mois : DATE-MOIS gardé ; pas de report) ; `duree_preavis` rend aussi `date_fin_preavis` ; `dates_fin_preavis_possibles` ne rend plus qu'une date ; `periode_indemnite_deces(date_deces, preavis)` (du lendemain du décès, CCN 119.4.2). Refus PREAVIS-DATE-FIN levé.
- F2 : démission de 3 mois à 1 an : 15 jours (refus PREAVIS-DEMISSION-3-12 levé). F3 : 9 mois appréciés à `date_fin_contrat` (refus D-1 levé). F4 : indemnité de préavis dans l'assiette du 1/80 (A-45 ne reste que pour une régularisation négative). F5 : mois mixte à la proportion de l'art. 111 (P-1 levé, sauf semaine sans accueil dans la dispense). F6 : régularisation en lecture (a) (D-2 levé). F7 : ICCP de la période précédente dans la base du dixième (A-50 levé pour elle) ; base du dixième avec l'ICP versée pendant la période (CCN 48.1.1.5), CASF L423-6 en plancher (A-28 seulement s'il dépasse).
- F9 à F12 (`cdd.py`) : ICCP du CDD = plus haut du maintien et du dixième ; IFC sans l'ICCP ; CDD de moins d'un mois mensualisé ; mode 46 semaines. Les fonctions gardent leurs clés `lectures` (égales) pour les appels existants.
- H7 (adaptateur) : absence pendant un préavis dispensé : jour toujours « dispensé ».
- C1 à C5 (`absences.py`) : `absences_enfant_malade_art105(debut, certificats, jours_absence, deja_retenus, date_debut_suivi)` : certificat de 14 jours calendaires ou plus = absence longue (14 premiers jours non payés) ; sinon courtes absences (5 jours par période de 12 mois, chaque jour dans sa période) ; refus C3-DATES-CERTIFICAT, C5-ORIGINE-MANQUANTE, A-18 (deuxième absence longue), A-15 (demi-journée). L'ancienne `absence_enfant_malade` reste pour ses tests.
- C6 à C9 (`evenements.py`) : version nouvelle de 48.1.3.1.1 au 01/05/2024 ; férié pendant le congé non compté (statut « ferie ») ; `jour_repos_hebdomadaire` (refus C8-REPOS-HEBDO-MANQUANT si le planning prévoit le dimanche) ; `conge_deuil(date, ij)` (8 jours, IJ déduites ; refus C9-IJ-MANQUANTES) ; M-06 et EVT-FERIE levés.
- C10, C11 (`conges.py`) : `acquisition_cp_periode(type_annee, debut, fin, jours_non_assimiles, jours_arret_maladie, semaines_sans_accueil, semaines_cp_am)` : 2,5 × (mois complets + semaines / 4 + jours / 24), entier supérieur (Cass. soc. 10/01/1980 ; CCN 48.1.1.2). Réserve de B sur C11 : les semaines sans accueil qui sont des CP de l'AM sont assimilées (L3141-5 1°, CCN 48.1.1.3, 97.1) : `semaines_cp_am` obligatoire s'il y a des semaines sans accueil (refus C11-SEMAINES-CP-AM). `acquisition_cp` (ancienne) reste pour ses tests.
- C12 : `indemnite_cp(..., type_annee="incomplete")` et `iccp` en année incomplète : maintien = jours ÷ 6 × heures hebdomadaires × taux (A-26 levé en 46 semaines ; gardé en 52 semaines). C13 : `indemnite_cp_planning_variable` et `iccp_planning_variable` : lecture C1 seule (PV-C2-DROIT-NON-PRIS et P-PV-5 levés).
- C15 à C17 : `decompte_jours_cp(..., jours_arret_maladie, date_fin_contrat)` ; `absence_retenue_du_jour(types)` (arrêt maladie l'emporte sur le CP ; autre double saisie : refus C17-SAISIE-CONTRADICTOIRE).
