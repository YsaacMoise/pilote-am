// T-127 : lecture des totaux dans Firebase, en lecture seule (testée sur les émulateurs : functions/stats/test/emulateurs.test.js).
//
// Ce module ne fait que des lectures : liste des comptes (Firebase Authentication), requêtes et comptages (Firestore). Aucun
// appel d'écriture n'y figure (test « aucune écriture » : relevé de la base avant et après, et recherche dans ce fichier).
// Ce que la fonction reçoit, et ce qu'elle en garde :
// - comptes : la fiche complète de chaque compte (outil d'administration) ; elle n'en garde que l'uid (pour les requêtes), la
//   date de création, la dernière connexion ou le dernier renouvellement de session, et « adresse confirmée » oui ou non ;
// - seulement si `donneesConfiees` est vrai (décision du DG, docs/stats.md, section 2) :
//   - l'heure serveur `t` des documents écrits dans les 30 derniers jours (champ `t` seul, par projection) ;
//   - le texte entier de chaque contrat, dont elle ne garde que les dates de début et de fin, le temps du calcul ;
//   - un comptage des liens parents, et le champ `revoque` des liens des seuls comptes de test.
// Rien n'est écrit, rien n'est gardé après le calcul. La partie chiffrée (`sante`) n'est jamais ouverte : aucune clé n'existe
// sur le serveur.
import { Timestamp } from 'firebase-admin/firestore';
import { JOUR_MS, contratEnCours, datesContrat, dernierPassage, estRepere, jourParis, totauxComptes } from './calcul.js';

/**
 * Tailles des pages pour chercher la dernière écriture d'un compte, documents techniques sautés. Chaque document rendu est une
 * lecture payée : la première page n'en prend qu'un (le cas courant : la dernière écriture est une donnée saisie), puis 4, puis 16.
 */
const PAGES = [1, 4, 16];
/** Comptes traités en même temps. */
const EN_PARALLELE = 20;

/**
 * Heure (ms) de la dernière écriture d'un compte depuis `depuis`, hors repères d'appareil ; null s'il n'y en a pas.
 * Requête sur le seul champ `t` (index simple automatique) : aucun index composé à créer.
 */
async function derniereEcriture(col, depuis) {
  const base = col.where('t', '>=', Timestamp.fromMillis(depuis)).orderBy('t', 'desc').select('t');
  let apres = null;
  for (let i = 0; ; i++) {
    const taille = PAGES[Math.min(i, PAGES.length - 1)];
    const page = await (apres ? base.startAfter(apres) : base).limit(taille).get();
    for (const d of page.docs) if (!estRepere(d.id)) return d.get('t').toMillis();
    if (page.size < taille) return null;
    apres = page.docs[page.docs.length - 1];
  }
}

/** Contrats d'un compte : présent (au moins un contrat non supprimé) et nombre de contrats en cours ce jour-là. */
async function contrats(col, jour) {
  const snap = await col.where('s', '==', 'contracts').select('v').get();
  let presents = 0;
  let enCours = 0;
  for (const d of snap.docs) {
    const dates = datesContrat(d.get('v'));
    if (!dates) continue;
    presents++;
    if (contratEnCours(dates, jour)) enCours++;
  }
  return { presents, enCours };
}

/** Liens parents actifs (non coupés) : tous les liens, moins les liens coupés, moins les liens actifs des comptes de test. */
async function liensActifs(db, exclus) {
  const tous = (await db.collection('partages').count().get()).data().count;
  const coupes = (await db.collection('partages').where('revoque', '==', true).count().get()).data().count;
  let deTest = 0;
  for (const uid of exclus) {
    const s = await db.collection('partages').where('owner', '==', uid).select('revoque').get();
    deTest += s.docs.filter((d) => d.get('revoque') !== true).length;
  }
  return tous - coupes - deTest;
}

/**
 * Totaux du jour. `auth` : firebase-admin/auth ; `db` : firebase-admin/firestore ; `maintenant` : ms ; `exclus` : Set d'uid ;
 * `donneesConfiees` : vrai pour lire aussi les données confiées par l'AM (sinon la base n'est pas lue du tout).
 * Rend des nombres seulement (et le tableau des semaines), jamais un identifiant.
 */
export async function collecter({ auth, db, maintenant, exclus, donneesConfiees = false }) {
  const comptes = [];
  let nbExclus = 0;
  let page;
  do {
    const r = await auth.listUsers(1000, page);
    for (const u of r.users) {
      if (exclus.has(u.uid)) { nbExclus++; continue; }
      const creation = Date.parse(u.metadata?.creationTime ?? '');
      comptes.push({ uid: u.uid, creation: Number.isFinite(creation) ? creation : null, passage: dernierPassage(u.metadata), verifie: u.emailVerified === true });
    }
    page = r.pageToken;
  } while (page);

  const totaux = { ...totauxComptes(comptes, maintenant), comptes_exclus: nbExclus };
  if (!donneesConfiees) return totaux;

  const jour = jourParis(maintenant);
  const depuis7 = maintenant - 7 * JOUR_MS;
  const depuis30 = maintenant - 30 * JOUR_MS;
  let actives7 = 0, actives30 = 0, avecContrat = 0, enCours = 0;
  for (let i = 0; i < comptes.length; i += EN_PARALLELE) {
    await Promise.all(comptes.slice(i, i + EN_PARALLELE).map(async ({ uid }) => {
      const col = db.collection('users').doc(uid).collection('data');
      const [derniere, c] = await Promise.all([derniereEcriture(col, depuis30), contrats(col, jour)]);
      if (derniere !== null && derniere <= maintenant) {
        actives30++;
        if (derniere >= depuis7) actives7++;
      }
      if (c.presents > 0) avecContrat++;
      enCours += c.enCours;
    }));
  }

  return {
    ...totaux,
    actives_7j: actives7,
    actives_30j: actives30,
    comptes_avec_contrat: avecContrat,
    contrats_en_cours: enCours,
    liens_parents_actifs: await liensActifs(db, exclus),
  };
}

/** Adresse d'envoi de PostHog, serveurs de l'Union européenne (Francfort), comme l'app (src/analytics.ts). */
export const POSTHOG_URL = 'https://eu.i.posthog.com/i/v0/e/';

/** Envoie l'événement. Une réponse en erreur arrête la fonction (visible dans les journaux de Google Cloud). */
export async function envoyer(evenement, faire = fetch) {
  const r = await faire(POSTHOG_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evenement) });
  if (!r.ok) throw new Error(`PostHog a répondu ${r.status}`);
}
