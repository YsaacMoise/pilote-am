// T-125, point 4 (décision du DG du 26/11/2026) : fonctions serveur de la copie de secours scellée.
// Non déployées par la session : le DG crée la clé KMS, donne les droits et déploie (docs/sequestre-kms.md).
//
// La clé privée KMS (asymétrique, RSA-OAEP 3072 SHA-256, niveau HSM, région europe-west9) ne sort jamais du boîtier. Ces
// fonctions sont le seul chemin qui lui demande de déchiffrer, et seulement :
//   - pour l'AM connectée à son compte (jeton Firebase), sur sa propre copie (users/{uid}/data/kv~sequestre) ;
//   - après une demande, un délai de 72 heures et un e-mail à chaque demande, annulation possible ;
//   - avec une trace de chaque demande, annulation et ouverture (collection sequestre-journal, fermée aux clients).
// Le contenu déchiffré n'est rendu que s'il porte l'identifiant de ce compte.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { DELAI_MS, contenuValide, etatDemande } from './regles.js';

initializeApp();
const db = getFirestore();
const kms = new KeyManagementServiceClient();
/** Version de la clé KMS : projects/arvela-app/locations/europe-west9/keyRings/arvela/cryptoKeys/sequestre/cryptoKeyVersions/1 */
const CLE = process.env.SEQUESTRE_CLE_KMS;
const opts = { region: 'europe-west9', enforceAppCheck: false };

function compte(req) {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Connecte-toi.');
  return { uid: req.auth.uid, email: req.auth.token.email };
}
const demandeRef = (uid) => db.doc(`sequestre-demandes/${uid}`);
const journal = (uid, quoi) => db.collection('sequestre-journal').add({ uid, quoi, quand: FieldValue.serverTimestamp() });
/** E-mail par l'extension « Trigger Email » (collection mail), installée par le DG. */
const mail = (to, subject, text) => (to ? db.collection('mail').add({ to, message: { subject, text } }) : null);
const lireSequestre = async (uid) => {
  const d = await db.doc(`users/${uid}/data/kv~sequestre`).get();
  const v = d.exists && typeof d.data().v === 'string' ? JSON.parse(d.data().v).v : null;
  return v && typeof v.c === 'string' ? v : null;
};

export const sequestreDemander = onCall(opts, async (req) => {
  const { uid, email } = compte(req);
  if (!(await lireSequestre(uid))) throw new HttpsError('failed-precondition', 'Aucune copie scellée.');
  const cur = (await demandeRef(uid).get()).data();
  const etat = etatDemande(cur, Date.now());
  if (etat === 'attente' || etat === 'prete') return { pret: cur.pret };
  const pret = Date.now() + DELAI_MS;
  await demandeRef(uid).set({ cree: Date.now(), pret, ouverte: false, annulee: false });
  await journal(uid, 'demande');
  await mail(email, 'Arvela : demande d’ouverture de ta clé de secours',
    `Une demande d’ouverture de ta clé de secours a été faite depuis ton compte. Elle sera possible le ${new Date(pret).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Si ce n’est pas toi, ouvre Arvela et annule-la, puis change ton mot de passe.`);
  return { pret };
});

export const sequestreEtat = onCall(opts, async (req) => {
  const { uid } = compte(req);
  const cur = (await demandeRef(uid).get()).data();
  const etat = etatDemande(cur, Date.now());
  return etat === 'attente' || etat === 'prete' ? { pret: cur.pret } : { pret: null };
});

export const sequestreAnnuler = onCall(opts, async (req) => {
  const { uid, email } = compte(req);
  await demandeRef(uid).set({ annulee: true }, { merge: true });
  await journal(uid, 'annulation');
  await mail(email, 'Arvela : demande annulée', 'La demande d’ouverture de ta clé de secours a été annulée.');
  return { ok: true };
});

export const sequestreOuvrir = onCall(opts, async (req) => {
  const { uid, email } = compte(req);
  const cur = (await demandeRef(uid).get()).data();
  if (etatDemande(cur, Date.now()) !== 'prete') throw new HttpsError('failed-precondition', 'Pas encore.');
  const s = await lireSequestre(uid);
  if (!s || !CLE) throw new HttpsError('failed-precondition', 'Aucune copie scellée.');
  const [res] = await kms.asymmetricDecrypt({ name: CLE, ciphertext: Buffer.from(s.c, 'base64url') });
  const contenu = JSON.parse(Buffer.from(res.plaintext).toString('utf8'));
  if (!contenuValide(contenu, uid, s.coffre)) throw new HttpsError('permission-denied', 'Cette copie n’est pas celle de ce compte.');
  await demandeRef(uid).set({ ouverte: true, ouverteLe: Date.now() }, { merge: true });
  await journal(uid, 'ouverture');
  await mail(email, 'Arvela : clé de secours ouverte', 'Ta clé de secours a été ouverte depuis ton compte. Si ce n’est pas toi, écris à contact@arvela.fr.');
  return contenu;
});
