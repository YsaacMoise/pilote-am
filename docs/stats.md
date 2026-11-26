# Totaux exacts d'Arvela (T-127) : ce que fait le DG

Demande du DG du 26/11/2026 : un coin admin avec le nombre d'inscrites, d'utilisatrices et leur évolution. Le nombre de comptes ne dépend jamais de la mesure d'usage : il vient de Firebase. PostHog ne sert qu'à le recevoir et à afficher l'évolution.

Le code est prêt (functions/stats/). Rien ne tourne tant que les étapes ci-dessous ne sont pas faites. La partie serveur de la copie scellée (T-125, docs/sequestre-kms.md) et ces totaux se mettent en service dans la même séance (section 3).

Sigles : AM (assistante maternelle), uid (identifiant technique d'un compte Firebase), IAM (gestion des droits de Google Cloud), KMS (service de clés de Google Cloud), SMTP (protocole d'envoi des e-mails), RGPD (règlement général sur la protection des données).

## 1. Ce que fait la fonction
Chaque nuit à 5 h (heure de Paris), la fonction `statsNuit` (région de Paris, europe-west9) compte dans Firebase, en lecture seule, puis envoie un seul événement `stats_jour` à PostHog (serveurs à Francfort), au nom fixe `arvela-serveur`.

Deux groupes de totaux :
- **Totaux des comptes** (toujours) : comptes, nouveaux sur 1, 7 et 30 jours, connectées sur 7 et 30 jours, adresses confirmées, inscriptions par semaine sur 26 semaines, comptes exclus. « Connectée » : dernière connexion, ou dernier renouvellement de la session (Firebase le fait environ chaque heure quand l'app est ouverte et en ligne). Arvela est responsable de ces données (registre, A1).
- **Totaux des données confiées par l'AM** (seulement si le paramètre `STATS_DONNEES_CONFIEES` vaut `true` ; faux par défaut) : actives sur 7 et 30 jours (au moins une donnée saisie dans la période ; les documents techniques de l'app ne comptent pas : repère d'appareil, coffre, copie scellée, clé d'accès), comptes avec au moins un contrat, contrats en cours ce jour-là (même règle que l'app), liens des parents non coupés.

Garanties :
- L'événement ne contient que ces nombres, la liste des semaines et la version de la fonction : ni identifiant, ni adresse, ni prénom, ni date de naissance (liste blanche testée).
- Les comptes de test (le compte fictif du DG) sont retirés de tous les totaux ; leur nombre est envoyé (`comptes_exclus`).
- Rien n'est écrit dans Firebase. Le compte de service n'a que des droits de lecture.
- Ce que la fonction reçoit et ce qu'elle garde : la fiche complète de chaque compte, dont elle ne garde que les dates et « adresse confirmée » ; si l'interrupteur est à `true`, l'heure des écritures et le texte entier des contrats, dont elle ne garde que les dates de début et de fin. Rien n'est gardé après le calcul. La partie chiffrée (carnet, case handicap, secret du lien) n'est jamais ouverte : aucune clé n'existe sur le serveur.
- Tout est compté avant l'envoi : un échec en route n'envoie rien. Aucun nouvel essai automatique.

## 2. Décision à prendre : les totaux des données confiées
Contrats, liens des parents et dates d'écriture sont des données que l'AM confie à Arvela « pour son compte ». Le contrat de traitement des Conditions dit : « Arvela n'utilise ces données que pour faire ce que décrit ce contrat, et ce que tu fais toi-même dans l'app. » Compter ces données pour Arvela n'y est pas écrit. Le RGPD impose au sous-traitant de ne traiter que sur instruction (article 28.3.a) ; un sous-traitant qui décide lui-même d'un usage en devient responsable (article 28.10). Les totaux des comptes ne posent pas cette question.
- **Choix C (réglage par défaut)** : mise en service tout de suite avec les seuls totaux des comptes. La base n'est pas lue ; le compte de service n'a pas besoin du droit de lecture de la base.
- **Choix A** : ajouter au contrat de traitement une phrase comme « Arvela compte chaque nuit des totaux anonymes, comme le nombre de contrats en cours ; aucun contenu n'est gardé ni transmis », et revoir dans Confidentialité la phrase « Il s'engage à ne la consulter qu'avec ton accord » (dire que ce comptage automatique est la seule exception), par une demande de fusion après la T-126 (nouvelle version des Conditions à accepter). Une fois fusionnée, dans cet ordre : (1) donner le droit de lecture de la base (étape 2) ; (2) passer `STATS_DONNEES_CONFIEES` à `true` (étape 3) ; (3) redéployer avec `functions:stats` seulement (étape 4). Dans l'autre ordre, la nuit suivante échoue : rien n'est envoyé, l'échec se lit au journal.
- **Choix B** : tout mettre en service sans changer les Conditions. Contraire au contrat de traitement tel qu'il est écrit.
- **Décision du DG du 26/11/2026 : choix A.** La phrase des Conditions sera ajoutée par une tâche séparée (T-128), après la fusion de la T-126. D'ici là, l'interrupteur reste éteint (réglage par défaut).

## 3. La séance commune (partie serveur de la copie scellée, et totaux)
Prérequis : forfait Blaze (déjà exigé par la T-125) ; outils `gcloud` et `firebase` connectés au compte d'administration (`gcloud auth login`, `firebase login`) ; copie à jour de la branche main de pilote-am ; Node 22 sur le PC ; pour la copie scellée, un serveur d'envoi SMTP choisi (docs/sequestre-kms.md, étape 4).

Node 20 n'est plus accepté par Google depuis le 30/10/2026 : les deux fonctions sont réglées en Node 22 (firebase.json).

Ce qui ne tient pas dans la séance : l'activation de la copie scellée demande ensuite une demande de fusion (clé publique dans `src/firebase-config.ts`, docs/sequestre-kms.md, étape 2) ; le choix A demande d'abord une demande de fusion des Conditions.

### Étape 1. Copie scellée : étapes 1 à 4 de docs/sequestre-kms.md
Clé KMS, droits, e-mails. Rien ne change pour la copie scellée.

### Étape 2. Compte de service des totaux (une fois)
```
gcloud iam service-accounts create arvela-stats --project arvela-app --display-name "Arvela : totaux de la nuit (lecture seule)"
gcloud projects add-iam-policy-binding arvela-app --member serviceAccount:arvela-stats@arvela-app.iam.gserviceaccount.com --role roles/firebaseauth.viewer
```
- `roles/firebaseauth.viewer` : lecture des comptes, sans modification. Suffit pour le choix C.
- Choix A seulement, une fois les Conditions fusionnées : ajouter la lecture de la base, sans écriture.
```
gcloud projects add-iam-policy-binding arvela-app --member serviceAccount:arvela-stats@arvela-app.iam.gserviceaccount.com --role roles/datastore.viewer
```
- Ne lui donner aucun autre rôle. Le droit d'appeler la fonction chaque nuit lui est donné par le déploiement lui-même. Un droit nouveau peut mettre quelques minutes à s'appliquer.

### Étape 3. Réglages : comptes de test et interrupteur
Dans la console Firebase › Authentication › Utilisateurs, copier l'« UID de l'utilisateur » du compte fictif. Créer sur le PC le fichier `functions/stats/.env.arvela-app` avec deux lignes :
```
STATS_COMPTES_EXCLUS=uid_du_compte_fictif
STATS_DONNEES_CONFIEES=false
```
Plusieurs comptes de test : séparer par des virgules. Aucun : laisser vide après le signe `=`. Choix A, plus tard : remplacer `false` par `true`. Ce fichier reste sur le PC (il est exclu du dépôt). Sans ce fichier, la commande de l'étape 4 pose les deux questions.

### Étape 4. Déployer en une commande
```
cd functions && npm install && cd stats && npm install && cd ../..
firebase deploy --only functions:sequestre,functions:stats,firestore:rules --project arvela-app
```
- `functions:sequestre` et `firestore:rules` : étape 5 de docs/sequestre-kms.md (avec le fichier `functions/.env` de la clé KMS).
- `functions:stats` : crée la fonction `statsNuit` et sa planification (une tâche Cloud Scheduler à Paris). Si l'outil propose d'activer des services Google (Cloud Scheduler, Cloud Run, Cloud Build, Artifact Registry), répondre oui. S'il demande combien de jours garder les anciennes images, répondre 1.
- Plus tard, pour changer un réglage de l'étape 3 : `firebase deploy --only functions:stats --project arvela-app`.

### Étape 5. Vérifier tout de suite (sans attendre 5 h)
```
gcloud scheduler jobs run firebase-schedule-statsNuit-europe-west9 --location europe-west9 --project arvela-app
```
Puis, une minute après :
- PostHog › Activité : un événement `stats_jour` de `arvela-serveur`, avec `inscrites_total` égal au nombre de comptes de la console moins les comptes exclus ;
- journal : `firebase functions:log --only statsNuit --project arvela-app` (ligne « stats_jour envoyé », totaux seulement).
Le nom exact de la tâche se lit dans Google Cloud › Cloud Scheduler (bouton « Forcer l'exécution » au même endroit).
Cet essai crée un second événement ce jour-là. Dans un tableau de bord, prendre toujours la dernière valeur du jour, jamais la somme.

## 4. Coût estimé par nuit
Choix C : aucune lecture de la base. La lecture des comptes (Firebase Authentication) est gratuite.

Choix A. Prix officiels (page Firestore lue le 26/11/2026) : à Paris, 0,036 $ les 100 000 lectures, 50 000 lectures gratuites par jour, partagées avec l'app. Chaque document rendu est une lecture ; une requête sans résultat en coûte une ; un comptage, une par tranche de 1 000.
Lectures : environ 3 par compte (dernière écriture : 1 dans le cas courant ; contrats : 1 par contrat, au moins 1), plus 2 pour les liens. Un compte dont les derniers documents écrits sont tous techniques en coûte quelques-unes de plus : ces documents sont peu nombreux (un repère par appareil, réécrit chaque jour ; le coffre ; la copie scellée ; un paquet par clé d'accès), soit au plus une dizaine de lectures pour ce compte.

| Comptes | Lectures par nuit | Coût si tout est payant | Coût réel |
|---|---|---|---|
| 10 | environ 30 | 0,000 01 $ | 0 (part gratuite) |
| 1 000 | environ 3 000 | 0,001 $ | 0 tant que l'app et la fonction restent sous 50 000 lectures par jour |
| 10 000 | environ 30 000 (au plus 100 000) | 0,011 $ (au plus 0,036 $) | de 0,33 $ à 1,1 $ par mois |

Le reste est dans les parts gratuites : une exécution de moins d'une minute par nuit (Cloud Run functions), une tâche Cloud Scheduler (3 gratuites par compte de facturation ; la copie scellée n'en utilise pas), 30 à 60 événements par mois chez PostHog (1 million gratuits).

## 5. Retour arrière
```
firebase functions:delete statsNuit --region europe-west9 --project arvela-app
gcloud iam service-accounts delete arvela-stats@arvela-app.iam.gserviceaccount.com --project arvela-app
```
La fonction, sa planification et le compte de service disparaissent. Supprimer aussi `functions/stats/.env.arvela-app` du PC. Pour ne plus la redéployer par erreur : demande de fusion qui retire la ligne `stats` de firebase.json. Rien d'autre n'est touché : elle n'a rien écrit. Les événements `stats_jour` déjà reçus restent dans PostHog (gardés 1 an, réglage du projet).

## 6. Limites à connaître
- « Connectée » et « active » sont des mesures du serveur : une AM qui utilise l'app sans réseau tout le mois n'apparaît qu'à son retour en ligne.
- Une migration automatique faite par l'app sur des données saisies (par exemple le chiffrement de la T-121) compte comme une écriture le jour où elle a lieu.
- Une semaine compte les comptes encore existants : un compte supprimé disparaît de sa semaine d'inscription.
- Un compte supprimé depuis la console Firebase (et non depuis l'app) laisse ses liens parents en place : ils restent ouverts aux parents et comptés comme actifs. Supprimer un compte depuis l'app coupe ses liens.
- Le premier événement arrive à la première nuit après le déploiement, ou tout de suite par l'étape 5.
- Vérifié seulement en ligne, à l'étape 5 : le déploiement en Node 22, la création de la tâche Cloud Scheduler, les droits réels du compte de service, la réception par PostHog. Les requêtes n'exigent aucun index composé (vérifié dans le code : un seul champ filtré ou trié par requête).
- Les tests sur émulateurs (`cd functions/stats && npm run test:emulateurs`) ne tournent pas encore à chaque envoi sur GitHub : à ajouter au fichier des contrôles après la T-126.
- Dépendances : `npm audit` signale 9 failles modérées, toutes dues à d'anciennes versions de `uuid` tirées par firebase-admin 13 (mêmes versions que la copie scellée). Elles ne touchent que les versions 3, 5 et 6 de `uuid` appelées avec un tampon fourni, sans effet ici. Le correctif demande firebase-admin 14 et firebase-functions 7 : à faire avec la copie scellée, dans une tâche à part.
