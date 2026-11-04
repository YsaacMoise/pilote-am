# Registre des activités de traitement d’Arvela

Article 30 du règlement général sur la protection des données (RGPD). Présentation reprise du modèle de registre simplifié de la CNIL (une fiche par traitement : acteurs, finalités, personnes concernées, catégories de données, destinataires, transferts hors Union européenne, durées, mesures de sécurité).

Créé le 4 novembre 2026. Établi à partir de la lecture du code (dépôt YsaacMoise/pilote-am, branche `volet-legal`) et de la configuration des services décrite dans AUDIT-SUIVI.md. À mettre à jour à chaque changement de traitement, de prestataire ou de durée.

## Pourquoi ce registre est obligatoire

L’article 30.5 du RGPD dispense de registre les organismes de moins de 250 personnes, sauf si le traitement n’est pas occasionnel, présente un risque pour les droits des personnes ou porte sur des catégories particulières de données (santé notamment). Ici, les trois exceptions jouent : le traitement est continu, il concerne des enfants et le carnet de liaison peut contenir des données de santé. La dispense ne s’applique donc pas.

## Organisation

| Rubrique | Valeur |
|---|---|
| Responsable de traitement | YKM, particulier, éditeur non professionnel d’Arvela (identité complète communiquée à l’hébergeur, voir Mentions légales) |
| Contact | contact@arvela.fr, ou le bouton « Ça coince » de l’app |
| Délégué à la protection des données | Aucun. La désignation n’est pas obligatoire (article 37 : pas d’autorité publique, pas de suivi régulier et systématique à grande échelle, pas de traitement à grande échelle de données sensibles au stade actuel). À réexaminer si le nombre de comptes devient important. |
| Représentant hors UE | Sans objet (éditeur établi en France) |

## Deux registres, comme le recommande la CNIL

Arvela a deux rôles (répartition retenue, à faire valider : voir docs/points-a-faire-valider.md, point 1).

- **Partie A, responsable de traitement.** Arvela décide seul de ces traitements : le compte de l’utilisatrice, la mesure d’usage, la protection anti-robots, les e-mails de service, les retours du test, les journaux techniques du site.
- **Partie B, sous-traitant.** Pour les données que chaque assistante maternelle (AM) saisit sur les enfants, les parents et sa propre activité, l’AM est responsable de traitement et Arvela agit pour son compte. Le contrat de l’article 28 est la partie « Contrat de traitement des données » des Conditions d’utilisation (src/screens/Conditions.tsx). L’article 30.2 impose un registre de ces activités.

## Prestataires (sous-traitants d’Arvela)

| Prestataire | Rôle | Lieu des données | Cadre contractuel | Traitements concernés |
|---|---|---|---|---|
| Google (Firebase et Google Cloud). Entité contractante à relever dans la console (Google Ireland Limited selon les mentions légales) | Base Firestore et ses sauvegardes ; Firebase Authentication ; Firebase Hosting ; envoi des e-mails de compte | Firestore et sauvegardes : Paris (europe-west9). Authentication : États-Unis (page « Privacy and Security in Firebase »). Hosting : service mondial | Conditions de traitement des données Google (Firebase et Google Cloud) acceptées. Transferts : certification de Google LLC au cadre UE–États-Unis (Data Privacy Framework) et clauses contractuelles types des conditions Google | A1, A4, A6, B1, B2, B3 |
| Google (reCAPTCHA Enterprise, via Firebase App Check) | Évaluation anti-robots | Infrastructure Google, hors UE possible | Google agit comme sous-traitant pour reCAPTCHA depuis le 2 avril 2026 (conditions Google Cloud) | A3 |
| PostHog (PostHog Inc., hébergement UE) | Mesure d’usage | Francfort (région UE) | Accord de traitement signé ; il intègre les clauses contractuelles types (décision 2021/914, module 2) et mentionne l’adhésion de PostHog Inc. au Data Privacy Framework ; réutilisation pour l’entraînement d’IA refusée | A2 |
| OVHcloud | Nom de domaine arvela.fr, DNS ; redirection de contact@arvela.fr (à créer, action YKM) | France / UE | Accord de traitement intégré au contrat OVHcloud | A5 (courriels reçus sur contact@), aucun accès aux données de l’app |
| Anthropic (assistant Claude) | Résumé hebdomadaire de la mesure d’usage, lancé par l’éditeur (annoncé dans la politique de confidentialité) | États-Unis | Lit **seulement des statistiques agrégées**, jamais d’événements individuels ni d’identifiants (règle inscrite dans la tâche planifiée le 04/11/2026). Cadre contractuel **à vérifier** : Anthropic n’agit comme sous-traitant, avec un accord de traitement, que sous ses conditions commerciales ; sous une offre grand public, ce cadre n’existe pas. Voir la mesure 7 de l’analyse d’impact | A2 |

Aucun autre service tiers n’est appelé par l’app : la règle CSP de firebase.json limite les connexions à `'self'`, `*.googleapis.com`, `www.google.com/recaptcha/` et à une seule adresse PostHog UE (`eu.i.posthog.com`), et les cadres à reCAPTCHA (plus de `arvela-app.firebaseapp.com`) ; le micro est interdit (`Permissions-Policy`). État de la demande de fusion n° 45 « durcissement » ; les polices sont servies par arvela.fr (paquets `@fontsource`), sans Google Fonts. Les fichiers PDF des bulletins sont lus sur le téléphone (src/pdf.ts) et ne sont jamais envoyés.

## Mesures de sécurité communes (description générale)

Constatées dans le code et la configuration le 4 novembre 2026.

- **Cloisonnement des comptes.** firestore.rules : chaque compte ne lit, n’écrit et n’efface que `users/{son uid}/data/…` ; schéma contrôlé (magasins autorisés, nom de document lié à son magasin, tailles maximales, heure serveur obligatoire) ; tout le reste est fermé. Matrice de cas exécutée sur l’émulateur Firestore à chaque envoi de code (workflow « Vérifier », job `regles-firestore`), publication bloquée en cas d’échec.
- **Lien parent chiffré.** Contenu chiffré sur le téléphone de l’AM (AES-GCM 256 bits, clé dérivée par PBKDF2-SHA-256, 600 000 itérations) à partir d’un secret de 128 bits placé après le « # » du lien (jamais envoyé au serveur) et d’un code à 4 chiffres donné de vive voix (src/partage/crypto.ts). Document `partages/{id}` lisible par qui connaît son identifiant, jamais listable, modifiable par le seul compte propriétaire ; vecteur d’initialisation et sel à la taille exacte. Un lien coupé devient une pierre tombale sans contenu (`owner`, `revoque`, `t`) que les règles interdisent d’effacer, de rouvrir ou de recréer (n° 45). Limite connue : 10 000 codes possibles.
- **Chiffrement en transit et au repos.** HTTPS partout (`upgrade-insecure-requests`) ; chiffrement au repos assuré par défaut par Google.
- **Protection anti-robots.** Firebase App Check avec reCAPTCHA Enterprise sur arvela.fr, jeton de 7 jours (R-4 : à ramener à 1 jour). **En mode surveillance : rien n’est encore bloqué.** Protection reCAPTCHA de Firebase Authentication non activée : création de comptes automatisable (R-3).
- **Règles du navigateur.** Règle CSP stricte sans script écrit dans la page ni `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (firebase.json) ; testée par tests/securite.test.ts.
- **Chaîne de publication.** Publication par fédération d’identité GitHub → Google, sans clé de service stockée ; plus aucune clé de service sur le projet (C-044). **Point faible R-1 : la fédération accepte tout workflow du dépôt, quelle que soit la branche** ; à limiter à `refs/heads/main` et à l’événement push (AIPD, mesure 1 bis). firebase-tools installé depuis le fichier de verrouillage, sans scripts d’installation (n° 45). Branche main protégée : demande de fusion obligatoire, vérifications exigées, suppression et réécriture interdites (C-112). Versions des dépendances figées.
- **Comptes.** Mot de passe de 8 caractères et 3 types sur 4 (recommandation CNIL n° 2022-100), vérifié par l’app ; blocage des essais répétés par Firebase Authentication ; confirmation de l’adresse e-mail proposée sans être bloquante ; réauthentification exigée pour supprimer le compte.
- **Disponibilité.** Sauvegarde quotidienne de la base gardée 98 jours ; alerte de budget à 5 € par mois (C-115). **Aucun test de restauration fait à ce jour.**
- **Domaine.** DMARC en quarantaine, CAA limité à Let’s Encrypt et Google, DNSSEC et verrou de transfert (C-114).
- **Accès de l’éditeur.** Seul YKM a accès aux consoles. Engagement écrit de ne consulter la copie en ligne d’une AM qu’avec son accord (politique, C-140). **Double authentification sur GitHub, Google, OVHcloud et PostHog : action YKM encore ouverte (C-113).**

---

# Partie A. Traitements dont Arvela est responsable

## A1. Compte et connexion

| Rubrique | Contenu |
|---|---|
| Date de création / mise à jour | 4 novembre 2026 |
| Finalité | Créer et sécuriser le compte de l’utilisatrice, la connecter, lui permettre de retrouver ses données sur un autre appareil, récupérer un mot de passe oublié, supprimer le compte |
| Base légale | Exécution du contrat (article 6.1.b) : les Conditions d’utilisation acceptées à la création du compte |
| Personnes concernées | Utilisatrices de l’app (assistantes maternelles) |
| Données | Adresse e-mail ; mot de passe (gardé haché par Firebase, jamais par Arvela) ; état de confirmation de l’adresse ; identifiant technique du compte (uid) ; dates de création et de connexion ; adresse IP et navigateur journalisés par Firebase Authentication. Sur le téléphone : jeton de session (IndexedDB), identifiant d’appareil tiré au hasard (src/cloud-state.ts) |
| Données sensibles | Aucune |
| Destinataires | L’éditeur (console Firebase) ; Google (sous-traitant) |
| Transferts hors UE | Oui : Firebase Authentication fonctionne depuis les États-Unis. Garanties : Data Privacy Framework (Google LLC) et clauses contractuelles types |
| Durées | Tant que le compte existe. Suppression du compte : effacement immédiat du compte Firebase (src/sync/backend-firebase.ts, `deleteAccount`). Adresses IP de connexion : « quelques semaines » (Google). Copies techniques de Google : 180 jours au plus (politique de confidentialité) |
| Sécurité | Voir mesures communes, rubrique « Comptes » |

## A2. Mesure d’usage

**État décrit : celui décidé par YKM le 4 novembre 2026 et mis en œuvre dans la demande de fusion n° 44 « mesure-anonyme » (src/analytics.ts, Réglages, politique de confidentialité).** Sur main, à la date de ce registre, la mesure est encore éteinte par défaut et ne démarre qu’après accord. Mettre cette fiche à jour si le changement n’est pas fusionné tel quel. La conformité à l’exemption de la CNIL est en cours de vérification par un juriste (point 6).

| Rubrique | Contenu |
|---|---|
| Finalité | Mesure d’audience pour le compte exclusif d’Arvela : écrans utilisés, gestes faits, erreurs affichées, problèmes de navigation, afin d’améliorer l’ergonomie. Statistiques seulement. Les données sont **pseudonymes** (identifiant tiré au hasard), pas anonymes |
| Base légale | Intérêt légitime de l’éditeur (article 6.1.f) à connaître l’usage de son app pour l’améliorer. Dépôt et lecture de l’identifiant sur le téléphone sans consentement, dans le cadre de l’exemption de la CNIL pour la mesure d’audience (article 82 de la loi Informatique et Libertés ; pages CNIL « Cookies : solutions pour les outils de mesure d’audience », 4 juillet 2025, et FAQ cookies, 29 avril 2026). Le recours à cette exemption pour PostHog est à faire valider (point 6) |
| Personnes concernées | Utilisatrices inscrites de l’app, hors démonstration. Jamais les visiteurs du site, le simulateur avant inscription, ni la page privée des parents (#/p/…) |
| Données | Nom des événements métier, noms fixes écrits dans le code (src/usage-events.ts, `logUsage`) ; nom de l’écran sans identifiant de contrat (`ecranCourant`) ; version de l’app ; identifiant tiré au hasard ; caractéristiques techniques relevées par PostHog (modèle de téléphone, système, navigateur, taille d’écran, langue, fuseau horaire). Jamais : texte saisi, prénoms, noms, horaires, montants, carnet, motifs d’absence, adresse e-mail (pseudonymisation et filtre `before_send` dans src/analytics.ts) |
| Ce qui n’est pas fait | Pas d’enregistrement d’écran, pas de capture automatique des clics, pas de carte de chaleur, pas de profil de personne (`person_profiles` « never »), aucun lien avec le compte Firebase, aucun recoupement avec un autre traitement |
| Données sensibles | Aucune |
| Destinataires | L’éditeur ; PostHog (sous-traitant) ; Anthropic (États-Unis), pour le résumé hebdomadaire : statistiques agrégées seulement, jamais d’événements individuels ni d’identifiants (cadre contractuel à vérifier) |
| Transferts hors UE | Stockage à Francfort. PostHog Inc. et Anthropic sont établis aux États-Unis : accès possible depuis les États-Unis. Garanties PostHog : clauses contractuelles types et Data Privacy Framework (accord de traitement). Anthropic : ne reçoit que des statistiques agrégées ; garanties à vérifier |
| Durées | Identifiant renouvelé au plus tard tous les 13 mois, sans prolongation à chaque visite. Événements gardés 1 an (réglage du projet PostHog) ; la CNIL recommande 25 mois au plus. Adresse IP non conservée et pas de géolocalisation (réglage du projet PostHog et propriété `$geoip_disable`). Éteindre la mesure dans Réglages arrête l’envoi et efface l’identifiant du téléphone. Effacement des événements déjà envoyés : sur demande à contact@arvela.fr (pas encore automatique à la suppression du compte, C-157) |
| Droit d’opposition | En un geste dans Plus › Réglages |
| Sécurité | Filtres côté client testés (tests/analytics.test.ts) ; contrôle indépendant des fuites du 31/10/2026 (AUDIT-SUIVI.md, C-030 à C-034) |

## A3. Protection anti-robots (Firebase App Check et reCAPTCHA Enterprise)

| Rubrique | Contenu |
|---|---|
| Finalité | Vérifier que les demandes faites au service en ligne (comptes, base) viennent de l’app publiée sur arvela.fr et non d’un robot |
| Base légale | Intérêt légitime (article 6.1.f) : sécurité du service et des données des utilisatrices. Lecture et dépôt sur le terminal sans consentement en tant que mesure strictement nécessaire à la sécurisation du service (FAQ cookies de la CNIL, question 17). Exemption à faire valider (point 3) |
| Personnes concernées | Toute personne qui ouvre arvela.fr quand l’app contacte le service en ligne : utilisatrices, et parents qui ouvrent un lien privé (le module Firebase s’initialise aussi sur la page des parents) |
| Données | Signaux techniques du navigateur observés par reCAPTCHA (navigateur, appareil, interactions, adresse IP) ; jeton App Check gardé sur le téléphone 7 jours au plus ; cookie technique de reCAPTCHA |
| Données sensibles | Aucune |
| Destinataires | Google (sous-traitant depuis le 2 avril 2026) |
| Transferts hors UE | Possibles (infrastructure Google). Garanties : conditions Google Cloud (Data Privacy Framework, clauses contractuelles types) |
| Durées | Jeton : 7 jours. Données d’évaluation : durées fixées par Google dans ses conditions reCAPTCHA Enterprise (à relever dans la documentation Google Cloud) |
| Sécurité | Clé de site limitée au domaine arvela.fr ; App Check actif seulement sur arvela.fr (`appCheckActif`, testé) ; mode surveillance |

## A4. E-mails de service (transactionnels)

| Rubrique | Contenu |
|---|---|
| Finalité | Envoyer les e-mails de confirmation d’adresse et de nouveau mot de passe, et traiter le lien reçu (src/auth-action.ts : le code est lu une fois puis retiré de l’adresse) |
| Base légale | Exécution du contrat (article 6.1.b) |
| Personnes concernées | Utilisatrices |
| Données | Adresse e-mail ; lien à usage unique ; journaux d’envoi de Google |
| Destinataires | Google (Firebase Authentication envoie les e-mails, expéditeur noreply@arvela.fr) ; OVHcloud pour les enregistrements DNS d’authentification du domaine |
| Transferts hors UE | Oui (Firebase Authentication, États-Unis). Mêmes garanties qu’en A1 |
| Durées | Liens à durée de vie courte fixée par Firebase ; journaux selon Google. Aucune liste d’envoi, aucun e-mail commercial |
| Sécurité | DMARC en quarantaine ; code retiré de l’adresse après lecture, donc absent de l’historique et de la mesure d’usage |

## A5. Retours du test et contact

| Rubrique | Contenu |
|---|---|
| Finalité | Recevoir et traiter les remarques des utilisatrices (bouton « Ça coince »), l’export mensuel du pilote qu’elles choisissent d’envoyer, et les messages à contact@arvela.fr |
| Base légale | Intérêt légitime (article 6.1.f) : corriger et améliorer l’app, répondre aux demandes. Pour les demandes d’exercice des droits : obligation légale (article 6.1.c) |
| Personnes concernées | Utilisatrices ; toute personne qui écrit à contact@arvela.fr |
| Données | Texte de la remarque, écran, date (magasin `feedback`, copié dans le compte en ligne) ; export du pilote (src/backup.ts, `buildPilotExport`) : enfants renommés A, B, C, compteurs du mois, remarques dont les prénoms et noms connus sont remplacés par « [nom] », sans note du carnet ; e-mails reçus |
| Données sensibles | Aucune attendue. Une remarque libre peut en contenir malgré la consigne : elle n’est lue que pour corriger l’app |
| Destinataires | L’éditeur. Les remarques sont lues dans la base Firestore ; l’export est envoyé par l’AM elle-même, par le moyen qu’elle choisit |
| Transferts hors UE | Non pour la base. Pour les e-mails : selon la messagerie de destination de la redirection (à préciser quand l’adresse sera créée) |
| Durées | Remarques : tant que le compte existe. Exports et e-mails : durée proposée, à appliquer par l’éditeur : jusqu’à la fin du test, puis 1 an au plus pour suivre les corrections |
| Sécurité | Remplacement des noms dans l’export ; aperçu exact de l’export avant envoi (écran Données du pilote) |

## A6. Journaux techniques du site

| Rubrique | Contenu |
|---|---|
| Finalité | Servir le site et l’app, détecter les abus |
| Base légale | Intérêt légitime (article 6.1.f) : sécurité et fonctionnement du site |
| Personnes concernées | Visiteurs d’arvela.fr, utilisatrices, parents |
| Données | Adresse IP, adresse demandée, navigateur (journaux de Firebase Hosting) |
| Destinataires | Google (sous-traitant) |
| Transferts hors UE | Possibles : Firebase Hosting est un service mondial. Mêmes garanties qu’en A1 |
| Durées | « Quelques mois » (Google, page « Privacy and Security in Firebase ») |
| Sécurité | En-têtes de sécurité et règle CSP ; aucun cookie publicitaire |

---

# Partie B. Activités menées pour le compte des assistantes maternelles (article 30.2)

| Rubrique | Contenu |
|---|---|
| Responsables de traitement (clients) | Chaque assistante maternelle titulaire d’un compte. Coordonnées : l’adresse e-mail de son compte (liste tenue par Firebase Authentication) |
| Contrat | Conditions d’utilisation, partie « Contrat de traitement des données » (article 28), acceptées à la création du compte |
| Sous-traitant ultérieur | Google (Firebase et Google Cloud), autorisé de façon générale dans les Conditions, avec information préalable de tout changement et droit d’opposition |
| Transferts hors UE | Données stockées à Paris. Google est une société américaine : accès possible sur demande des autorités américaines (mentionné dans la politique de confidentialité). Garanties : conditions Google, Data Privacy Framework, clauses contractuelles types |

## B1. Hébergement et synchronisation des données saisies

| Rubrique | Contenu |
|---|---|
| Catégories de traitements | Conservation d’une copie en ligne de ce que l’AM saisit, mise à jour entre ses appareils (src/sync/, src/cloud.ts), suppression à sa demande. Les calculs (paie, congés, fin de contrat, impôts) sont faits sur le téléphone |
| Finalité pour l’AM | Gérer l’accueil (pointage, carnet de liaison), calculer et déclarer la paie, suivre ses congés, préparer la fin d’un contrat et sa déclaration d’impôts |
| Personnes concernées | Enfants accueillis ; parents employeurs ; l’AM elle-même ; les enfants de l’AM (leur nombre seulement, pour les congés supplémentaires) |
| Données (magasins `kv`, `contracts`, `days`, `leaves`, `bulletins`, `journal`, `feedback`, voir src/db.ts et src/engine/model.ts) | **Contrats** : prénom de l’enfant, nom de la famille, couleur, dates de début et de fin, planning (horaires), type d’année, semaines programmées et sans accueil, taux horaire, majoration, indemnités d’entretien, de repas et kilométriques, mode de paiement des congés, case « enfant en situation de handicap ou de maladie » (abattement fiscal majoré), soldes de départ, historique des mois (net, brut, heures, jours), avenants, clés du lien parent (identifiant, secret, code, sel). **Journées** : arrivées et départs, absence de l’enfant et son motif (malade avec certificat, malade sans certificat, à la demande des parents, sans solde), jour hors planning, férié travaillé, repas, kilomètres. **Carnet** : date, heure, type (repas, sommeil, change, humeur, soin, note), texte, fin de sieste, quantité de biberon, température. Soins proposés : prise de température, médicament donné (ordonnance), lavage de nez, crème appliquée, plaie désinfectée ; incidents : petite chute, bosse ou bleu, morsure ou griffure, vomissement, saignement de nez ; notes libres. **Absences de l’AM** : congés payés, « je suis malade », « mon enfant est malade », événement familial, sans solde, avec leurs dates. **Bulletins** : net, brut, heures, jours, entretien. **Réglages** : prénom de l’AM, nombre de ses enfants à charge, préférences. Chaque document en ligne porte aussi l’heure serveur et l’identifiant d’appareil tiré au hasard (champ `d`) |
| Données sensibles | Oui : données de santé (soins, température, médicament, incidents, motifs de maladie de l’enfant et de l’AM, case handicap ou maladie), et notes libres qui peuvent en contenir |
| Durées | Tant que le compte existe ou jusqu’à ce que l’AM efface l’élément. Suppression du compte : contenu des liens parents (remplacé par une pierre tombale, voir B2) puis données en ligne effacés immédiatement (`deleteAccount`) ; sauvegardes : 98 jours ; copies techniques de Google : 180 jours au plus. Sur le téléphone : tant que l’app est gardée, plus 7 copies automatiques locales (src/store.ts, `autoCopy`) |
| Accès de l’éditeur | Techniquement possible par la console ; engagement de ne consulter qu’avec l’accord de l’AM |
| Sécurité | Mesures communes, rubriques cloisonnement, chiffrement, chaîne de publication, accès |

## B2. Liens privés pour les parents (collection `partages`)

| Rubrique | Contenu |
|---|---|
| Catégories de traitements | Stockage d’un instantané chiffré préparé sur le téléphone de l’AM et mis à jour à chaque changement tant que le lien existe (src/partage/, src/cloud.ts) ; lecture par les parents munis du lien et du code ; effacement du contenu quand le lien est coupé, le contrat supprimé ou le compte supprimé, avec une pierre tombale qui garde l’identifiant |
| Personnes concernées | L’enfant ; les parents (lecteurs) ; l’AM (son prénom) |
| Données (chiffrées) | Prénom de l’enfant et couleur, prénom de l’AM, présences des 7 derniers jours (arrivées, départs, plages prévues, motif d’absence de l’enfant, congé ou absence de l’AM sans motif, jour férié), carnet de ces 7 jours, montants du mois et du mois précédent (src/partage/snapshot.ts). Ni nom de la famille, ni autres enfants. En clair dans la base : identifiant du document, uid du propriétaire, sel, vecteur d’initialisation, heure de mise à jour. Après coupure : identifiant, uid du propriétaire, `revoque`, heure |
| Données sensibles | Oui, dans le contenu chiffré (soins du carnet, motif « malade ») |
| Sur l’appareil des parents | Rien, sauf le code s’ils demandent à le garder (localStorage) ; cache Firestore en mémoire seulement |
| Durées | Contenu : effacé quand le lien est coupé, le contrat ou le compte supprimé ; sauvegardes : 98 jours. Reste un document sans contenu (identifiant, uid du propriétaire, `revoque`, heure), gardé sans limite : **durée à fixer** (par exemple purge des pierres tombales de plus de 12 mois par une tâche d’administration) |
| Sécurité | Chiffrement sur le téléphone de l’AM décrit dans les mesures communes ; secret jamais envoyé au serveur. Limites : code à 4 chiffres ; les clés du lien sont aussi gardées dans les données du compte de l’AM, donc l’éditeur, qui a déjà accès à ces données en clair, pourrait techniquement les lire |

## B3. Sauvegardes quotidiennes de la base

| Rubrique | Contenu |
|---|---|
| Catégories de traitements | Copie quotidienne automatique de toute la base Firestore (données saisies et liens parents chiffrés), pour la restaurer en cas de perte, d’erreur ou d’attaque |
| Personnes et données | Les mêmes qu’en B1 et B2 |
| Durées | 98 jours par sauvegarde. Une sauvegarde ne se modifie pas : une donnée effacée de la base disparaît des sauvegardes quand la dernière sauvegarde qui la contient expire, soit sous 98 jours |
| Lieu | Avec la base, dans la région de la base (Paris), selon la configuration de la console |
| Sécurité | Accès limité au projet Google Cloud de l’éditeur ; aucun test de restauration fait (action ouverte, C-115). En cas de restauration, les suppressions faites depuis la sauvegarde doivent être rejouées (à prévoir dans la procédure) |

---

## Historique

| Date | Changement |
|---|---|
| 4 novembre 2026 | Création du registre (conditions d’utilisation et analyse d’impact du même jour) |
| 4 novembre 2026 | Corrections après relecture indépendante : mesure limitée aux utilisatrices inscrites et données pseudonymes (n° 44), pierres tombales des liens parents (n° 45), Anthropic limité aux statistiques agrégées, durée PostHog de 1 an, CSP de la n° 45, points faibles R-1, R-3, R-4 |
