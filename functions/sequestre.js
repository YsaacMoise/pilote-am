// T-125, point 4 (décision du DG du 26/11/2026) : fonctions serveur de la copie de secours scellée.
// Clé KMS, compte de service et droits créés par la direction le 26/11/2026 (docs/sequestre-kms.md).
//
// La clé privée KMS (asymétrique, RSA-OAEP 3072 SHA-256, niveau HSM, région europe-west9) ne sort jamais du boîtier. Ces
// fonctions sont le seul chemin qui lui demande de déchiffrer, et seulement :
//   - pour l'AM connectée à son compte (jeton Firebase), sur sa propre copie (users/{uid}/data/kv~sequestre) ;
//   - après une demande, un délai de 72 heures et un e-mail à chaque demande, annulation possible ;
//   - avec une trace de chaque demande, annulation et ouverture (collection sequestre-journal, fermée aux clients).
// Le contenu déchiffré n'est rendu que s'il porte l'identifiant de ce compte.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as functionsV1 from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { DELAI_MS, contenuValide, decisionAdresse, etatDemande } from './regles.js';

initializeApp();
const db = getFirestore();
const kms = new KeyManagementServiceClient();
/** Version de la clé KMS : projects/arvela-app/locations/europe-west9/keyRings/arvela/cryptoKeys/sequestre/cryptoKeyVersions/1 */
const CLE = process.env.SEQUESTRE_CLE_KMS;
// T-129 : compte de service dédié (droits : déchiffrer avec cette seule clé, lire et écrire la base, écrire les journaux).
const COMPTE = 'sequestre@arvela-app.iam.gserviceaccount.com';
const opts = { region: 'europe-west9', enforceAppCheck: false, serviceAccount: COMPTE };

/**
 * Compte connecté, avec une adresse e-mail confirmée (relecture T-125, M2 et M6) : sans elle, aucun e-mail de prévenance ne
 * pourrait partir, donc rien ne se fait.
 */
function compte(req) {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Connecte-toi.');
  const t = req.auth.token;
  if (!t.email || t.email_verified !== true) throw new HttpsError('failed-precondition', 'Confirme d’abord ton adresse e-mail.');
  return { uid: req.auth.uid, email: t.email, authTime: Number(t.auth_time ?? 0) * 1000 };
}
const compteRef = (uid) => db.doc(`sequestre-comptes/${uid}`);
/**
 * Adresse e-mail du compte suivie (relecture T-125, M2) : si elle change, l'ancienne adresse est prévenue et aucune demande
 * n'est possible pendant le délai de sécurité. Un voleur du mot de passe qui change l'adresse ne gagne donc rien.
 */
async function adresseStable(uid, email) {
  const cur = (await compteRef(uid).get()).data();
  const d = decisionAdresse(cur, email, Date.now());
  if (d === 'noter') { const t = Date.now(); await compteRef(uid).set({ email, depuis: t, premier: t }); return true; }
  if (d === 'changee') {
    await mail(cur.email, 'Arvela : adresse de ton compte changée', `L’adresse de ton compte Arvela est devenue ${email}. Si ce n’est pas toi, écris à contact@arvela.fr.`);
    await compteRef(uid).set({ email, depuis: Date.now(), premier: cur.premier, ancienne: cur.email });
    await journal(uid, 'adresse changée');
    return false;
  }
  return d === 'ok';
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
  if (!(await adresseStable(uid, email))) throw new HttpsError('failed-precondition', 'Adresse e-mail changée récemment : réessaie dans 72 heures.');
  // Pas de rafale de demandes et d'annulations (relecture T-125, m5).
  if (cur?.annuleeLe && Date.now() - cur.annuleeLe < 10 * 60 * 1000) throw new HttpsError('resource-exhausted', 'Réessaie dans quelques minutes.');
  const pret = Date.now() + DELAI_MS;
  await demandeRef(uid).set({ cree: Date.now(), pret, ouverte: false, annulee: false, email });
  await journal(uid, 'demande');
  await mail(email, 'Arvela : demande d’ouverture de ta clé de secours',
    `Une demande d’ouverture de ta clé de secours a été faite depuis ton compte. Elle sera possible le ${new Date(pret).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Si ce n’est pas toi, ouvre Arvela et annule-la, puis change ton mot de passe.`);
  return { pret };
});

export const sequestreEtat = onCall(opts, async (req) => {
  // Appelé au branchement de chaque téléphone : l'adresse du compte est notée dès là, avant toute demande (relecture R1),
  // même si elle n'est pas encore confirmée.
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Connecte-toi.');
  const uid = req.auth.uid;
  if (req.auth.token.email) await adresseStable(uid, req.auth.token.email);
  const cur = (await demandeRef(uid).get()).data();
  const etat = etatDemande(cur, Date.now());
  return etat === 'attente' || etat === 'prete' ? { pret: cur.pret } : { pret: null };
});

export const sequestreAnnuler = onCall(opts, async (req) => {
  const { uid, email } = compte(req);
  const cur = (await demandeRef(uid).get()).data();
  const etat = etatDemande(cur, Date.now());
  if (etat !== 'attente' && etat !== 'prete') return { ok: true };
  await demandeRef(uid).set({ annulee: true, annuleeLe: Date.now() }, { merge: true });
  await journal(uid, 'annulation');
  await mail(email, 'Arvela : demande annulée', 'La demande d’ouverture de ta clé de secours a été annulée.');
  return { ok: true };
});

export const sequestreOuvrir = onCall(opts, async (req) => {
  const { uid, email, authTime } = compte(req);
  // Connexion récente exigée pour ouvrir (relecture T-125, M2) : une session restée ouverte ne suffit pas.
  if (Date.now() - authTime > 60 * 60 * 1000) throw new HttpsError('unauthenticated', 'Reconnecte-toi, puis recommence.');
  // Copie et clé vérifiées avant de prendre la demande (relecture r4).
  const s = await lireSequestre(uid);
  if (!s || !CLE) throw new HttpsError('failed-precondition', 'Aucune copie scellée.');
  // La demande est prise par une transaction : deux appels ne l'ouvrent pas deux fois, une annulation l'emporte (m1).
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(demandeRef(uid))).data();
    if (etatDemande(cur, Date.now()) !== 'prete' || cur.email !== email) throw new HttpsError('failed-precondition', 'Pas encore.');
    tx.set(demandeRef(uid), { ouverte: true, ouverteLe: Date.now() }, { merge: true });
  });
  let contenu;
  try {
    const [res] = await kms.asymmetricDecrypt({ name: CLE, ciphertext: Buffer.from(s.c, 'base64url') });
    contenu = JSON.parse(Buffer.from(res.plaintext).toString('utf8'));
  } catch {
    await demandeRef(uid).set({ ouverte: false }, { merge: true });
    throw new HttpsError('internal', 'Ouverture impossible. Réessaie.');
  }
  if (!contenuValide(contenu, uid, s.coffre)) throw new HttpsError('permission-denied', 'Cette copie n’est pas celle de ce compte.');
  await journal(uid, 'ouverture');
  await mail(email, 'Arvela : clé de secours ouverte', 'Ta clé de secours a été ouverte depuis ton compte. Si ce n’est pas toi, écris à contact@arvela.fr.');
  return contenu;
});

/** Suppression du compte : demandes, suivi d'adresse et journal du compte effacés (relecture T-125, m6 ; registre). */
export const sequestreNettoyage = functionsV1.runWith({ serviceAccount: COMPTE }).region('europe-west9').auth.user().onDelete(async (u) => {
  await demandeRef(u.uid).delete();
  await compteRef(u.uid).delete();
  const j = await db.collection('sequestre-journal').where('uid', '==', u.uid).get();
  for (const d of j.docs) await d.ref.delete();
});
