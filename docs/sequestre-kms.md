# Copie de secours scellée (T-125, point 4) : ce que fait le DG

Séance commune avec les totaux de la nuit (T-127) : suivre docs/stats.md, section 3, qui reprend ces étapes dans l'ordre. Node 20 n'étant plus accepté par Google depuis le 30/10/2026, la fonction est réglée en Node 22 (firebase.json).

Décision du DG du 26/11/2026. Le code est prêt (app : src/sync/sequestre.ts ; serveur : functions/sequestre.js). Rien n'est actif tant que les étapes ci-dessous ne sont pas faites : l'app ne scelle rien sans la clé publique.

Sigles : KMS (Key Management Service, service de clés de Google Cloud), HSM (module matériel de sécurité, boîtier qui garde la clé), IAM (gestion des droits de Google Cloud).

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
Installer l'extension Firebase « Trigger Email from Firestore » (collection `mail`, un serveur d'envoi SMTP à fournir : nouveau sous-traitant à nommer au registre). **Obligatoire avant d'activer** (avant de coller la clé publique) : sans elle, aucun e-mail ne part et l'AM ne serait pas prévenue d'une demande. Les fonctions refusent tout compte sans adresse confirmée ; elles ne peuvent pas vérifier que l'extension tourne : faire une demande d'essai et vérifier l'e-mail reçu.

## 5. Déployer
```
cd functions && npm install && cd ..
firebase deploy --only functions:sequestre --project arvela-app
```
avec la variable `SEQUESTRE_CLE_KMS=projects/arvela-app/locations/europe-west9/keyRings/arvela/cryptoKeys/sequestre/cryptoKeyVersions/1` (fichier `functions/.env`).
Publier aussi les règles Firestore (`firebase deploy --only firestore:rules`) : elles ferment `sequestre-demandes`, `sequestre-journal` et `mail` aux clients, et protègent `kv~coffre`.

## 6. Ce que garantit le montage
- La clé privée ne sort jamais du boîtier HSM. Seules les fonctions demandent un déchiffrement, et seulement : pour l'AM connectée avec une adresse confirmée et une connexion de moins d'une heure, sur sa propre copie, 72 heures après sa demande (annulable depuis chacun de ses téléphones), avec un e-mail à chaque demande, annulation et ouverture, et une trace de chaque étape ; si l'adresse du compte change, l'ancienne est prévenue et aucune demande n'est possible pendant 72 heures ; une seule ouverture par demande (transaction).
- À la suppression du compte, la fonction `sequestreNettoyage` efface demande, suivi d'adresse et journal du compte.
- Le contenu scellé porte l'identifiant du compte : copié dans un autre compte, il ne s'ouvre pas.
- Limite à connaître : quiconque a le contrôle du compte Google Cloud d'Arvela (droits IAM, code des fonctions) peut techniquement faire déchiffrer une copie. C'est pourquoi la double authentification des comptes d'administration (AIPD, mesure 1) est indispensable.
- Limite : l'adresse du compte n'est suivie qu'à partir de l'activation (premier branchement d'un téléphone à jour après le collage de la clé publique). Si un voleur du mot de passe changeait l'adresse avant, elle serait prise comme la bonne. Activer vite après la fusion réduit cette fenêtre.
- Déploiement : la fonction de nettoyage `sequestreNettoyage` est de 1re génération, placée en `europe-west9`. Si cette région la refuse, le déploiement échoue de façon visible : la placer dans une autre région de l'Union européenne (par exemple `europe-west1`).
