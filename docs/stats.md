# Totaux exacts d'Arvela (T-127) : ce que fait le DG

Demande du DG du 26/11/2026 : un coin admin avec le nombre d'inscrites, d'utilisatrices et leur évolution. Le nombre de comptes ne dépend jamais de la mesure d'usage : il vient de Firebase. PostHog ne sert qu'à le recevoir et à afficher l'évolution.

Le code est prêt (functions/stats/). Rien ne tourne tant que les étapes ci-dessous ne sont pas faites. Une seule séance suffit pour la copie scellée (T-125, docs/sequestre-kms.md) et pour ces totaux : l'ordre est donné en section 3.

Sigles : uid (identifiant technique d'un compte Firebase), IAM (gestion des droits de Google Cloud), KMS (service de clés de Google Cloud).

## 1. Ce que fait la fonction
- Chaque nuit à 5 h (heure de Paris), la fonction `statsNuit` (région de Paris, europe-west9) compte, dans Firebase, en lecture seule :
  - comptes : total, nouveaux sur 1, 7 et 30 jours, adresses confirmées, inscriptions par semaine sur 26 semaines ;
  - connectées sur 7 et 30 jours : dernière connexion, ou dernier renouvellement de la session (Firebase le fait environ chaque heure quand l'app est ouverte et en ligne) ;
  - actives sur 7 et 30 jours : au moins une donnée écrite dans la période (le repère quotidien de chaque appareil ne compte pas) ;
  - comptes avec au moins un contrat, contrats en cours ce jour-là (même règle que l'app), liens des parents non coupés.
- Elle envoie à PostHog (serveurs à Francfort) un seul événement `stats_jour`, au nom fixe `arvela-serveur`. Il ne contient que ces nombres, la liste des semaines et la version de la fonction : ni identifiant, ni adresse, ni prénom, ni date de naissance (liste blanche testée).
- Les comptes de test (le compte fictif du DG) sont retirés de tous les totaux ; leur nombre est envoyé (`comptes_exclus`).
- Elle n'écrit rien dans Firebase. Son compte de service n'a que des droits de lecture : même une erreur de code ne pourrait rien modifier.
- Elle n'ouvre jamais la partie chiffrée (carnet, case handicap, secret du lien) : aucune clé n'existe sur le serveur. Du texte d'un contrat, elle ne garde que les dates de début et de fin, le temps du calcul.

## 2. Décision à prendre avant la mise en service
Contrats, liens des parents et dates d'écriture sont des données que l'AM confie à Arvela « pour son compte » (Conditions, contrat de traitement : « Arvela n'utilise ces données que pour faire ce que décrit ce contrat »). Les compter pour Arvela n'y est pas écrit. Les totaux des comptes (création, connexion, adresse confirmée) ne posent pas cette question : Arvela en est responsable.
- Choix A : ajouter une phrase au contrat de traitement des Conditions (par exemple : « Arvela compte chaque nuit des totaux anonymes, comme le nombre de contrats en cours ; aucun contenu n'est gardé ni transmis »), par une demande de fusion après la T-126, avec la nouvelle version des Conditions à accepter.
- Choix B : mettre en service tout de suite ; la page Confidentialité l'annonce déjà en une phrase.
- La session ne tranche pas. Le registre et l'AIPD notent ce point ouvert.

## 3. La séance commune (copie scellée et totaux)
Prérequis : forfait Blaze (déjà exigé par la T-125) ; outils `gcloud` et `firebase` connectés au compte d'administration (`gcloud auth login`, `firebase login`) ; copie à jour de la branche main de pilote-am ; Node 22 sur le PC.

Node 20 n'est plus accepté par Google depuis le 30/10/2026 : les deux fonctions sont réglées en Node 22 (firebase.json).

### Étape 1. Copie scellée : étapes 1 à 4 de docs/sequestre-kms.md
Clé KMS, droits, e-mails. Rien ne change pour la copie scellée.

### Étape 2. Compte de service des totaux (une fois)
```
gcloud iam service-accounts create arvela-stats --project arvela-app --display-name "Arvela : totaux de la nuit (lecture seule)"
gcloud projects add-iam-policy-binding arvela-app --member serviceAccount:arvela-stats@arvela-app.iam.gserviceaccount.com --role roles/datastore.viewer
gcloud projects add-iam-policy-binding arvela-app --member serviceAccount:arvela-stats@arvela-app.iam.gserviceaccount.com --role roles/firebaseauth.viewer
```
- `roles/datastore.viewer` : lecture de la base, sans écriture. `roles/firebaseauth.viewer` : lecture des comptes, sans modification.
- Ne lui donner aucun autre rôle. Le droit d'appeler la fonction chaque nuit lui est donné par le déploiement lui-même.

### Étape 3. Comptes de test à exclure
Dans la console Firebase › Authentication › Utilisateurs, copier l'« UID de l'utilisateur » du compte fictif. Créer sur le PC le fichier `functions/stats/.env.arvela-app` avec une seule ligne :
```
STATS_COMPTES_EXCLUS=uid_du_compte_fictif
```
Plusieurs comptes : séparer par des virgules. Aucun : laisser vide après le signe `=`. Ce fichier reste sur le PC (il est exclu du dépôt). Sans ce fichier, la commande de l'étape 4 pose la question : coller l'uid, ou appuyer sur Entrée.

### Étape 4. Déployer en une commande
```
cd functions && npm install && cd stats && npm install && cd ../..
firebase deploy --only functions:sequestre,functions:stats,firestore:rules --project arvela-app
```
- `functions:sequestre` et `firestore:rules` : étape 5 de docs/sequestre-kms.md (avec le fichier `functions/.env` de la clé KMS).
- `functions:stats` : crée la fonction `statsNuit` et sa planification (une tâche Cloud Scheduler à Paris). Si l'outil propose d'activer des services Google (Cloud Scheduler, Cloud Run, Cloud Build, Artifact Registry), répondre oui. S'il demande combien de jours garder les anciennes images, répondre 1.

### Étape 5. Vérifier tout de suite (sans attendre 5 h)
```
gcloud scheduler jobs run firebase-schedule-statsNuit-europe-west9 --location europe-west9 --project arvela-app
```
Puis, une minute après :
- PostHog › Activité : un événement `stats_jour` de `arvela-serveur`, avec `inscrites_total` égal au nombre de comptes de la console moins les comptes exclus ;
- journal : `firebase functions:log --only statsNuit --project arvela-app` (ligne « stats_jour envoyé », totaux seulement).
Le nom exact de la tâche se lit dans Google Cloud › Cloud Scheduler (bouton « Forcer l'exécution » au même endroit).

## 4. Coût estimé par nuit
Prix officiels (page Firestore lue le 26/11/2026) : à Paris, 0,036 $ les 100 000 lectures, 50 000 lectures gratuites par jour, partagées avec l'app. Chaque requête coûte au moins une lecture ; un comptage, une lecture par tranche de 1 000.
Lectures : environ 3 par compte (dernière écriture : 1 ; contrats : 1 par contrat, au moins 1), plus 2 pour les liens. Au plus une quinzaine pour un compte qui ouvre l'app chaque jour sans rien saisir (repères d'appareil sautés par pages de 10).

| Comptes | Lectures par nuit | Coût si tout est payant | Coût réel |
|---|---|---|---|
| 10 | environ 35 | 0,000 01 $ | 0 (part gratuite) |
| 1 000 | environ 3 000 (au plus 15 000) | 0,001 $ (au plus 0,005 $) | 0 tant que l'app et la fonction restent sous 50 000 lectures par jour |
| 10 000 | environ 30 000 (au plus 150 000) | 0,011 $ (au plus 0,054 $) | au plus 0,33 $ par mois en usage normal |

Le reste est dans les parts gratuites : lecture des comptes (Firebase Authentication), une exécution de moins d'une minute par nuit (Cloud Run functions), une tâche Cloud Scheduler (3 gratuites par compte de facturation ; la copie scellée n'en utilise pas), 30 événements par mois chez PostHog (1 million gratuits).

## 5. Retour arrière
```
firebase functions:delete statsNuit --region europe-west9 --project arvela-app
```
La fonction et sa planification disparaissent. Rien d'autre n'est touché : elle n'a rien écrit. Les événements `stats_jour` déjà reçus restent dans PostHog (gardés 1 an, réglage du projet).

## 6. Limites à connaître
- « Connectée » et « active » sont des mesures du serveur : une AM qui utilise l'app sans réseau tout le mois n'apparaît qu'à son retour en ligne.
- Une migration automatique faite par l'app (par exemple le chiffrement de la T-121) compte comme une écriture le jour où elle a lieu.
- Une semaine compte les comptes encore existants : un compte supprimé disparaît de sa semaine d'inscription.
- Le premier événement arrive à la première nuit après le déploiement, ou tout de suite par l'étape 5.
- Les tests sur émulateurs (`cd functions/stats && npm run test:emulateurs`) ne tournent pas encore à chaque envoi sur GitHub : à ajouter au fichier des contrôles après la T-126.
