# Simulateur d'accueil : règles appliquées (vérifiées le 1er novembre 2026, étape 1 de la refonte)

Chaque règle vient d'un texte officiel. « Secondaire » signale un chiffre confirmé par une source non officielle et par le calcul, la page Urssaf d'origine étant illisible par les outils.

## Aide de la CAF : CMG « emploi direct » d'une assistante maternelle

Textes : articles D531-17 et D531-18 du Code de la sécurité sociale, rédaction du décret n° 2025-515 du 30 mai 2025, en vigueur pour les gardes depuis le 1er septembre 2025 (Légifrance, en vigueur au 1er novembre 2026). Aucun décret 2026 ne modifie la formule.

Formule (D531-18) : CMG = coût mensuel × (1 − revenus mensuels × taux d'effort ÷ coût horaire de référence), jamais négatif.

- Coût mensuel C : salaire net + indemnités d'entretien + frais de repas (D531-18 1°). Il est retenu dans la limite du plafond horaire × heures payées.
- Plafond horaire : 8,00 € (décret), 8,09 € depuis le 1er avril 2026 (revalorisation SMIC ; secondaire : Weblex 30/03/2026 citant l'Urssaf du 24/03/2026, et 8 × 12,02 / 11,88 = 8,09).
- Coût horaire de référence : 4,85 € (décret), 4,91 € depuis le 1er avril 2026 (mêmes sources ; 4,85 × 12,02 / 11,88 = 4,91).
- Revenus : ressources mensuelles connues de la CAF (revenus nets catégoriels de l'année N-2, art. R532-1 à R532-7, en pratique le revenu imposable ÷ 12), arrondies à l'euro, bornées entre un plancher (815 € en 2025 ; 821 € depuis avril 2026 par le calcul RSA, non publié officiellement) et un plafond de 8 500 €.
- Taux d'effort (assistante maternelle) : 1 enfant à charge 0,0619 % ; 2 : 0,0516 % ; 3 : 0,0413 % ; 4 à 7 : 0,0310 % ; 8 à 10 : 0,0206 %. Chaque enfant ouvrant droit à l'AEEH fait passer au taux immédiatement inférieur.
- Plus de majoration pour parent seul ni pour l'AAH (intégrées dans la formule). Enfant de 3 à 6 ans : même calcul qu'avant 3 ans (plus de division par deux). Parent seul : CMG ouvert jusqu'aux 12 ans de l'enfant (FAQ CAF, service-public F39152, communiqué Cnaf du 14/10/2025).
- Condition d'activité des parents, avec exceptions (études, AAH, RSA, ASS…) : rappelée à l'écran, non vérifiée par le simulateur.
- Plus de minimum de 15 % à la charge de la famille.
- Cotisations : prises en charge à 100 % si le coût horaire par enfant (net + entretien + repas) ne dépasse pas le plafond horaire ; au-delà, prise en charge × plafond × heures ÷ coût (D531-17 I), rapport arrondi au centième supérieur (mesuré sur le simulateur Urssaf : 0,95, 0,84, 0,79, 0,68 sur quatre cas). L'ancienne condition de 5 SMIC par jour est supprimée.
- Sans CMG (enfant de 6 à 12 ans d'un couple), toutes les cotisations restent à la famille.

Tests : les 4 exemples chiffrés du communiqué de presse CAF du 15/09/2025 (coût de référence 4,85 €) et l'exemple « ressources au-dessus du plafond » du webinaire CAF de septembre 2025.

## Crédit d'impôt pour frais de garde hors du domicile (CGI art. 200 quater B)

- 50 % des dépenses, dans la limite de 3 500 € par enfant et par an (crédit maximal 1 750 €), enfant de moins de 6 ans au 1er janvier de l'année.
- Dépenses retenues pour une assistante maternelle : salaire net + cotisations restées à la charge du parent + 2,65 € par jour de garde (forfait d'entretien) ; les repas et les indemnités kilométriques sont exclus ; le CMG est déduit, ainsi que les aides de l'employeur, de la commune et les CESU préfinancés (BOFiP BOI-IR-RICI-300-20230626 §135, §140, §150 ; brochure IR 2026).
- Garde alternée : plafond divisé par deux (1 750 € de dépenses, 875 € de crédit).
- Avance immédiate pour les assistantes maternelles : au plus tard le 1er septembre 2027 (LFSS 2026, art. 7), modalités non publiées.
- Avance de 60 % en janvier sur la base de l'année précédente ; solde l'été.

## Assistante maternelle (au 1er juin 2026)

- Salaire minimum conventionnel : 4,20 € brut par heure et par enfant (4,37 € avec le titre AM-AP), soit 3,28 € net (avenant n° 10 du 5 février 2026, étendu le 4 mai 2026 ; fiche DREETS Pays de la Loire du 12/06/2026).
- Le simulateur se saisit en brut (unité de la convention et du contrat) ; le net horaire est arrondi au centime.
- Cotisations salariales : 21,88025 % du brut (23,18025 % en Alsace-Moselle) ; net = 78,12 % du brut.
- Cotisations patronales : 43,547 % du brut, plus 5,00 € fixes par mois. Mesurées le 1er novembre 2026 sur le simulateur officiel Urssaf (api.urssaf.fr/paje/anss/v1/simulateur/calculerResteACharge) : total = 83,75 % du net + 5 € (86,86 % en Alsace-Moselle), à 3 centimes près.
- Réduction de cotisations salariales des heures majorées : 11,31 % de leur brut (CSS L241-17, décret 2019-40), versée à l'AM en plus du net.
- Durée : 13 h par jour au plus (11 h de repos, CASF L423-21) ; au-delà de 48 h par semaine en moyenne, accord écrit de l'AM, dans la limite de 2 250 h par an tous contrats confondus (CASF L423-22).
- Indemnité d'entretien : 90 % du minimum garanti (4,35 €) pour 9 h, soit 3,92 €, et jamais moins de 2,65 € par jour (CCN art. 114-1).
- Mensualisation (CCN art. 109.2) : heures hebdomadaires × semaines ÷ 12 ; en année incomplète (46 semaines au plus), les congés payés s'ajoutent au salaire mensualisé (environ 10 % du brut de l'année).

## Choix de calcul du simulateur

- Moyenne mensuelle sur l'année : en année incomplète, les congés payés (≈ 10 % du salaire) sont répartis sur 12 mois dans le coût, l'aide de la CAF et le crédit d'impôt ; l'écran rappelle qu'ils sont réellement versés en juin, au congé principal ou au fil des congés.
- Entretien, repas et forfait de 2,65 € du crédit d'impôt : comptés sur les jours d'accueil réels (année complète : 47 semaines, les 5 semaines de congés de l'assistante maternelle étant payées sans accueil).
- Heures par semaine ramenées au maximum du planning : 13 h par jour et 2 250 h ÷ semaines travaillées (47 en année complète), au quart d'heure inférieur.
- Le coût aidé par le CMG est le net déclaré (hors réduction des heures majorées).

Relecture indépendante du 1er novembre 2026 : 14 remarques, toutes traitées (formule et paramètres du CMG confirmés ; corrections sur les jours d'accueil, les congés payés en année incomplète, les libellés des revenus et de la part horaire, le calendrier du crédit d'impôt, les liens partagés modifiés).

## Validation contre le simulateur officiel (1er novembre 2026)

Cinq cas passés au simulateur Urssaf avec les montants produits par notre moteur : CMG et reste à charge identiques au centime ; cotisations à 3 centimes près. Détail dans tests/simulation.test.ts.

## Points ouverts

- Plancher de ressources 2026 (815 ou 821 €) : sans effet au-dessus de 821 € de revenus mensuels.
- Heures majorées : le texte parle d'« heures rémunérées » ; le simulateur compte chaque heure une fois.
- Congés payés en année incomplète : encore répartis sur 12 mois (interdit par la convention, versés en juin, au congé principal ou au fil des congés) ; corrigé à l'étape 4.
- Congés payés et CMG : depuis janvier 2026 (LFSS 2026), ils ne comptent plus pour le test du plafond horaire ; leur place dans le coût aidé n'est pas documentée.
- Réduction des heures majorées : traitement exact dans le coût aidé par le CMG non documenté (le simulateur Urssaf ne la calcule pas).
