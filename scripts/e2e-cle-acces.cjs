// T-125 (consignes/t125-cle-sans-perte.md) : parcours automatisé des filets de la clé de secours, avec le faux service en
// ligne (scripts/fake-cloud.mjs) et l'authentificateur virtuel de Chromium (WebAuthn, extension PRF) à la place de Face ID.
// 1. Coffre créé : carte « Protège ta clé de secours » ; « Protéger avec Face ID » range un paquet (un document par clé
//    d'accès, kv/coffre intact, aucune clé en clair) ; la carte disparaît.
// 2. Nouveau téléphone relié au même trousseau (même authentificateur, données de l'app effacées) : « Ouvrir avec Face ID »
//    ouvre tout, sans rien taper.
// 3. Navigateur sans PRF : message clair, aucun paquet ; impression (feuille seule imprimée) puis e-mail (brouillon adressé à
//    soi-même, rien ne passe par Arvela) ; état des filets.
// Usage : VITE_FAKE_CLOUD=http://localhost:4180 npm run build ; node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 &
//         node scripts/e2e-cle-acces.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const cloud = process.env.CLOUD || 'http://localhost:4180';
const out = path.join(__dirname, 'out', 't125');
fs.mkdirSync(out, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}
async function attendre(page, fn, timeout, arg) {
  const fin = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg).catch(() => false)) return;
    if (Date.now() > fin) throw new Error('Délai dépassé en attendant : ' + fn.toString());
    await page.waitForTimeout(200);
  }
}
async function attendreQue(cond, timeout, msg) {
  const fin = Date.now() + timeout;
  for (;;) {
    if (await cond()) return;
    if (Date.now() > fin) throw new Error('Délai dépassé : ' + msg);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const post = (p, body) => fetch(cloud + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const dump = async (uid) => (await (await fetch(`${cloud}/dump?uid=${uid}`)).json()).docs;
const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const week = (start, end) => Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [{ start, end }]]));
const contrat = {
  id: 'c1', child: 'Lou', family: 'Petit', color: 1, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '17:00'), rateNet: 400, majoration: 10, entretienJour: 400, entretienMode: 'jour', repasPrix: 0, repasParJour: 0, repasParents: true,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: true, departement: '75', alsaceMoselle: false, mayotte: false, planningVariable: false,
  accueilOccasionnel: false, cdd: false, trackedFrom: '2026-09-01', accordSante: '2026-11-01',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0, cpSaisi: true }, history: [], createdAt: 1,
};
const j1 = { id: 'j1', cid: 'c1', date: today, time: '10:00', kind: 'soin', detail: 'Température 38,4 °C (fièvre)', temp: 38.4 };
const reglages = { k: 'settings', v: { amName: 'Sonia', enfantsACharge: 0, onboarded: true, conditionsAcceptees: { version: '2026-11-26-2', date: today } } };

async function telephone(b, nom, prf) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.erreurs = [];
  p.on('pageerror', (e) => p.erreurs.push(`${nom} : ${e.message}`));
  await p.goto(base);
  await p.waitForTimeout(600);
  // Face ID simulé : authentificateur de plateforme, vérification de l'utilisatrice acquise, PRF selon le cas.
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: prf } });
  return p;
}
async function semer(p, { donnees, ls, vider }) {
  await p.evaluate(async ({ donnees, ls, vider }) => {
    if (vider) {
      await new Promise((res) => { const r = indexedDB.deleteDatabase('pam-donnees'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
      localStorage.clear();
    }
    const db = await new Promise((res, rej) => { const r = indexedDB.open('pam-donnees', 1); r.onupgradeneeded = () => { for (const s of ['kv', 'contracts', 'days', 'leaves', 'bulletins', 'journal', 'feedback', 'usage', 'snapshots']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: { kv: 'k', days: 'key' }[s] ?? 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (Object.keys(donnees).length) await new Promise((res, rej) => {
      const tx = db.transaction(Object.keys(donnees), 'readwrite');
      for (const [s, vs] of Object.entries(donnees)) for (const v of vs) tx.objectStore(s).put(v);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  }, { donnees, ls, vider });
}
const lireLocal = (p, s, k) => p.evaluate(async ({ s, k }) => {
  const db = await new Promise((res) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); });
  return new Promise((res) => { const r = db.transaction(s).objectStore(s).get(k); r.onsuccess = () => res(r.result); });
}, { s, k });

(async () => {
  await post('/reset-all', {});
  const b = await chromium.launch();

  console.log('\n== Téléphone A : coffre créé, « Protéger avec Face ID » ==');
  const email = 'sonia-cle@exemple.fr';
  const { uid } = await post('/create', { email, password: 'Motdepasse-solide' });
  // Compte d'une version d'avant : mêmes données que le téléphone, à chiffrer par lui.
  const seed = (u) => post('/write', { uid: u, d: 'ancien', docs: [{ s: 'kv', k: 'settings', v: stable(reglages) }, { s: 'contracts', k: 'c1', v: stable(contrat) }, { s: 'journal', k: 'j1', v: stable(j1) }] });
  await seed(uid);
  const a = await telephone(b, 'A', true);
  const lsCompte = (u, e) => ({ 'pam-fake-user': JSON.stringify({ uid: u, email: e, verified: true }), 'pam-cloud-linked': u, 'pam-cloud-last': u, 'pam-mesure': 'non', 'pam-mesure-info': '1' });
  await semer(a, { donnees: { kv: [reglages], contracts: [contrat], journal: [j1] }, ls: lsCompte(uid, email) });
  await a.reload();
  await attendre(a, () => !!localStorage.getItem('pam-sante-chiffrement'), 30000);
  await a.goto(base + '#/');
  await a.getByText('Protège ta clé de secours').waitFor();
  await a.screenshot({ path: path.join(out, 'apres-aujourdhui-proteger-clair.png') });
  assert(!(await a.getByText('Pense à ta sauvegarde de la semaine').isVisible()), 'compte à jour, aucun filet : une seule carte « Protège ta clé de secours »');
  const coffreAvant = (await dump(uid)).find((d) => d.k === 'coffre');
  await a.getByRole('button', { name: 'Protéger avec Face ID' }).click();
  await attendreQue(async () => (await dump(uid)).some((d) => d.s === 'kv' && d.k.startsWith('cleacces-')), 20000, 'paquet rangé');
  const apres = await dump(uid);
  const paquet = apres.find((d) => d.s === 'kv' && d.k.startsWith('cleacces-'));
  const code = await a.evaluate((u) => JSON.parse(localStorage.getItem('pam-coffre'))[u][0], uid);
  const coffreApres = apres.find((d) => d.k === 'coffre');
  assert(!!paquet && !paquet.v.includes(code) && !paquet.v.includes(code.replace(/-/g, '')), 'un paquet par clé d’accès (kv/cleacces-…), sans la clé de secours en clair');
  assert(coffreApres.v === coffreAvant.v && coffreApres.t === coffreAvant.t, 'kv/coffre jamais modifié (règle Firestore de la T-121)');
  await a.goto(base + '#/');
  await a.waitForTimeout(800);
  assert(!(await a.getByText('Protège ta clé de secours').isVisible()), 'filet en place : la carte disparaît');
  await a.goto(base + '#/compte');
  await a.getByRole('heading', { name: 'Ta clé de secours' }).waitFor();
  await a.getByRole('heading', { name: 'Ta clé de secours' }).scrollIntoViewIfNeeded();
  await a.screenshot({ path: path.join(out, 'apres-compte-filets-clair.png') });
  const etatFilet = (p, nom) => p.locator('dl[aria-label="État des filets"] dt', { hasText: nom }).locator('xpath=following-sibling::dd[1]').textContent();
  assert(await etatFilet(a, 'Face ID') === 'oui', 'Compte : Face ID « oui », un état, sans texte d’explication');
  await attendreQue(async () => (await dump(uid)).some((d) => d.k === 'sequestre'), 15000, 'copie scellée');
  const seq = (await dump(uid)).find((d) => d.k === 'sequestre');
  assert(!seq.v.includes(code) && !seq.v.includes(code.replace(/-/g, '')) && JSON.parse(seq.v).v.coffre === JSON.parse(coffreApres.v).v.id, 'copie scellée chez Arvela (kv/sequestre) : clé KMS publique, rien en clair');
  await a.reload();
  await a.getByRole('heading', { name: 'Ta clé de secours' }).waitFor();
  await a.waitForTimeout(1000);
  assert(await etatFilet(a, 'Copie Arvela') === 'oui', 'Compte : copie Arvela « oui »');

  console.log('\n== Nouveau téléphone, même trousseau : « Ouvrir avec Face ID » ==');
  // Même page (même trousseau simulé : l'authentificateur virtuel ne peut pas être copié avec son secret PRF), données de
  // l'app effacées depuis une adresse de la même origine hors de l'app, qui ne garde donc pas la base ouverte.
  await a.goto(new URL('/vide', base).href);
  await semer(a, { donnees: { kv: [reglages] }, ls: { 'pam-fake-user': JSON.stringify({ uid, email, verified: true }), 'pam-cloud-pending': uid, 'pam-mesure': 'non', 'pam-mesure-info': '1' }, vider: true });
  await a.goto(base);
  await attendre(a, () => !!localStorage.getItem('pam-cloud-linked'), 30000);
  await a.goto(base + '#/');
  await a.waitForTimeout(1500);
  if (await a.getByRole('button', { name: 'Continuer' }).isVisible().catch(() => false)) await a.getByRole('button', { name: 'Continuer' }).click();
  await a.getByRole('button', { name: 'Ouvrir avec Face ID' }).first().waitFor();
  const scelle = await lireLocal(a, 'journal', 'j1');
  assert(!!scelle?.sante && scelle.temp === undefined, 'nouveau téléphone : carnet encore scellé');
  await a.screenshot({ path: path.join(out, 'apres-aujourdhui-ouvrir-clair.png') });
  await a.getByRole('button', { name: 'Ouvrir avec Face ID' }).first().click();
  await attendreQue(async () => (await lireLocal(a, 'journal', 'j1'))?.temp === 38.4, 20000, 'carnet ouvert');
  const c1 = await lireLocal(a, 'contracts', 'c1');
  assert(c1.majoreFiscal === true, 'Face ID suffit : carnet et case handicap ouverts, sans rien taper');

  console.log('\n== Navigateur sans PRF : message clair, puis impression et e-mail ==');
  const email2 = 'nadia-cle@exemple.fr';
  const u2 = (await post('/create', { email: email2, password: 'Motdepasse-solide' })).uid;
  await seed(u2);
  const c = await telephone(b, 'C', false);
  await semer(c, { donnees: { kv: [reglages], contracts: [contrat], journal: [j1] }, ls: lsCompte(u2, email2) });
  await c.reload();
  await attendre(c, () => !!localStorage.getItem('pam-sante-chiffrement'), 30000);
  await c.goto(base + '#/compte');
  await c.getByRole('button', { name: 'Protéger avec Face ID' }).click();
  await c.getByText('Face ID indisponible sur ce navigateur.').first().waitFor();
  await c.waitForTimeout(500);
  assert(!(await dump(u2)).some((d) => d.k.startsWith('cleacces-')), 'sans PRF : message clair, aucun paquet rangé');
  const code2 = await c.evaluate((u) => JSON.parse(localStorage.getItem('pam-coffre'))[u][0], u2);
  await c.evaluate(() => { window.__imprime = 0; window.print = () => { window.__imprime++; window.dispatchEvent(new Event('afterprint')); }; });
  await c.emulateMedia({ media: 'print' });
  await c.evaluate(() => { const o = window.print; window.print = () => { window.__feuille = getComputedStyle(document.querySelector('.feuille-cle')).visibility + '|' + document.querySelector('.feuille-cle .feuille-code').textContent + '|' + getComputedStyle(document.querySelector('.topbar')).visibility; o(); }; });
  await c.getByRole('button', { name: 'Imprimer ma clé' }).click();
  await attendre(c, () => window.__imprime > 0, 5000);
  const feuille = await c.evaluate(() => window.__feuille);
  await c.emulateMedia({ media: 'screen' });
  assert(feuille === `visible|${code2}|hidden`, 'impression : seule la feuille de la clé est imprimée, avec la clé');
  await c.getByRole('button', { name: 'Oui, imprimée' }).click();
  await c.getByRole('button', { name: 'Imprimer ma clé' }).waitFor();
  const lien = c.getByRole('link', { name: 'M’envoyer ma clé par e-mail' });
  const href = await lien.getAttribute('href');
  const body = decodeURIComponent(href.split('body=')[1] || '');
  assert(href.startsWith(`mailto:${encodeURIComponent(email2)}?`) && body.includes(code2), 'e-mail : brouillon adressé à elle-même, avec la clé (lien mailto, rien ne passe par Arvela)');
  await lien.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault()));
  await lien.click();
  await c.getByRole('button', { name: 'Oui, envoyé' }).click();
  await c.waitForTimeout(500);
  await c.getByRole('heading', { name: 'Ta clé de secours' }).scrollIntoViewIfNeeded();
  await c.screenshot({ path: path.join(out, 'apres-compte-sans-prf-clair.png') });
  await c.goto(base + '#/');
  await c.waitForTimeout(800);
  assert(!(await c.getByText('Protège ta clé de secours').isVisible()), 'filets e-mail et impression faits : plus de carte');
  const reg = JSON.parse((await dump(u2)).find((d) => d.k === 'settings').v).v;
  assert(reg.filets?.email === today && reg.filets?.impression === today && !stable(reg).includes(code2), 'filets notés dans les réglages (dates seulement, jamais la clé)');

  console.log('\n== Tout perdu (téléphone, trousseau, clé) : récupération par la copie scellée ==');
  const d = await telephone(b, 'D', false);
  await semer(d, { donnees: { kv: [reglages] }, ls: { 'pam-fake-user': JSON.stringify({ uid: u2, email: email2, verified: true }), 'pam-cloud-pending': u2, 'pam-mesure': 'non', 'pam-mesure-info': '1' } });
  await d.reload();
  await attendre(d, () => !!localStorage.getItem('pam-cloud-linked'), 30000);
  await d.goto(base + '#/compte');
  await d.getByRole('button', { name: 'Récupérer par Arvela' }).click();
  await d.getByText(/Récupération possible le/).waitFor();
  await d.screenshot({ path: path.join(out, 'apres-compte-recuperation-clair.png') });
  assert((await lireLocal(d, 'journal', 'j1'))?.sante, 'demande faite, délai de sécurité en cours, carnet encore fermé');
  await d.waitForTimeout(3500);
  await d.goto(base + '#/');
  await d.goto(base + '#/compte');
  await d.getByRole('button', { name: 'Récupérer ma clé' }).click();
  await attendreQue(async () => (await lireLocal(d, 'journal', 'j1'))?.temp === 38.4, 20000, 'carnet ouvert par la copie scellée');
  assert((await lireLocal(d, 'contracts', 'c1')).majoreFiscal === true, 'après le délai : clé récupérée, carnet et case handicap ouverts, zéro perte');

  const erreurs = [a, c, d].flatMap((p) => p.erreurs);
  assert(erreurs.length === 0, 'aucune erreur dans les pages' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  await b.close();
  console.log('\nParcours T-125 : tout est bon.');
})().catch((e) => { console.error(e); process.exit(1); });
