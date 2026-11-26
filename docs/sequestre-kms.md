# Copie de secours scellée (T-125, point 4) : ce que fait le DG

Séance commune avec les totaux de la nuit (T-127) : suivre docs/stats.md, section 3, qui reprend ces étapes dans l'ordre. Node 20 n'étant plus accepté par Google depuis le 30/10/2026, la fonction est réglée en Node 22 (firebase.json).

Décision du DG du 26/11/2026. Le code est prêt (app : src/sync/sequestre.ts ; serveur : functions/sequestre.js). Rien n'est actif tant que les étapes ci-dessous ne sont pas faites : l'app ne scelle rien sans la clé publique.

Sigles : KMS (Key Management Service, service de clés de Google Cloud), HSM (module matériel de sécurité, boîtier qui garde la clé), IAM (gestion des droits de Google Cloud).

## État au 26/11/2026 (direction, autorisation du DG)
Fait : API Cloud KMS ; trousseau `arvela` et clé `sequestre` (HSM, europe-west9, version 1 active) ; compte `sequestre@arvela-app.iam.gserviceaccount.com` avec `cloudkms.cryptoKeyDecrypter` sur la clé, `datastore.user` et `logging.logWriter` ; clé publique dans src/firebase-config.ts (T-125, activation). Service d'e-mails : la boîte OVHcloud d'Arvela, en direct depuis les fonctions (étape 4 ; Brevo écarté le 26/11/2026, il exigeait une adresse postale ; pas d'extension, elles s'arrêtent le 31/03/2027).

## 1. Prérequis
- Projet Firebase `arvela-app` au forfait Blaze (paiement à l'usage) : obligatoire pour les fonctions serveur et pour KMS.
- API Cloud KMS activée : `gcloud services enable cloudkms.googleapis.com --project arvela-app`.
- Vérifier dans la console que le niveau HSM est proposé en région `europe-west9` (Paris). Non vérifié par la session (pages Google inaccessibles).

## 2. Créer la clé (une fois)
```
gcloud kms keyrings create arvela --location europe-west9 --project arvela-app
gcloud kms keys create sequestre --keyring arvela --location europe-west9 --project arvela-app \
  --purpose asymmetric-encryption --default-algorithm rsa-decrypt-oaep-3072-sha256 --protection-level hsm
gcloud kms keys versions get-public-key 1 --key sequestre --keyring arvela --location europe-west9 --project arvela-app --output-file sequestre.pem
```
Coller le contenu de `sequestre.pem` (clé publique, pas un secret) dans `src/firebase-config.ts`, constante `SEQUESTRE_PEM`, par une demande de fusion contrôlée comme les autres.

Ne jamais : rendre la clé exportable, la détruire (les copies scellées deviendraient illisibles), donner le droit de déchiffrer à un compte humain.

## 3. Droits
Seul le compte de service des fonctions peut déchiffrer :
```
gcloud kms keys add-iam-policy-binding sequestre --keyring arvela --location europe-west9 --project arvela-app \
  --member serviceAccount:<compte de service des fonctions> --role roles/cloudkms.cryptoKeyDecrypter
```
Le compte de service des fonctions de 2e génération est par défaut `<numéro du projet>-compute@developer.gserviceaccount.com` ; mieux : un compte dédié `sequestre@arvela-app.iam.gserviceaccount.com`, déclaré dans la fonction.
Activer les journaux d'audit « Data Access » de Cloud KMS (IAM › Journaux d'audit) : chaque déchiffrement y est tracé en plus de `sequestre-journal`.

## 4. E-mails
Les fonctions envoient elles-mêmes les e-mails par la boîte OVHcloud d'Arvela (registre, A4) : `smtp.mail.ovh.net`, port 465 (SSL/TLS), identifiant `contact@arvela.fr`, expéditeur `Arvela <contact@arvela.fr>` (OVHcloud n'envoie qu'au nom du compte connecté). Aucune extension : les extensions Firebase s'arrêtent le 31/03/2027. Aucun réglage DNS à ajouter : le SPF d'arvela.fr autorise déjà `mx.ovh.com` (DMARC en quarantaine). Limite d'OVHcloud : environ 200 e-mails par heure et par boîte.

Mot de passe de la boîte, une fois, saisi par le DG à l'invite masquée (jamais écrit ailleurs) :
```
firebase functions:secrets:set SEQUESTRE_SMTP_MOT_DE_PASSE --project arvela-app
```
Règle de sûreté : l'e-mail de prévenance part avant la demande ; s'il ne part pas, aucune demande n'est créée (l'AM est toujours prévenue). Les e-mails d'annulation, d'ouverture et de changement d'adresse ne bloquent pas le geste ; un échec est noté au journal (`sequestre-journal`). Aucune copie des e-mails n'est gardée dans la base.

Essai avant la fusion (une vraie demande n'est possible qu'après, l'app en ligne ne scellant rien sans la clé publique) : un e-mail envoyé à contact@arvela.fr avec ce secret, par un court script Node dans Cloud Shell, arrive ; après le déploiement de l'étape 5, `sequestreEtat` appelé sans connexion répond 401, et non 404.

## 5. Déployer
**Avant la fusion de la demande qui colle la clé publique** : déployer les fonctions et les règles depuis la branche de cette demande. Sinon l'AM verrait « Copie Arvela : oui » et un bouton « Récupérer par Arvela » qui échoue. Le compte qui déploie doit pouvoir agir au nom de `sequestre@` (rôle `iam.serviceAccountUser`, inclus dans « Propriétaire »).
```
cd functions && npm install && cd ..
firebase deploy --only functions:sequestre --project arvela-app
```
avec la variable `SEQUESTRE_CLE_KMS=projects/arvela-app/locations/europe-west9/keyRings/arvela/cryptoKeys/sequestre/cryptoKeyVersions/1` (fichier `functions/.env`). Le secret de l'étape 4 doit exister avant ; vérifier après le déploiement que `sequestre@` peut le lire (`gcloud secrets get-iam-policy SEQUESTRE_SMTP_MOT_DE_PASSE --project arvela-app`), sinon lui donner `roles/secretmanager.secretAccessor` sur ce seul secret.
Publier aussi les règles Firestore (`firebase deploy --only firestore:rules`) : elles ferment `sequestre-demandes`, `sequestre-journal` et `mail` aux clients, et protègent `kv~coffre`.

## 6. Ce que garantit le montage
- La clé privée ne sort jamais du boîtier HSM. Seules les fonctions demandent un déchiffrement, et seulement : pour l'AM connectée avec une adresse confirmée et une connexion de moins d'une heure, sur sa propre copie, 72 heures après sa demande (annulable depuis chacun de ses téléphones), avec un e-mail à chaque demande, annulation et ouverture, et une trace de chaque étape ; si l'adresse du compte change, l'ancienne est prévenue et aucune demande n'est possible pendant 72 heures ; une seule ouverture par demande (transaction).
- À la suppression du compte, la fonction `sequestreNettoyage` efface demande, suivi d'adresse et journal du compte.
- Le contenu scellé porte l'identifiant du compte : copié dans un autre compte, il ne s'ouvre pas.
- Limite à connaître : quiconque a le contrôle du compte Google Cloud d'Arvela (droits IAM, code des fonctions) peut techniquement faire déchiffrer une copie. C'est pourquoi la double authentification des comptes d'administration (AIPD, mesure 1) est indispensable.
- Limite : l'adresse du compte n'est suivie qu'à partir de l'activation (premier branchement d'un téléphone à jour après le collage de la clé publique). Si un voleur du mot de passe changeait l'adresse avant, elle serait prise comme la bonne. Activer vite après la fusion réduit cette fenêtre.
- Déploiement : la fonction de nettoyage `sequestreNettoyage` est de 1re génération, placée en `europe-west9`. Si cette région la refuse, le déploiement échoue de façon visible : la placer dans une autre région de l'Union européenne (par exemple `europe-west1`).
