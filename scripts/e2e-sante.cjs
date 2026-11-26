// T-121, option b : parcours automatisé du chiffrement de bout en bout des données de santé (consignes/t121-option-b.md),
// avec le faux service en ligne (scripts/fake-cloud.mjs). Aucun compte réel, aucune base réelle.
// 1. Un compte d'une ancienne version contient des données de santé en clair. Le téléphone de l'AM, à jour, crée la clé de
//    secours, chiffre tout sur place et vérifie : plus rien de santé en clair en ligne, rien de perdu sur le téléphone.
// 2. Rappel de sauvegarde : avec un compte à jour, invite à garder la clé au lieu du rappel de la semaine ; sans compte, rappel.
// 3. Une note de soin demande l'accord des parents, puis part chiffrée.
// 4. Nouveau téléphone : tout est là mais le carnet reste fermé ; mauvaise clé refusée ; bonne clé : tout s'ouvre.
// 5. Un appareil resté sur l'ancienne version renvoie une note en clair : elle est chiffrée à sa réception.
// Usage :
//   VITE_FAKE_CLOUD=http://localhost:4180 npm run build
//   node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 & node scripts/e2e-sante.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const cloud = process.env.CLOUD || 'http://localhost:4180';
const out = path.join(__dirname, 'out', 't121');
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
const enLigne = (docs, s, k) => docs.find((d) => d.s === s && d.k === k);
const valeur = (docs, s, k) => JSON.parse(enLigne(docs, s, k).v);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const week = (start, end) => Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [{ start, end }]]));
const contrat = {
  id: 'c1', child: 'Lou', family: 'Petit', color: 1, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '17:00'), rateNet: 400, majoration: 10, entretienJour: 400, entretienMode: 'jour', repasPrix: 0, repasParJour: 0, repasParents: true,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: true, departement: '75', alsaceMoselle: false, mayotte: false, planningVariable: false,
  accueilOccasionnel: false, cdd: false, reposHebdo: 7, trackedFrom: '2026-09-01',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0, cpSaisi: true }, history: [], createdAt: 1,
  partage: { id: 'LienLouLienLouLienLou1', secret: 'SecretDuLienSecretDuLi', code: '4827', salt: 'SelDuLienSelDuLienSelD', createdAt: 1 },
};
const note = (id, kind, detail, extra = {}) => ({ id, cid: 'c1', date: today, time: '10:00', kind, detail, ...extra });
const j1 = note('j1', 'soin', 'Température 38,4 °C (fièvre)', { temp: 38.4 });
const j2 = note('j2', 'note', 'A toussé toute la matinée', { time: '10:30' });
const j4 = note('j4', 'repas', 'A tout mangé', { time: '12:00' });
const reglages = { k: 'settings', v: { amName: 'Sonia', enfantsACharge: 0, onboarded: true, conditionsAcceptees: { version: '2026-11-26-2', date: today } } };
const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const SANTE = /38,4|fièvre|Température|toussé|majoreFiscal|SecretDuLien|4827/;

async function telephone(b, nom) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.erreurs = [];
  p.on('pageerror', (e) => p.erreurs.push(`${nom} : ${e.message}`));
  await p.goto(base);
  await p.waitForTimeout(800);
  return p;
}
async function semer(p, { donnees, ls }) {
  await p.evaluate(async ({ donnees, ls }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (Object.keys(donnees).length) await new Promise((res, rej) => {
      const tx = db.transaction(Object.keys(donnees), 'readwrite');
      for (const [s, vs] of Object.entries(donnees)) for (const v of vs) tx.objectStore(s).put(v);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  }, { donnees, ls });
}
const lireLocal = (p, s, k) => p.evaluate(async ({ s, k }) => {
  const db = await new Promise((res) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); });
  return new Promise((res) => { const r = db.transaction(s).objectStore(s).get(k); r.onsuccess = () => res(r.result); });
}, { s, k });

(async () => {
  await post('/reset-all', {});
  const email = 'sonia-sante@exemple.fr';
  const { uid } = await post('/create', { email, password: 'Motdepasse-solide' });
  await post('/write', { uid, d: 'ancien-telephone', docs: [
    { s: 'kv', k: 'settings', v: stable(reglages) },
    { s: 'contracts', k: 'c1', v: stable(contrat) },
    ...[j1, j2, j4].map((j) => ({ s: 'journal', k: j.id, v: stable(j) })),
  ] });
  assert(SANTE.test(stable(await dump(uid))), 'avant : le compte contient des données de santé en clair (ancienne version)');

  const b = await chromium.launch();
  console.log('\n== Téléphone A, à jour : clé de secours créée, tout chiffré sur place ==');
  const a = await telephone(b, 'A');
  await semer(a, { donnees: { kv: [reglages], contracts: [contrat], journal: [j1, j2, j4] }, ls: {
    'pam-fake-user': JSON.stringify({ uid, email, verified: true }), 'pam-cloud-linked': uid, 'pam-cloud-last': uid,
    'pam-cloud-since': String(Date.now() + 1e10), 'pam-mesure': 'non', 'pam-mesure-info': '1',
  } });
  await a.reload();
  await attendre(a, () => !!localStorage.getItem('pam-sante-chiffrement'), 30000);
  const etat = await a.evaluate(() => JSON.parse(localStorage.getItem('pam-sante-chiffrement')));
  console.log('  état noté sur le téléphone :', JSON.stringify(etat));
  const apres = await dump(uid);
  const lisible = stable(apres.map((d) => { const v = d.v ? JSON.parse(d.v) : null; if (v && v.sante) delete v.sante; return { ...d, v }; }));
  assert(!SANTE.test(lisible), 'après : plus aucune donnée de santé lisible en ligne (températures, notes, case handicap, secret et code du lien)');
  assert(['j1', 'j2', 'j4'].every((k) => valeur(apres, 'journal', k).sante), 'chaque note du carnet est chiffrée');
  const cEnLigne = valeur(apres, 'contracts', 'c1');
  assert(cEnLigne.sante && cEnLigne.rateNet === 400 && cEnLigne.child === 'Lou' && cEnLigne.partage.id === contrat.partage.id, 'contrat : santé et secret du lien chiffrés, le reste lisible (paie)');
  const coffre = valeur(apres, 'kv', 'coffre');
  const code = await a.evaluate((u) => JSON.parse(localStorage.getItem('pam-coffre'))[u][0], uid);
  assert(coffre.v.id && !stable(coffre).includes(code.replace(/-/g, '')) && !stable(apres).includes(code), 'en ligne : l’empreinte de la clé seulement, jamais la clé');
  assert(etat.chiffres === 4 && etat.gardes === 0 && etat.verifie === true, 'migration : 4 documents chiffrés, vérifiés par relecture, 0 gardé');
  const aJ1 = await lireLocal(a, 'journal', 'j1');
  const aC1 = await lireLocal(a, 'contracts', 'c1');
  assert(aJ1.temp === 38.4 && aJ1.detail === j1.detail && !aJ1.sante && aC1.majoreFiscal === true && aC1.partage.code === '4827', 'téléphone A : rien de perdu, tout lisible');

  console.log('\n== Rappel de sauvegarde avec un compte à jour ==');
  for (const theme of ['light', 'dark']) {
    await a.evaluate((t) => localStorage.setItem('pam-theme', t), theme);
    await a.goto(base + '#/');
    await a.reload();
    await a.getByText('Protège ta clé de secours').waitFor();
    await a.screenshot({ path: path.join(out, `apres-aujourdhui-cle-${theme === 'light' ? 'clair' : 'sombre'}.png`) });
  }
  assert(!(await a.getByText('Pense à ta sauvegarde de la semaine').isVisible()), 'compte à jour : invite à garder la clé, plus de rappel de la semaine');
  await a.goto(base + '#/compte');
  await a.getByRole('heading', { name: 'Ta clé de secours' }).waitFor();
  await a.getByText(/autre appareil utilise une ancienne version/).waitFor();
  assert(true, 'Compte : clé de secours, et un autre appareil sur une ancienne version signalé');
  await a.getByRole('button', { name: 'Afficher la clé' }).click();
  assert(await a.getByText(code).isVisible(), 'la clé s’affiche à la demande');
  await a.getByRole('heading', { name: 'Ta clé de secours' }).scrollIntoViewIfNeeded();
  await a.screenshot({ path: path.join(out, 'apres-compte-cle-sombre.png') });
  await a.getByRole('button', { name: 'Je l’ai notée' }).click();
  await a.goto(base + '#/');
  await a.waitForTimeout(800);
  assert(!(await a.getByText('Protège ta clé de secours').isVisible()) && !(await a.getByText('Pense à ta sauvegarde de la semaine').isVisible()), 'clé gardée : plus aucun rappel');
  await a.evaluate(() => localStorage.setItem('pam-theme', 'light'));

  console.log('\n== Note de soin : accord des parents, puis envoi chiffré ==');
  await a.goto(base + '#/carnet');
  await a.reload();
  await a.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Soin' }).click();
  await a.getByText(/il te faut l’accord écrit de ses parents/).waitFor();
  await a.screenshot({ path: path.join(out, 'apres-carnet-accord-clair.png') });
  await a.getByRole('button', { name: 'Oui, j’ai leur accord écrit' }).click();
  await a.getByRole('button', { name: 'Prise de température' }).click();
  await a.locator('#jr-temp').fill('38,9');
  await a.getByRole('button', { name: 'Ajouter la température' }).click();
  await attendreQue(async () => (await dump(uid)).filter((d) => d.s === 'journal').length === 4, 15000, 'note envoyée');
  const fin = await dump(uid);
  const nouvelle = fin.filter((d) => d.s === 'journal').map((d) => JSON.parse(d.v)).find((j) => !['j1', 'j2', 'j4'].includes(j.id));
  assert(nouvelle.sante && !/38,9/.test(stable({ ...nouvelle, sante: 0 })), 'la note 38,9 part chiffrée');
  assert(valeur(fin, 'contracts', 'c1').accordSante === today, 'accord des parents noté sur le contrat, avec sa date');

  console.log('\n== Nouveau téléphone B : sans la clé, puis avec ==');
  const bb = await telephone(b, 'B');
  await semer(bb, { donnees: {}, ls: { 'pam-fake-user': JSON.stringify({ uid, email, verified: true }), 'pam-cloud-pending': uid, 'pam-mesure': 'non', 'pam-mesure-info': '1' } });
  await bb.reload();
  await attendre(bb, () => !!localStorage.getItem('pam-cloud-linked'), 30000);
  await bb.goto(base + '#/');
  await bb.getByText('Entre ta clé de secours').first().waitFor();
  const bJ1 = await lireLocal(bb, 'journal', 'j1');
  const bC1 = await lireLocal(bb, 'contracts', 'c1');
  assert(bJ1.sante && !bJ1.temp && bC1.majoreFiscal === undefined && bC1.rateNet === 400, 'B sans clé : contrats et montants là, carnet et case encore scellés');
  // Contre-relecture N2 : sans la clé, un changement de paie part quand même (partie lisible), le bloc chiffré reste.
  await bb.goto(base + '#/contrat/c1');
  await bb.getByLabel('Taux horaire net').fill('4,10');
  await bb.getByRole('button', { name: /^Enregistrer/ }).first().click();
  await attendreQue(async () => valeur(await dump(uid), 'contracts', 'c1').rateNet === 410, 15000, 'taux envoyé sans la clé');
  const cSansCle = valeur(await dump(uid), 'contracts', 'c1');
  assert(cSansCle.sante && !('majoreFiscal' in cSansCle) && !('code' in cSansCle.partage), 'B sans clé : le nouveau taux part, la case et le code du lien restent chiffrés');
  await bb.goto(base + '#/compte');
  await bb.getByRole('textbox', { name: 'Clé de secours' }).fill('0000-0000-0000-0000-0000-0000-00');
  await bb.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await bb.getByText(/Ce n’est pas la clé de secours de ce compte/).waitFor();
  assert(true, 'mauvaise clé refusée, en français');
  await bb.screenshot({ path: path.join(out, 'apres-compte-entrer-cle-clair.png') });
  await bb.getByRole('textbox', { name: 'Clé de secours' }).fill(code.toLowerCase());
  await bb.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await attendre(bb, () => !!localStorage.getItem('pam-coffre'), 15000);
  await bb.waitForTimeout(1000);
  const bJ1b = await lireLocal(bb, 'journal', 'j1');
  const bC1b = await lireLocal(bb, 'contracts', 'c1');
  assert(bJ1b.temp === 38.4 && !bJ1b.sante && bC1b.majoreFiscal === true && bC1b.partage.code === '4827', 'B avec la clé : carnet, case et code du lien ouverts, rien de perdu');

  console.log('\n== Appareil resté sur l’ancienne version : renvoie une note en clair ==');
  const j7 = note('j7', 'soin', 'Lavage de nez', { time: '15:00' });
  await post('/write', { uid, d: 'ancien-telephone', docs: [{ s: 'journal', k: 'j7', v: stable(j7) }] });
  await attendreQue(async () => { const d = enLigne(await dump(uid), 'journal', 'j7'); return d && JSON.parse(d.v).sante; }, 30000, 'note rechiffrée');
  assert(true, 'la note en clair de l’ancien appareil est chiffrée à sa réception');
  assert((await lireLocal(bb, 'journal', 'j7'))?.detail === 'Lavage de nez', 'et elle est lisible sur B');

  console.log('\n== Ancien appareil : case cochée en clair à côté du bloc chiffré (relecture B2) ==');
  const scelle = valeur(await dump(uid), 'contracts', 'c1');
  await post('/write', { uid, d: 'ancien-telephone', docs: [{ s: 'contracts', k: 'c1', v: stable({ ...scelle, majoreFiscal: false }) }] });
  await attendreQue(async () => { const v = valeur(await dump(uid), 'contracts', 'c1'); return v.sante && !('majoreFiscal' in v); }, 30000, 'contrat rechiffré');
  await bb.waitForTimeout(1500);
  const bC1c = await lireLocal(bb, 'contracts', 'c1');
  assert(bC1c.majoreFiscal === false && bC1c.partage.code === '4827' && bC1c.partage.secret === contrat.partage.secret, 'rechiffré sans rien perdre : nouvelle réponse gardée, secret et code du lien intacts');

  console.log('\n== Deux appareils créent un coffre en même temps (relecture B1) ==');
  const premier = await post('/creer-coffre', { uid: 'test-coffre', v: 'premier', d: 'x' });
  const second = await post('/creer-coffre', { uid: 'test-coffre', v: 'second', d: 'y' });
  assert(premier.v === 'premier' && second.v === 'premier', 'le second reçoit le coffre du premier : une seule clé par compte');

  console.log('\n== Sans compte : rappel de la semaine ==');
  const c = await telephone(b, 'C');
  await semer(c, { donnees: { kv: [reglages], contracts: [contrat] }, ls: { 'pam-mesure': 'non', 'pam-mesure-info': '1' } });
  await c.reload();
  await c.getByText('Pense à ta sauvegarde de la semaine').waitFor();
  assert(true, 'sans compte : le rappel de la semaine reste');

  const erreurs = [a, bb, c].flatMap((p) => p.erreurs);
  assert(erreurs.length === 0, 'aucune erreur dans les pages' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  await b.close();
  console.log('\nParcours T-121 (option b) : tout est bon.');
})().catch((e) => { console.error(e); process.exit(1); });
