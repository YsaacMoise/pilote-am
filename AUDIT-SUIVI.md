# Registre de suivi de l'audit indépendant (commit audité 1aa16c1, 30 octobre 2026)

Ce registre suit les 89 lignes du tableau final de l'audit. Aucune ligne ne disparaît sans décision écrite.
Toute session qui corrige un constat met à jour sa ligne ici, dans le même commit, avec la preuve.

Statuts : **Corrigé** (code changé, preuve citée) · **Partiel** (ce qui reste est écrit) · **Prouvé conforme** · **Ouvert, pendant le test** · **Ouvert, avant phase 2** · **Phase 3** · **Action YKM** (hors code : console, compte, décision).

Corrections du 31 octobre 2026 : branche `corrections-audit`, commits 3c69189 (mesure d'usage), e484457 (paie), 3e609d4 (textes), 3bb903e et suivants (exploitation), b7e1519 (contrôle des fuites), puis corrections de la relecture contradictoire de la paie.

Relecture contradictoire du 31/10/2026 (relecteur indépendant, sans accès au raisonnement de l'auteur) : C-001, C-002, C-004 et C-006 confirmés dans leur principe ; défauts trouvés et corrigés le jour même : diviseur de l'art. 111 complet (congés payés et semaines sans accueil compris), congés pris avant le début du suivi imputés deux fois (bug A), solde fractionnaire tronqué, régularisation valorisée au taux final, semaines sans accueil d'avenant ignorées (bug C), contrat ancien bloqué (bug D), bascule en année complète bloquée (bug E), renvoi à un « article 124 » (la régularisation relève de l'art. 109.2). Tests « relecture contradictoire » dans tests/payroll.test.ts.

Contrôle indépendant des fuites du 31/10/2026 (Chrome, faux serveur PostHog) : deux défauts trouvés et corrigés (envois repris après extinction, identifiant de contrat dans les adresses) ; parcours rejoué.

## Les 12 lignes « bloquant installation »

| Constat | Statut | Preuve |
|---|---|---|
| C-001 Régularisation à chaque avenant | Corrigé | Option A : régularisation en fin de contrat ou au passage incomplète → complète, chaque heure valorisée au taux de son jour (art. 109.2). Confirmé par la fiche régularisation DDETS 31 (05/11/2024) et le guide DREETS Bourgogne-Franche-Comté (août 2026) : régularisations annuelles prévisionnelles qui « se compensent » sans règlement, paiement en fin de contrat. Tests « audit C-001 » dans tests/payroll.test.ts |
| C-002 Année incomplète sans semaines sans accueil | Corrigé | Régularisation non calculée et alerte tant qu'une année de contrat terminée n'a pas ses 52 − N semaines (contrat et avenants réunis) ; bandeau dans le formulaire sans blocage, car l'art. 98.1.2 permet de les communiquer plus tard ; dernière année : alerte de vérification. Tests « C-002 », « bug C », « bug D », « bug E » |
| C-004 Congés pris sans droits jamais retenus | Corrigé | Année complète : jours au-delà des droits retenus comme sans solde, droits consommés dans l'ordre chronologique, enfants à charge comptés. Règle confirmée par les fiches DREETS Occitanie (52 semaines) et Bourgogne-Franche-Comté (août 2026) et par l'art. 109.1. Congés pris avant le début du suivi non imputés sur le solde de départ ; solde fractionnaire arrondi au supérieur. Tests « C-004 », « bug A », « solde fractionnaire ». **L'ordre chronologique est une convention de l'app : à faire valider (cas 38)** |
| C-006 Diviseur des retenues incomplet | Corrigé | Diviseur de l'art. 111 : planning type du mois entier, absences, congés payés, semaines sans accueil et fériés chômés compris (texte de l'art. 111 ; fiches DREETS Occitanie et DDETS 31). Tests « C-006 » et « art. 111 » (novembre 2026 : 189 h ; octobre avec congés : 31,02 € ; août incomplet : 575,00 €) |
| C-030 Soins en clair vers PostHog | Corrigé | Plus d'enregistrement d'écran ni de capture automatique ; carnet masqué ; aria-label sans le texte saisi. Test tests/analytics.test.ts. Parcours piégé dans Chrome contre un faux serveur PostHog (contrôle indépendant du 31/10/2026) : sans accord 0 requête ; avec accord, aucune donnée saisie ni identifiant de contrat ; après extinction, plus aucun envoi ; démonstration 0 requête |
| C-031 Corps des requêtes capturables | Corrigé | `recordBody`/`recordHeaders` forcés à faux, enregistrement coupé côté client, pseudonymisation sans limite de profondeur. Test analytics |
| C-032 / C-150 Mesure sans consentement | Corrigé | Option B renforcée : mesure éteinte par défaut, accord explicite dans Réglages, jamais en démonstration, aucun profil de personne, événements métier seulement |
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
| C-003 | Élevé | Ouvert, pendant le test | Jours d'activité à l'avenant ; sans effet tant qu'il n'y a pas d'avenant |
| C-004 | Critique | Corrigé | voir plus haut ; acquisition pendant un arrêt maladie (2 jours par mois, loi d'avril 2024) : l'app compte 2,5, écart en faveur de l'AM, à corriger avant phase 2 |
| C-005 | Moyen | Partiel | Les fériés chômés payés comptent désormais dans les heures dues (C-006). Prorata : validation humaine (cas 5) |
| C-006 | Élevé | Corrigé | Art. 111 appliqué en entier. Effets à valider : fériés chômés payés comptés comme heures dues dans la régularisation ; prorata d'entrée et de sortie quand un férié tombe hors de la période |
| C-007 | Faible | Ouvert, validation humaine | Cas 7 |
| C-008 | Moyen | Ouvert, avant phase 2 | Rapport 78,12 % confirmé pour 2026 (taux de l'app : 4,20 € brut / 3,28 € net au 1er juin 2026, avenant n° 10) |
| C-009 | Moyen | Ouvert, avant phase 2 | |
| C-010 | Élevé | Ouvert, pendant le test | Tester sur 3 vrais bulletins noircis |
| C-011 | Élevé | Ouvert, pendant le test | |
| C-012 | Conforme | Prouvé conforme | |
| C-013 | Faible | Ouvert, à confirmer | Arrondi Pajemploi |
| C-014 | Élevé | Ouvert, avant phase 2 | Validation humaine |
| C-015 | Faible | Ouvert, avant phase 2 | |
| C-016 | Faible | Ouvert, avant phase 2 | |
| C-017 | Élevé | Ouvert, pendant le test | Point de départ du préavis |
| C-018 | Élevé | Ouvert, pendant le test | Kilomètres dans l'abattement |
| C-019 | Élevé | Ouvert, pendant le test | Heures majorées exonérées |
| C-020 | Élevé | Ouvert, avant phase 2 | Un seul téléphone en phase 1 |
| C-021 | Moyen | Ouvert, avant phase 2 | |
| C-022 | Moyen | Ouvert, avant phase 2 | |
| C-023 | Moyen | Ouvert, pendant le test | |
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
| C-043 | Moyen | Ouvert, avant phase 2 | CSP |
| C-044 | Élevé | Corrigé | Empreintes vérifiées le 31/10/2026 (identiques à l'audit), firebase-tools 15.34.2. Rotation de la clé de service : Action YKM, avant phase 2 |
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
| C-101 | Moyen | Partiel | Version jointe ; événements d'erreur et de correction : pendant le test. Organisation PostHog « Marelo » à renommer (Action YKM) |
| C-110 | Élevé | Corrigé à la publication | |
| C-111 | Moyen | Corrigé | Redirection côté page vers arvela.fr (hors chemins /__/ de Firebase Auth) |
| C-112 | Moyen | Partiel | Échec sans clé, versions figées, règles testées avant publication. Protection de la branche main et publication des règles par le workflow : Action YKM |
| C-113 | Élevé | **Action YKM** | Double authentification GitHub, Google, OVHcloud, PostHog |
| C-114 | Moyen | **Action YKM** | DMARC et CAA dans la zone DNS OVH |
| C-115 | Élevé | **Action YKM** | Sauvegardes Firestore (offre Blaze) et alerte de budget |
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
