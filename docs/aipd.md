# Analyse d’impact relative à la protection des données (AIPD) d’Arvela

Méthode : celle de la CNIL (guides « AIPD 1 : la méthode », « AIPD 2 : les modèles », « AIPD 3 : les bases de connaissances », et logiciel PIA), dans une version courte et proportionnée à un service gratuit édité par un particulier. Quatre étapes : contexte, principes fondamentaux, risques, validation.

Réalisée le 4 novembre 2026 par l’éditeur, avant l’ouverture des inscriptions à toutes les assistantes maternelles. Faite à partir du code (branche `volet-legal`) et de la configuration décrite dans AUDIT-SUIVI.md. Pièces liées : docs/registre-des-traitements.md (registre), écran Conditions d’utilisation (contrat de l’article 28), docs/points-a-faire-valider.md (questions au juriste).

## Pourquoi une AIPD

L’article 35 du RGPD impose une AIPD quand un traitement est susceptible d’engendrer un risque élevé. Les lignes directrices du G29 (WP248 rév. 01), reprises par la CNIL, donnent neuf critères ; deux critères remplis rendent l’analyse en principe nécessaire. Ici, deux critères sont remplis :

1. **Personnes vulnérables** : les données portent sur des enfants en bas âge.
2. **Données sensibles** : le carnet de liaison permet de noter des soins (température, médicament donné sur ordonnance, lavage de nez, crème, plaie désinfectée) et des incidents (chute, bosse, morsure, vomissement, saignement de nez) ; les journées notent si l’enfant est absent parce que malade ; le contrat peut indiquer un enfant en situation de handicap ou de maladie (abattement fiscal majoré) ; l’AM note ses propres arrêts (« je suis malade »). Ce sont des données de santé au sens de l’article 4.15.

Les autres critères ne sont pas remplis : pas de profilage ni de décision automatique sur les personnes, pas de surveillance, pas de croisement de fichiers, pas de technologie nouvelle au sens du G29, pas d’échelle importante à ce jour.

**Qui fait l’analyse.** Pour les données des enfants et des parents, le responsable de traitement est l’assistante maternelle (choix retenu, point 1 à faire valider). Une AM seule ne peut pas analyser un logiciel qu’elle ne maîtrise pas. Arvela, comme sous-traitant, l’aide (article 28.3.f) : cette AIPD porte sur l’ensemble du service et est remise à toute utilisatrice qui la demande. Elle couvre aussi les traitements dont Arvela est responsable (compte, mesure d’usage, protection anti-robots).

---

## 1. Contexte

### Vue d’ensemble

Arvela est une application web installable (arvela.fr) pour les assistantes maternelles agréées, employées par des particuliers. Elle sert à pointer les arrivées et départs, tenir un carnet de liaison, calculer les montants à déclarer sur Pajemploi, suivre les congés, préparer une fin de contrat et estimer l’abattement fiscal. L’AM peut ouvrir aux parents un lien privé et chiffré pour suivre la journée de leur enfant.

Le service est gratuit, en phase de test jusqu’au 31 janvier 2027, édité par un particulier (YKM) qui est seul à administrer le projet.

### Données, processus et supports

| Étape | Données | Support |
|---|---|---|
| Saisie | Contrats, journées, absences, carnet, congés de l’AM, chiffres des bulletins, réglages | Téléphone de l’AM (IndexedDB), 7 copies automatiques locales |
| Copie en ligne (si compte) | Les mêmes, document par document | Google Firestore, Paris (europe-west9) |
| Sauvegarde | Toute la base | Sauvegarde quotidienne Firestore, 98 jours |
| Lien parent | Instantané de 7 jours chiffré sur le téléphone | Firestore, collection `partages` ; lu dans le navigateur des parents |
| Compte | Adresse e-mail, mot de passe, journaux de connexion | Firebase Authentication (États-Unis) |
| Mesure d’usage (utilisatrices inscrites seulement, demande de fusion n° 44) | Noms d’événements et d’écrans, version, identifiant au hasard (données pseudonymes), caractéristiques techniques | PostHog, Francfort ; résumé hebdomadaire par Claude (Anthropic) à partir de statistiques agrégées seulement |
| Anti-robots | Signaux techniques du navigateur | reCAPTCHA Enterprise (Google) |
| Bulletins PDF | Lus sur le téléphone, jamais envoyés | Téléphone |

Le détail des données, des destinataires et des durées est dans le registre.

---

## 2. Principes fondamentaux

### Proportionnalité et nécessité

| Principe | Constat | Appréciation |
|---|---|---|
| Finalités déterminées et légitimes | Gestion de l’accueil et de la paie par l’AM ; information des parents ; fonctionnement, sécurité et amélioration du service par Arvela. Aucune publicité, aucune revente, aucune réutilisation (Conditions, partie article 28) | Satisfaisant |
| Bases légales | Pour l’AM : exécution des contrats de travail et obligations de déclaration (paie, congés, fin de contrat) ; pour les données de santé du carnet, accord écrit des parents (article 9.2.a), demandé par le message prêt à envoyer de la politique de confidentialité. Pour Arvela : contrat (compte), intérêt légitime (mesure d’usage, anti-robots, journaux) | Satisfaisant, sous réserve : le motif « malade » d’une absence et la case handicap ou maladie servent au calcul de la paie et de l’abattement, sans accord écrit prévu. Mesure prévue n° 9 |
| Minimisation | Prénom de l’enfant seulement ; pas de date de naissance, d’adresse, de numéro de sécurité sociale, de coordonnées des parents ; absences « sans diagnostic » ; listes fermées pour les soins ; PDF jamais envoyés ; lien parent limité à 7 jours, sans nom de famille ; mesure d’usage sans contenu saisi | Satisfaisant. Reste un risque : les notes libres du carnet et le champ « médicament » peuvent recevoir plus que nécessaire (rappel dans l’app : le carnet ne remplace pas le registre des médicaments) |
| Exactitude | Correction possible à tout moment ; conflits entre appareils gérés sans perte silencieuse (C-023) | Satisfaisant |
| Durées de conservation | En ligne : tant que le compte existe, effacement immédiat à la suppression, 98 jours dans les sauvegardes. Aucune purge automatique du carnet ni des contrats terminés : la conservation dépend de l’AM. Aucune durée pour un compte abandonné (R-8). Les pierres tombales des liens coupés (identifiant, uid, date, sans contenu, n° 45) sont gardées sans limite | **À améliorer** : mesures prévues n° 4, 14 et 15 |

### Droits des personnes

| Droit | Mise en œuvre | Appréciation |
|---|---|---|
| Information de l’AM | Politique de confidentialité, Conditions d’utilisation, mentions légales, lisibles avant le compte ; phrase d’acceptation à la création du compte, accord enregistré (version et date) dans les réglages copiés dans le compte ; message aux comptes existants jusqu’à leur accord | Satisfaisant |
| Information des parents | Message prêt à envoyer (politique de confidentialité), qui décrit les données, l’hébergement et l’accès possible de l’éditeur | Satisfaisant si l’AM l’envoie ; l’app ne le vérifie pas |
| Accord pour le carnet | Demandé par écrit par l’AM, réponse gardée par elle ; retrait possible, l’AM supprime alors le carnet | Satisfaisant, à la charge de l’AM |
| Accès et portabilité | Plus › Sauvegarde : fichier complet ; les parents voient les 7 derniers jours par le lien | Satisfaisant |
| Rectification et effacement | Dans l’app ; suppression du compte en un geste avec mot de passe ; effacement des événements de mesure sur demande | Satisfaisant ; effacement automatique des événements de mesure non prévu (C-157), sans lien avec le compte dans le nouveau réglage |
| Opposition | Mesure d’usage coupée en un geste dans Réglages | Satisfaisant |
| Sous-traitance | Contrat de l’article 28 dans les Conditions ; accords de traitement Google et PostHog ; cadre Anthropic à vérifier (mesure n° 7) | Partiel |
| Transferts hors UE | Authentification aux États-Unis ; accès possible de sociétés américaines. Garanties : Data Privacy Framework et clauses contractuelles types | Acceptable ; l’information est donnée |

---

## 3. Risques

Échelles de la CNIL. Gravité : négligeable, limitée, importante, maximale. Vraisemblance : négligeable, limitée, importante, maximale. Les niveaux sont ceux qui restent avec les mesures existantes, puis avec les mesures prévues.

### Mesures existantes (vérifiées dans le code et la configuration)

- Cloisonnement par compte dans firestore.rules, schéma contrôlé, matrice de cas exécutée sur l’émulateur à chaque envoi de code.
- Lien parent chiffré sur le téléphone (AES-GCM, PBKDF2 600 000 itérations), secret jamais envoyé au serveur, document non listable.
- HTTPS ; chiffrement au repos par Google ; base à Paris.
- Mot de passe 8 caractères et 3 types sur 4 ; blocage des essais répétés par Firebase ; réauthentification pour supprimer le compte.
- Règle CSP stricte et en-têtes de sécurité ; aucun script tiers hormis reCAPTCHA.
- Publication sans clé de service ; branche main protégée avec vérifications obligatoires.
- App Check avec reCAPTCHA Enterprise, **en mode surveillance (rien n’est bloqué)**.
- Copie sur le téléphone, 7 copies automatiques locales, sauvegarde manuelle, sauvegarde quotidienne de la base gardée 98 jours ; alerte de budget.
- Mesure d’usage sans contenu saisi, sans enregistrement d’écran ni profil, contrôlée par un test indépendant des fuites (31/10/2026) ; limitée aux utilisatrices inscrites (n° 44).
- Lien parent coupé remplacé par une pierre tombale que personne ne peut recréer (n° 45).
- Engagement écrit de l’éditeur de ne consulter les données qu’avec l’accord de l’AM.

### Risque 1. Accès illégitime aux données

| Élément | Analyse |
|---|---|
| Impacts sur les personnes | Révélation de l’état de santé d’un enfant (soins, fièvre, médicaments, incidents, handicap), du nom de la famille, des horaires de présence (donc des moments où le domicile est vide), des montants de salaire. Gêne, atteinte à la vie privée, risque pour la sécurité de l’enfant si les horaires sont connus d’une personne malveillante |
| Menaces | Prise de contrôle du compte d’une AM (mot de passe réutilisé, hameçonnage) ; vol ou perte d’un téléphone non verrouillé ; lien parent transféré puis code trouvé ; prise de contrôle d’un compte administrateur de l’éditeur (Google, GitHub) ; erreur dans les règles d’accès ; demande d’une autorité étrangère à Google ou PostHog |
| Sources | Attaquant extérieur, proche de la famille ou de l’AM, éditeur lui-même, prestataires |
| Points faibles constatés | **Pas encore de double authentification sur les comptes administrateurs (C-113)** : un seul compte Google compromis donne accès à toutes les données de toutes les AM. App Check non bloquant. Code parent à 4 chiffres : avec le lien, un essai systématique des 10 000 codes hors ligne prend de quelques minutes à quelques heures selon le matériel (ordre de grandeur estimé ; la limite est reconnue dans src/partage/crypto.ts). Pas de code de verrouillage exigé sur le téléphone (C-050). Clé d’API web non restreinte (C-046). **R-1 : la fédération d’identité qui publie le site accepte tout workflow du dépôt, quelle que soit la branche** : une branche pouvait publier sur arvela.fr sans fusion, donc mettre en ligne un code qui détourne les données. R-3 : création de comptes automatisable, la protection reCAPTCHA de Firebase Authentication n’étant pas activée. R-4 : jeton App Check de 7 jours, réutilisable par un robot |
| Gravité | **Importante** : données de santé d’enfants, mais en petit nombre par compte, sans identifiant national ni adresse |
| Vraisemblance | **Importante** tant que la double authentification n’est pas activée ; **limitée** ensuite |
| Mesures prévues | 1, 1 bis, 2, 2 bis, 5, 6, 8 |

### Risque 2. Modification non désirée des données

| Élément | Analyse |
|---|---|
| Impacts | Montants faux déclarés sur Pajemploi (salaire trop ou pas assez payé), carnet erroné transmis aux parents (soin oublié ou inventé), conflit entre l’AM et les parents |
| Menaces | Compte compromis ; conflit entre deux appareils ; bug de synchronisation ; restauration d’une vieille sauvegarde |
| Mesures en place | Conflits traités sans perte silencieuse et copie automatique avant tout écrasement (C-023) ; refus d’envoi signalé par un bandeau ; annulation de chaque action ; avertissement de vérifier les montants avant déclaration ; tests du moteur de paie |
| Gravité | **Limitée** : erreurs visibles et réparables, la déclaration Pajemploi et le bulletin font foi |
| Vraisemblance | **Limitée** |
| Mesures prévues | 1, 3 |

### Risque 3. Disparition des données

| Élément | Analyse |
|---|---|
| Impacts | Perte de l’historique des journées, du carnet et des contrats ; difficulté à justifier une paie ou des congés ; perte des souvenirs du carnet |
| Menaces | Suppression par un attaquant ou par erreur ; panne ou fermeture du compte Google ; arrêt du service ; perte du téléphone sans compte |
| Mesures en place | Données d’abord sur le téléphone ; 7 copies automatiques locales ; sauvegarde complète en un geste ; sauvegarde quotidienne de la base, 98 jours ; préavis et export prévus en cas d’arrêt du service (Conditions) |
| Point faible | **Aucune restauration n’a encore été essayée (C-115)** |
| Gravité | **Limitée** |
| Vraisemblance | **Limitée** |
| Mesures prévues | 3 |

### Cartographie

| Risque | Avant mesures prévues | Après mesures prévues |
|---|---|---|
| Accès illégitime | Gravité importante, vraisemblance importante | Gravité importante, vraisemblance limitée |
| Modification non désirée | Limitée, limitée | Limitée, négligeable à limitée |
| Disparition | Limitée, limitée | Limitée, négligeable |

---

## 4. Plan d’action

| N° | Mesure | Risque | Échéance proposée | Responsable |
|---|---|---|---|---|
| 1 | Activer la double authentification sur les comptes Google, GitHub, OVHcloud et PostHog (C-113) | 1, 2 | **Avant l’ouverture des inscriptions** | YKM |
| 1 bis | Limiter la fédération d’identité à `refs/heads/main` et à l’événement push (R-1), et sortir les aperçus de ce compte de publication | 1, 2 | **Avant l’ouverture des inscriptions** | YKM |
| 2 | Rendre App Check obligatoire pour Firestore puis Authentication quand les mesures de la console montrent que les demandes de l’app sont vérifiées ; restreindre la clé d’API web au domaine (C-046) | 1 | Dans le mois qui suit l’ouverture | YKM |
| 2 bis | Activer la protection reCAPTCHA de Firebase Authentication (passage à Identity Platform) contre la création automatique de comptes (R-3) ; ramener le jeton App Check à 1 jour (R-4) | 1 | Dans le mois qui suit l’ouverture | YKM |
| 3 | Faire un essai de restauration de la base dans une base séparée, et écrire la procédure (dont : rejouer les suppressions faites depuis la sauvegarde) (C-115) | 2, 3 | Avant l’ouverture si possible, sinon sous un mois | YKM |
| 4 | Proposer l’effacement du carnet et des contrats terminés après un délai (purge, C-155) | Durées | Avant la phase 2 | Développement |
| 5 | Allonger le code du lien parent (6 chiffres ou plus) ou limiter les essais | 1 | Avant la phase 2 | Développement |
| 6 | Conseiller un code de verrouillage du téléphone à l’installation (C-050) | 1 | Avant la phase 2 | Développement |
| 7 | Analyse hebdomadaire par Claude (Anthropic) : limitée aux statistiques agrégées, jamais d’événements individuels ni d’identifiants (règle inscrite dans la tâche planifiée le 04/11/2026, **fait**). Reste à vérifier le cadre contractuel ; sinon, cesser cette analyse | Sous-traitance | Avant l’ouverture | YKM |
| 8 | Effacer les événements de mesure d’usage sur demande dans un délai fixé, et documenter comment | Droits | Avec la mise en œuvre de la mesure par défaut | YKM |
| 9 | Message aux parents étendu au motif « malade » et à la case handicap ou maladie, avec le droit de saisir la CNIL (src/legal.ts, **fait le 04/11/2026**) | Base légale | Avant la phase 2 | Développement |
| 10 | Remettre aux AM, sur demande, ce document, le registre et la fiche de registre prête à recopier (docs/fiche-registre-assistante-maternelle.md) | Sous-traitance | À l’ouverture | YKM |
| 11 | Faire valider les six points de docs/points-a-faire-valider.md par un juriste | Tous | Avant la fin du test (31 janvier 2027) | YKM |
| 12 | Revoir cette AIPD à chaque changement important, et au plus tard avant la phase 2 | Tous | Avant la phase 2 | YKM |
| 13 | Changements de conditions : message dans l’app jusqu’à l’accord de l’utilisatrice (fait le 04/11/2026). Changements de prestataire : les Conditions promettent un e-mail au moins 15 jours avant ; prévoir comment l’envoyer (liste des adresses tirée de la console, envoi depuis contact@arvela.fr) | Sous-traitance | Avant le premier changement de prestataire | YKM |
| 14 | Fixer une durée pour les comptes inactifs (par exemple 2 ans sans connexion : e-mail d’avertissement, puis suppression) (R-8) | Durées | Avant la phase 2 | YKM et développement |
| 15 | Fixer une durée pour les pierres tombales des liens coupés (par exemple purge de celles de plus de 12 mois par une tâche d’administration) | Durées | Avant la phase 2 | Développement |

---

## 5. Validation et conclusion

**Avis des personnes concernées.** Pas recueilli de façon formelle (article 35.9). Les retours « Ça coince » des testeuses en tiennent lieu pour l’instant ; demander l’avis de deux ou trois AM et d’un parent sur le message aux parents serait utile.

**Délégué à la protection des données.** Aucun (non obligatoire).

**Conclusion.** Les finalités sont limitées, les données sont réduites au besoin, l’hébergement est en France et les droits s’exercent pour l’essentiel directement dans l’app. Le risque principal est l’accès illégitime aux données de santé des enfants. Aujourd’hui, son niveau est trop élevé pour une ouverture large, pour une raison précise : les comptes administrateurs ne sont pas protégés par une double authentification, alors qu’un seul d’entre eux donne accès à toutes les données. **Le traitement peut être ouvert à toutes les assistantes maternelles à condition que les mesures 1 et 1 bis soient faites avant l’ouverture, et la mesure 7 tranchée.** Les risques résiduels sont alors limités et ne justifient pas de consulter la CNIL avant la mise en œuvre (article 36). Les mesures 2 à 6 réduisent encore ces risques et doivent suivre selon les échéances indiquées.

**État au 4 novembre 2026 : la mesure 1 (double authentification sur les comptes d’administration) n’est pas faite. Tant qu’elle ne l’est pas, le risque 1 reste élevé et l’ouverture des inscriptions n’est pas couverte par cette analyse.** La mesure 1 bis (R-1) n’est pas faite non plus.

| Rôle | Nom | Date | Décision |
|---|---|---|---|
| Éditeur, responsable de traitement pour ses traitements propres et sous-traitant des AM | YKM | | À signer après les mesures 1 et 1 bis |

Modèle remis par le sous-traitant, que chaque AM peut reprendre à son compte.
