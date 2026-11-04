# Registre de suivi de l'audit indépendant (commit audité 1aa16c1, 30 octobre 2026)

Ce registre suit les 89 lignes du tableau final de l'audit. Aucune ligne ne disparaît sans décision écrite.
Toute session qui corrige un constat met à jour sa ligne ici, dans le même commit, avec la preuve.

Statuts : **Corrigé** (code changé, preuve citée) · **Partiel** (ce qui reste est écrit) · **Prouvé conforme** · **Ouvert, pendant le test** · **Ouvert, avant phase 2** · **Phase 3** · **Action YKM** (hors code : console, compte, décision).

Corrections du 31 octobre 2026 : branche `corrections-audit`, commits 3c69189 (mesure d'usage), e484457 (paie), 3e609d4 (textes), 3bb903e et suivants (exploitation), b7e1519 (contrôle des fuites), puis corrections de la relecture contradictoire de la paie.

Relecture contradictoire du 31/10/2026 (relecteur indépendant, sans accès au raisonnement de l'auteur) : C-001, C-002, C-004 et C-006 confirmés dans leur principe ; défauts trouvés et corrigés le jour même : diviseur de l'art. 111 complet (congés payés et semaines sans accueil compris), congés pris avant le début du suivi imputés deux fois (bug A), solde fractionnaire tronqué, régularisation valorisée au taux final, semaines sans accueil d'avenant ignorées (bug C), contrat ancien bloqué (bug D), bascule en année complète bloquée (bug E), renvoi à un « article 124 » (la régularisation relève de l'art. 109.2). Tests « relecture contradictoire » dans tests/payroll.test.ts.

Seconde relecture contradictoire du 31/10/2026 (commit 70f70c4) : réponse « oui » à la question « les montants de novembre 2026 à janvier 2027 sont-ils justes pour un contrat en année complète sans avenant suivi depuis le 1er novembre ? », à condition que le solde de congés de départ soit exact ; 500 contrats aléatoires sans incohérence ; quatre derniers points corrigés (compteur de congés fractionnaire, semaines sans accueil d'avenant dans la paie, blocage de la régularisation quand aucune semaine n'est saisie pour la dernière année, libellé « planning type (art. 111) » sur l'écran Mois).

Contrôle indépendant des fuites du 31/10/2026 (Chrome, faux serveur PostHog) : deux défauts trouvés et corrigés (envois repris après extinction, identifiant de contrat dans les adresses) ; parcours rejoué.

Constat hors audit du 02/11/2026, seuil des 45 h (heures majorées) : **Corrigé**. Le calcul comptait dans les 45 h les heures prévues de toutes les absences, ce qui majorait à tort des heures en plus. Règle appliquée (fonction `minutesSeuil45`, src/engine/payroll.ts) : comptent les jours d'accueil, les absences de l'enfant payées (art. 99 : le travail commence et finit aux heures prévues) et les congés payés de l'AM (Cass. soc. 10 sept. 2025, n° 23-14.455) ; ne comptent pas les jours retenus, les autres absences de l'AM et les fériés chômés (art. 96-4 « heures de travail effectuées », art. 47 ; Cass. soc. 1er déc. 2004 et 4 avr. 2012). Les heures en plus sous le seuil restent payées au taux du contrat. Tests « seuil des 45 h » dans tests/payroll.test.ts : 4 des 8 échouent sur l'ancien code, tous passent sur le nouveau.

## Les 12 lignes « bloquant installation »

| Constat | Statut | Preuve |
|---|---|---|
| C-001 Régularisation à chaque avenant | Corrigé | Option A : régularisation en fin de contrat ou au passage incomplète → complète, chaque heure valorisée au taux de son jour (art. 109.2). Confirmé par la fiche régularisation DDETS 31 (05/11/2024) et le guide DREETS Bourgogne-Franche-Comté (août 2026) : régularisations annuelles prévisionnelles qui « se compensent » sans règlement, paiement en fin de contrat. Tests « audit C-001 » dans tests/payroll.test.ts |
| C-002 Année incomplète sans semaines sans accueil | Corrigé | Régularisation non calculée et alerte tant qu'une année de contrat terminée n'a pas ses 52 − N semaines (contrat et avenants réunis) ; bandeau dans le formulaire sans blocage, car l'art. 98.1.2 permet de les communiquer plus tard ; dernière année : alerte de vérification. Tests « C-002 », « bug C », « bug D », « bug E » |
| C-004 Congés pris sans droits jamais retenus | Corrigé | Année complète : jours au-delà des droits retenus comme sans solde, droits consommés dans l'ordre chronologique, enfants à charge comptés. Règle confirmée par les fiches DREETS Occitanie (52 semaines) et Bourgogne-Franche-Comté (août 2026) et par l'art. 109.1. Congés pris avant le début du suivi non imputés sur le solde de départ ; solde fractionnaire arrondi au supérieur. Tests « C-004 », « bug A », « solde fractionnaire ». **L'ordre chronologique est une convention de l'app : à faire valider (cas 38)** |
| C-006 Diviseur des retenues incomplet | Corrigé | Diviseur de l'art. 111 : planning type du mois entier, absences, congés payés, semaines sans accueil et fériés chômés compris (texte de l'art. 111 ; fiches DREETS Occitanie et DDETS 31). Tests « C-006 » et « art. 111 » (novembre 2026 : 189 h ; octobre avec congés : 31,02 € ; août incomplet : 575,00 €) |
| C-030 Soins en clair vers PostHog | Corrigé | Plus d'enregistrement d'écran ni de capture automatique ; carnet masqué ; aria-label sans le texte saisi. Test tests/analytics.test.ts. Parcours piégé dans Chrome contre un faux serveur PostHog (contrôle indépendant du 31/10/2026) : sans accord 0 requête ; avec accord, aucune donnée saisie ni identifiant de contrat ; après extinction, plus aucun envoi ; démonstration 0 requête |
| C-031 Corps des requêtes capturables | Corrigé | `recordBody`/`recordHeaders` forcés à faux, enregistrement coupé côté client, pseudonymisation sans limite de profondeur. Test analytics |
| C-032 / C-150 Mesure sans consentement | Corrigé, changé le 04/11/2026 | D'abord option B (accord explicite). Le 04/11/2026, décision de YKM : mesure active par défaut, opposition en un geste dans Réglages, sur le fondement de l'exemption de consentement de la CNIL pour la mesure d'audience (pages CNIL du 04/07/2025 et FAQ du 29/04/2026). Conditions tenues et testées (tests/analytics.test.ts) : aucun profil de personne (`person_profiles: 'never'`), aucune propriété de personne, adresse IP retirée (réglage du projet et `before_send`), pas de géolocalisation (`$geoip_disable`), identifiant renouvelé au plus tard après 13 mois sans prolongation, événements gardés 1 an (25 mois au plus), jamais en démonstration ; côté projet PostHog, enregistrement d'écran, capture automatique, erreurs, journaux, performances, cartes de chaleur et sondages coupés le 04/11/2026. Une utilisatrice qui avait éteint la mesure reste refusée. Jamais pour les visiteurs du site, le simulateur avant inscription ni la page des parents : seules les utilisatrices inscrites, qui ont accès à Réglages, sont mesurées (relecture du 04/11/2026). Les données sont pseudonymes, pas anonymes : le mot « anonyme » est retiré des textes. Information une fois dans l'app, dans Réglages et dans la politique. Reste à faire valider : le recours à l'exemption pour un outil tiers (PostHog) ; l'analyse hebdomadaire par Claude ne doit lire que des statistiques agrégées, jamais des événements individuels |
| C-151 Mentions légales et contact | Partiel | Page Mentions légales (éditeur YKM non professionnel, hébergeurs, contact@arvela.fr, conditions du test). **Action YKM : créer l'adresse contact@arvela.fr (redirection OVH)**. Contrat de sous-traitance article 28 complet : avant phase 2 |
| C-153 Politique et message aux parents inexacts | Corrigé | Politique réécrite (5 points), message aux parents devenu demande d'accord écrit pour le carnet |
| C-110 GitHub Pages encore en ligne | Corrigé à la publication | Workflow : page de redirection vers arvela.fr + service worker qui se désinscrit. Option YKM : désactiver Pages dans GitHub > Settings > Pages |
| C-120 Aucun avertissement de responsabilité | Corrigé | Conditions du test (Mentions légales), avertissement sur l'écran Mois et dans le message au parent |
| Règles Firestore non exécutées (section 7.1) | Prouvé conforme | `tests/rules/rules.test.mjs`, 27 cas sur 27 sur l'émulateur Firestore (GitHub Actions, workflow Vérifier, 31/10/2026) ; la publication est bloquée si un cas échoue |
| Validation humaine des 10 cas de l'annexe C | **Action YKM** | Gestionnaire de paie ou relais petite enfance. Ajouter les 7 points du relecteur : diviseur de l'art. 111 complet, fériés chômés payés comptés comme heures dues, prorata d'entrée et de sortie avec un férié hors période, ordre chronologique des droits à congés et demi-journées, valorisation de la régularisation au taux de chaque période, saisie des semaines sans accueil (art. 98.1.2), enfants à charge appréciés globalement et non au 30 avril. L'annexe C n'a pas été fournie : les cas sont listés dans l'audit (5, 7, 12, 19, 23, 27, 31, 38, 44, 51) |

## Toutes les lignes

| Constat | Gravité | Statut | Note |
|---|---|---|---|
| C-001 | Critique | Corrigé | voir plus haut |
| C-002 | Critique | Corrigé | voir plus haut |
| C-003 | Élevé | Corrigé | Avenant en cours de mois : chaque période reçoit sa part des jours mensualisés de ses propres conditions (jours prévus de la période ÷ jours prévus du mois), somme arrondie une fois, à l'entier supérieur comme la règle Pajemploi des jours mensualisés (relecture indépendante du 04/11/2026 ; arrondi au plus proche avant) ; jours retenus déduits ; entrée ou sortie dans le mois : jours réellement prévus, inchangé (`computeRange`, `mergeParts`, src/engine/payroll.ts). Avenant de taux seul : 22 jours en novembre 2026 avec ou sans avenant (avant : 20). Formule des jours mensualisés confirmée par le guide Pajemploi « La première déclaration » (ACOSS, mars 2012) : jours par semaine × semaines ÷ 12, arrondi à l'entier supérieur ; aucun texte officiel ne traite l'avenant en cours de mois (pages Pajemploi actuelles illisibles par un robot, vérifié le 02/11/2026) : le prorata par période est une convention de l'app, **à faire valider** (annexe C). Tests « audit C-003 » : 3 des 4 échouent sur l'ancien code |
| C-004 | Critique | Corrigé | voir plus haut ; acquisition pendant un arrêt maladie (2 jours par mois, loi d'avril 2024) : l'app compte 2,5, écart en faveur de l'AM, à corriger avant phase 2 |
| C-005 | Moyen | Partiel | Les fériés chômés payés comptent désormais dans les heures dues (C-006). Prorata : validation humaine (cas 5) |
| C-006 | Élevé | Corrigé | Art. 111 appliqué en entier. Effets à valider : fériés chômés payés comptés comme heures dues dans la régularisation ; prorata d'entrée et de sortie quand un férié tombe hors de la période |
| C-007 | Faible | Ouvert, validation humaine | Cas 7 |
| C-008 | Moyen | Corrigé (04/11/2026, branche lot-2-impots) | Rapport 78,12 % confirmé pour 2026 (taux de l'app : 4,20 € brut / 3,28 € net au 1er juin 2026, avenant n° 10). Ce qui dépend du brut estimé est affiché arrondi à l'euro, comme une estimation (`eurosArrondis`, src/engine/money.ts) : brut du mois sur l'écran Mois, tous les montants de l'écran Impôts, indemnité de rupture et total de l'écran Fin tant qu'un mois est estimé. Fin de contrat : l'écran demande le total des salaires bruts des bulletins Pajemploi avant l'indemnité de rupture ; le brut d'un bulletin contrôlé remplace l'estimation de son mois ; `brutsEstimes` liste les mois encore estimés (src/engine/fin.ts). Reste : le moteur garde 78,10 % (rates.ts) contre 78,12 % du simulateur, écart de 0,03 % sans effet à l'euro. Tests tests/fiscal.test.ts « C-008 » |
| C-009 | Moyen | Ouvert, avant phase 2 | |
| C-010 | Élevé | Ouvert, pendant le test | Tester sur 3 vrais bulletins noircis |
| C-011 | Élevé | Corrigé (04/11/2026, branche lot-2-impots) | Règle officielle : « le montant horaire du SMIC à retenir est celui (ou ceux) en vigueur au cours de la période de garde » (BOI-RSA-CHAMP-10-20-10 § 490, version du 24/02/2017 toujours en vigueur, lue le 04/11/2026) ; la brochure impots.gouv de mars 2026 donne le SMIC par période (« 11,88 € du 01/01/2025 au 31/12/2025 »). Le moteur appliquait déjà le SMIC du jour de garde (mois du bulletin pour l'historique) ; le texte de « Comment l'app calcule » disait « SMIC du 1er janvier » : corrigé. Tests tests/fiscal.test.ts « C-011 » (avril-mai à 12,02 €, juin à 12,31 € : 2 146,68 €) |
| C-012 | Conforme | Prouvé conforme | |
| C-013 | Faible | Ouvert, à confirmer | Arrondi Pajemploi |
| C-014 | Élevé | Ouvert, avant phase 2 | Validation humaine |
| C-015 | Faible | Ouvert, avant phase 2 | |
| C-016 | Faible | Ouvert, avant phase 2 | |
| C-017 | Élevé | Corrigé | Le préavis part de la première présentation de la lettre recommandée ou de la remise en main propre contre décharge, plus de l'annonce orale ; ancienneté appréciée à l'envoi (art. 120 ; fiches DREETS Auvergne-Rhône-Alpes du 18/03/2024 ; code.travail.gouv.fr IDCC 3239, vérifiés le 02/11/2026). Écran Fin : mode de remise, date d'envoi, date de première présentation. Corrigé au passage : démission avant 3 mois sans préavis ; préavis d'un mois commencé un 31 (fin au 30/11, pas au 29/11). Inaptitude professionnelle : le 2/80e **existe** (avenant n° 10 du 9 septembre 2025, art. 119-5, étendu au JO du 4 avril 2026, en vigueur le 1er mai 2026), gardé mais soumis aux 9 mois d'ancienneté de l'art. 121-1 ; inaptitude non professionnelle ajoutée (1/80e, sans préavis). Vérifications complémentaires du 02/11/2026 : CASF art. L423-24 (la date de présentation de la lettre recommandée fait courir le préavis) et L423-25 (15 jours à partir de 3 mois d'accueil, 1 mois à partir d'un an) : les 8 jours de la convention avant 3 mois s'ajoutent à la loi sans la contredire ; avenant n° 10, art. 119-5 et 64-4 : rupture sans préavis et **sans indemnité compensatrice de préavis**, salaires bruts du 2/80e sans entretien, kilomètres ni repas (comme l'app). Relecture contradictoire du 02/11/2026 : date de première présentation qui suivait « aujourd'hui » au lieu de la date d'envoi (préavis rallongé) corrigée ; champs de la lettre réservés au retrait et à la démission ; alerte pour une inaptitude notifiée avant le 1er mai 2026 ; tests février et année bissextile. Tests « audit C-017 » dans tests/payroll.test.ts |
| C-018 | Élevé | Corrigé (04/11/2026, branche lot-2-impots) | Les indemnités kilométriques entrent dans les sommes reçues avant abattement (`km`, src/engine/fiscal.ts ; ligne affichée dans Impôts). Sources lues le 04/11/2026 : BOI-RSA-CHAMP-10-20-10 (24/02/2017, en vigueur) § 440 « toutes les rémunérations et indemnités allouées » et § 460 « les indemnités de repas et de déplacement, ainsi que les prestations en nature » ; brochure impots.gouv de mars 2026 : « les indemnités de nourriture, de déplacement ». Textes de Impôts et de « Comment l'app calcule » corrigés. Mois repris d'un bulletin : kilomètres inconnus, non comptés. Tests tests/fiscal.test.ts « C-018 » (20 km à 0,50 € : +10,00 € reçus et imposables) |
| C-019 | Élevé | Corrigé (04/11/2026, branche lot-2-impots) | Heures exonérées pour une AM : heures complémentaires au sens de la convention (au-delà du contrat jusqu'à 45 h) et heures au-delà de 45 h, prévues au contrat ou en plus (CGI art. 81 quater ; BOI-RSA-CHAMP-20-50-20-30 § II ; Pajemploi). Plafond : 7 500 € par an de rémunération nette imposable, tous employeurs réunis (brochure IR 2026 impots.gouv, p. 105 ; inchangé par la loi de finances 2026). Réduction de cotisations salariales : 11,31 % du brut de ces heures (CSS art. L241-17, décret 2019-40), ajoutée par Pajemploi à la somme versée, net déclaré et brut inchangés. Moteur : `hsNet`, `hsBrut`, `reductionHS` (src/engine/month.ts), `majContratAmount` (payroll.ts) ; Impôts : ces heures, réduction et CSG non déductible comprises, sortent du net imposable et des sommes reçues ; `plafonnerHS` réintègre l'excédent au-delà de 7 500 € au prorata des enfants ; montant exonéré affiché pour la case 1GH. Contrôle : net du bulletin accepté avec ou sans la réduction, limite haute du rapport net/brut relevée de la réduction. Mois repris d'un bulletin : pas de détail, heures laissées imposables. Légifrance illisible par un robot le 04/11/2026 : textes de loi lus via BOFiP, impots.gouv et Pajemploi. Tests tests/fiscal.test.ts « C-019 » |
| C-020 | Élevé | Ouvert, avant phase 2 | Un seul téléphone en phase 1 |
| C-021 | Moyen | Ouvert, avant phase 2 | |
| C-022 | Moyen | Ouvert, avant phase 2 | |
| C-023 | Moyen | Corrigé | Un envoi refusé par Firestore (règles, document invalide, quota) n'est plus seulement écrit dans la console : `onRejected` (src/sync/backend-firebase.ts, aussi dans le faux serveur) remonte le code et les documents ; src/cloud.ts garde leurs clés dans la file d'attente du téléphone, les renvoie au bouton « Réessayer » ou au prochain branchement, et pose `refus` dans l'état du compte ; bandeau d'alerte sur tous les écrans, état « Un envoi a été refusé » dans Compte et Plus. Relecture contradictoire du 02/11/2026 : lot refusé renvoyé document par document (un seul document invalide ne bloque plus les autres) ; bandeau effacé seulement quand le renvoi est confirmé sans nouveau refus ; aucun bandeau ni événement sans compte connecté ou pendant la suppression du compte. Après un refus, et au branchement pour tout changement encore en attente, une version du serveur déjà connue (heure serveur ≤ la plus récente vue) n'écrase plus le changement du téléphone ; une version plus récente faite sur un autre appareil gagne, mais seulement après une copie automatique du téléphone (Sauvegarde) et avec un message : rien n'est perdu en silence, ni d'un côté ni de l'autre. Les réglages restent toujours fusionnés. Tests tests/envoi-refuse.test.ts. Reste avant un usage sur plusieurs appareils (relecture du 04/11/2026) : lever la protection des clés après un renvoi réussi, ne plus renvoyer une clé retirée de la file, message juste quand aucun contrat n'est copié, conseil adapté si App Check bloque. |
| C-024 | Faible | Ouvert, avant phase 2 | |
| C-025 | Suggestion | Rien à faire | |
| C-030 | Critique | Corrigé | |
| C-031 | Élevé | Corrigé | |
| C-032 | Critique | Corrigé | |
| C-033 | Moyen | Corrigé | reset() puis refus reposé, persistance coupée, clés `ph_` effacées sauf la clé de refus (le contrôle indépendant a montré que l'effacer relançait les envois) |
| C-034 | Moyen | Corrigé | Plus d'enregistrement ; toutes les adresses envoyées ($current_url, $session_entry_url…) réduites au nom d'écran (fuite trouvée par le contrôle indépendant, corrigée et rejouée) |
| C-040 | Conforme | Prouvé conforme | 27/27 sur émulateur |
| C-041 | Moyen | **Action YKM** | Fermer les inscriptions (console Firebase > Authentication) après la création du compte de la sœur ; alerte de budget |
| C-042 | Faible | Corrigé | Version affichée dans Réglages et jointe à la mesure ; recherche de mise à jour au retour dans l'app |
| C-043 | Moyen | Corrigé (03/11/2026, demande de fusion « sécurité avant ouverture ») | Règle CSP stricte dans firebase.json, sans script écrit dans la page ; parcours complets rejoués avec la règle active ; tests de non-régression (tests/securite.test.ts) |
| C-044 | Élevé | Corrigé (04/11/2026, demande de fusion n°41) | Empreintes vérifiées le 31/10/2026, firebase-tools 15.34.2. Clé de service supprimée du circuit : publication par fédération d'identité (groupe github, fournisseur pilote-am, limité au dépôt YsaacMoise/pilote-am) vers le compte github-publication, droits limités à la publication du site. Clé du compte firebase-adminsdk et secret FIREBASE_SERVICE_ACCOUNT_ARVELA_APP supprimés le 04/11/2026 après une publication réussie sans clé ; plus aucune clé de service n'existe sur le projet. |
| C-045 | Conforme | Prouvé conforme | |
| C-046 | Faible | Partiel | Exemple en @example.com ; nouveaux commits signés avec l'adresse noreply GitHub. Restriction de la clé d'API web : Action YKM |
| C-047 | Moyen | Ouvert, avant phase 2 | |
| C-048 | Faible | Ouvert, avant phase 2 | |
| C-049 | Faible | Ouvert, avant phase 2 | |
| C-050 | Moyen | Ouvert, avant phase 2 | Exiger le code de verrouillage du téléphone à l'installation |
| C-051 | Moyen | Partiel | Mot « pseudonymisé » ; remarques libres encore dans l'export |
| C-060 | Élevé | Ouvert, avant phase 2 | Corrections faites avant toute déclaration : aucun mois envoyé ne change |
| C-061 | Élevé | Ouvert, avant phase 2 | |
| C-062 | Moyen | Ouvert, avant phase 2 | |
| C-063 | Moyen | Ouvert, avant phase 2 | |
| C-064 | Moyen | Ouvert, avant phase 2 | |
| C-065 | Faible | Ouvert, avant phase 2 | |
| C-066 | Faible | Ouvert, avant phase 2 | |
| C-067 | Suggestion | Corrigé | Voir C-042 |
| C-070 | Faible | Ouvert, avant phase 2 | |
| C-080 | Élevé | Partiel | 12 tests de régression ajoutés ; banque de cas complète et mutation à 80 % : avant phase 2 |
| C-081 | Moyen | Partiel | Tests, types et construction lancés à chaque envoi (workflow Vérifier) ; Playwright et axe pas encore en CI |
| C-082 | Faible | Partiel | README et description à jour ; noms internes `cc-pilote-am` restants |
| C-083 | Moyen | Phase 3 | |
| C-090 | Faible | Ouvert, avant phase 2 | |
| C-091 | Moyen | Corrigé | Orientation libre |
| C-092 | Moyen | Ouvert, avant phase 2 | |
| C-100 | Élevé | Partiel | Démonstration et visiteurs n'envoient plus rien ; reste : exclure les deux sessions de l'audit (C-146) |
| C-101 | Moyen | Partiel | Version jointe. Événements ajoutés (src/usage-events.ts), noms fixes seulement, jamais de texte saisi, d'heure ni d'identifiant, et rien ne part sans accord (analytics.ts) : `annulation_arrivee` / `annulation_depart` (bouton Annuler juste après un pointage), `heure_corrigee` / `heure_corrigee_apres_coup` (heure déjà pointée changée ou effacée), `erreur_<famille>` avec le nom d'écran (champ refusé, départ avant l'arrivée, dates d'absence, contrat ou avenant incomplet, sauvegarde refusée, création de compte ou connexion refusée, envoi refusé par le serveur). Relecture contradictoire du 02/11/2026 : faux « heure corrigée » quand les heures valaient le planning corrigé ; chaque enregistrement refusé d'un contrat ou d'un avenant compté. Une valeur à moitié tapée (« , » dans un montant) n'est notée que si l'erreur reste affichée 2 secondes ; une erreur renvoyée après « Valider » est notée tout de suite. Tests tests/usage-events.test.ts. Reste : organisation PostHog « Marelo » à renommer (Action YKM) |
| C-110 | Élevé | Corrigé à la publication | |
| C-111 | Moyen | Corrigé | Redirection côté page vers arvela.fr (hors chemins /__/ de Firebase Auth) |
| C-112 | Moyen | Partiel | Échec sans clé, versions figées, règles testées avant publication. Branche main protégée le 03/11/2026 (demande de fusion obligatoire, vérifications « tests » et « regles-firestore » exigées, suppression et réécriture interdites). Reste : publication des règles Firestore par le workflow |
| C-113 | Élevé | **Action YKM** | Double authentification GitHub, Google, OVHcloud, PostHog |
| C-114 | Moyen | Corrigé (03/11/2026) | DMARC en quarantaine ; CAA limité à letsencrypt.org et pki.goog ; verrou de transfert et DNSSEC déjà actifs |
| C-115 | Élevé | Corrigé (03/11/2026) | Offre Blaze ; sauvegarde quotidienne gardée 98 jours ; alerte de budget à 5 € par mois. Reste : un test de restauration |
| C-116 | Moyen | Ouvert, avant phase 2 | |
| C-120 | Élevé | Corrigé | |
| C-121 | Moyen | Corrigé | « Indépendant de l'Urssaf » sur Mois, Plus, Mentions et dans le message au parent |
| C-122 | Moyen | Phase 3 | Marque |
| C-123 | Question | **Action YKM** | Clause d'exclusivité de son contrat de travail |
| C-130 | Élevé | Partiel | Rappel du registre des médicaments et de la déclaration d'accident ; le reste avant phase 2 |
| C-131 | Élevé | Ouvert, pendant le test | Taux à jour au 1er juin 2026 ; prochaine revalorisation attendue au 1er janvier 2027 |
| C-140 | Moyen | Corrigé | Engagement écrit de l'éditeur dans la politique : consultation de la copie en ligne seulement avec l'accord de l'AM |
| C-141 | Élevé | Ouvert, avant phase 2 | = C-060, C-061, C-116 |
| C-142 | Moyen | Ouvert, avant phase 2 | |
| C-143 | Moyen | Ouvert, avant phase 2 | |
| C-144 | Élevé | Corrigé | Fin du test au 31 janvier 2027 et sort des données écrits dans la politique |
| C-145 | Moyen | Phase 3 | |
| C-146 | Faible | **Action YKM** | Exclure de PostHog les deux sessions du 30/10/2026 vers 3 h 27 et 3 h 45 UTC |
| C-150 | Critique | Corrigé | = C-032 |
| C-151 | Élevé | Partiel | voir plus haut |
| C-152 | Élevé | Partiel | Demande d'accord écrit des parents pour le carnet ; analyse d'impact avant phase 2 |
| C-153 | Élevé | Corrigé | |
| C-154 | Moyen | Partiel | Renvoi au registre papier et rappel de déclaration d'accident ; vrai registre : avant phase 2 |
| C-155 | Moyen | Ouvert, avant phase 2 | Purge du carnet |
| C-156 | Moyen | Corrigé | Phrase sur le droit américain |
| C-157 | Moyen | Ouvert, avant phase 2 | Effacement PostHog à la suppression du compte |
| C-158 | Élevé | Ouvert, avant phase 2 | Registre des traitements et analyse d'impact |
| C-159 | Faible | Corrigé | noindex, robots.txt, phrase sur la dictée |

## Erreurs relevées dans le rapport d'audit lui-même

1. Verdict, section 1 : « jusqu'à 1 431 € de trop » est attribué à C-001 ; après la passe contradictoire, ces montants relèvent de C-002.
2. Section 2, point 5 : « au moins une semaine sans accueil » ; la règle juste est celle de C-002 (52 − N semaines).
3. Section 8, question 8 : renvoie à C-044 au lieu de C-041 ; question 9 : C-051 au lieu de C-151 ; C-130 : C-156 au lieu de C-154.
4. Section 2 : C-004 et C-006 placés avant la validation humaine alors que leurs cas (38 et 19) sont « à valider par un humain ». Les deux règles ont été vérifiées le 31/10/2026 sur deux fiches officielles chacune.

## Ajouts du 3 novembre 2026

- Protection anti-robots : Firebase App Check avec reCAPTCHA Enterprise (Fraud Defense), clé à score limitée à arvela.fr, jeton de 7 jours. Enregistrée en mode surveillance : rien n'est bloqué. Le code (demande de fusion « sécurité avant ouverture ») ne s'active que sur arvela.fr. À rendre obligatoire pour Firestore puis Authentication quand les mesures de la console montrent que les demandes de l'app sont vérifiées.
- Aperçu de test : chaque demande de fusion est publiée sur une adresse Firebase à part, effacée après 7 jours (workflow Aperçu).

## Relecture de sécurité indépendante du 4 novembre 2026

13 constats. Corrigés dans la demande de fusion « durcissement » :
- R-5 (moyen) : un lien parent coupé était effacé, et son identifiant pouvait être recréé par un parent qui connaissait le lien pour afficher un faux carnet. Un lien coupé devient maintenant une pierre tombale sans contenu qui garde l'identifiant ; les règles interdisent de l'effacer, de le rouvrir ou de le recréer. Matrice des règles : cas 44 et 48 à 53.
- R-2, en partie (élevé) : le nom d'un document doit commencer par son magasin (cas 45 et 46). Reste : plafond de volume par compte (compteur ou alerte de stockage).
- R-6, en partie (moyen) : iv et sel d'un lien à la taille exacte produite par l'app (cas 47). Reste : expiration des liens, taille maximale réelle.
- R-7 (moyen) : la publication n'exécute plus de paquet téléchargé à la volée ; firebase-tools vient du fichier de verrouillage, sans scripts d'installation. Jeton GitHub non gardé après chaque récupération du code.
- R-9, en partie (faible) : CSP sans eu-assets.i.posthog.com ni arvela-app.firebaseapp.com ; micro interdit (aucun code ne l'utilise). Testé sur les 4 parcours de bout en bout avec la CSP.
- R-12, en partie : alertes et mises à jour de sécurité Dependabot activées (04/11/2026).

Réglages faits le 04/11/2026 avec l'accord de YKM :
- R-1 (élevé) : corrigé. Condition du fournisseur pilote-am : `assertion.repository_id == '1436500329' && assertion.repository_owner_id == '347633010' && assertion.ref == 'refs/heads/main' && (assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')`. Aperçus supprimés (workflow apercu.yml retiré).
- R-4 (moyen) : jeton App Check ramené à 1 jour.
- R-10 (faible) : effacement automatique des branches fusionnées activé.
- R-11 (faible) : domaines autorisés de Firebase Auth : arvela.fr ajouté, localhost et l'aperçu pr41 retirés.

Restent à décider :
- R-3 (moyen) : création de comptes automatisable ; protection reCAPTCHA de Firebase Authentication non activée (passage définitif à Identity Platform, gratuit jusqu'à 50 000 utilisatrices actives par mois). Décision du 04/11/2026 : à activer au lancement du référencement ou de la publicité.
- R-8 (moyen, conformité) : durée de conservation des comptes abandonnés à fixer ; analyse d'impact en cours.
- R-10 : environ 40 branches périmées restent à effacer.
- Référencement : `noindex` dans index.html et `Disallow: /` dans robots.txt, à retirer après le volet légal.
