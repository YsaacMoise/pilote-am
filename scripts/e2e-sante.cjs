// T-121 : parcours automatisé des données de santé (consignes/t118-t121.md, partie T-121), avec le faux service en ligne
// (scripts/fake-cloud.mjs). Aucun compte réel, aucune base réelle.
// 1. Un compte contient des données de santé envoyées par une ancienne version (soins du carnet, case handicap du contrat).
// 2. Le téléphone de l'AM, à jour, retire ce dont il a une copie identique ; il garde et note le reste.
// 3. Une nouvelle note de soin, saisie à l'écran, ne part jamais dans le compte ; une note de repas, si.
// Usage :
//   VITE_FAKE_CLOUD=http://localhost:4180 npm run build
//   node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 & node scripts/e2e-sante.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const cloud = process.env.CLOUD || 'http://localhost:4180';
const out = path.join(__dirname, 'out');
fs.mkdirSync(path.join(out, 't121'), { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}
async function attendre(page, fn, timeout) {
  const fin = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn).catch(() => false)) return;
    if (Date.now() > fin) throw new Error('Délai dépassé en attendant : ' + fn.toString());
    await page.waitForTimeout(200);
  }
}
const post = (p, body) => fetch(cloud + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const dump = async (uid) => (await (await fetch(`${cloud}/dump?uid=${uid}`)).json()).docs;
const enLigne = (docs, s, k) => docs.find((d) => d.s === s && d.k === k);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const week = (start, end) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, [{ start, end }]]));
const contrat = {
  id: 'c1', child: 'Lou', family: 'Petit', color: 1, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '17:00'), rateNet: 400, majoration: 10, entretienJour: 400, entretienMode: 'jour', repasPrix: 0, repasParJour: 0, repasParents: true,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: true, departement: '75', alsaceMoselle: false, mayotte: false, planningVariable: false,
  accueilOccasionnel: false, cdd: false, reposHebdo: 7, trackedFrom: '2026-09-01',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0, cpSaisi: true }, history: [], createdAt: 1,
};
const note = (id, kind, detail, extra = {}) => ({ id, cid: 'c1', date: today, time: '10:00', kind, detail, ...extra });
const j1 = note('j1', 'soin', 'Température 38,4 °C (fièvre)', { temp: 38.4 }); // identique sur le téléphone : retirée
const j2 = note('j2', 'soin', 'Médicament donné (ordonnance)', { time: '10:30' }); // absente du téléphone : gardée
const j3 = note('j3', 'change', 'Selles liquides', { time: '11:00' }); // différente sur le téléphone : gardée
const j4 = note('j4', 'repas', 'A tout mangé', { time: '12:00' }); // pas de santé : reste en ligne
const reglages = { k: 'settings', v: { amName: 'Sonia', enfantsACharge: 0, onboarded: true, conditionsAcceptees: { version: '2026-11-04', date: today } } };
const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

(async () => {
  await post('/reset-all', {});
  const email = 'sonia-sante@exemple.fr';
  const { uid } = await post('/create', { email, password: 'Motdepasse-solide' });
  // Ancienne version : le compte contient tout, en clair.
  await post('/write', { uid, d: 'ancien-telephone', docs: [
    { s: 'kv', k: 'settings', v: stable(reglages) },
    { s: 'contracts', k: 'c1', v: stable(contrat) },
    ...[j1, j2, j3, j4].map((j) => ({ s: 'journal', k: j.id, v: stable(j) })),
  ] });
  const avant = await dump(uid);
  assert(avant.filter((d) => d.s === 'journal').length === 4 && JSON.parse(enLigne(avant, 'contracts', 'c1').v).majoreFiscal === true, 'avant : 4 notes et la case handicap dans le compte');

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  await p.goto(base);
  await p.waitForTimeout(800);
  // Le téléphone de l'AM : mêmes données (sauf j2, et j3 corrigée depuis), déjà relié au compte.
  await p.evaluate(async ({ contrat, j1, j3, j4, reglages, uid, email }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = db.transaction(['kv', 'contracts', 'journal'], 'readwrite');
      tx.objectStore('kv').put(reglages);
      tx.objectStore('contracts').put(contrat);
      for (const j of [j1, { ...j3, time: '11:05' }, j4]) tx.objectStore('journal').put(j);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    localStorage.setItem('pam-fake-user', JSON.stringify({ uid, email, verified: true }));
    localStorage.setItem('pam-cloud-linked', uid);
    localStorage.setItem('pam-cloud-last', uid);
    // Rien de neuf à recevoir : seules les données déjà en ligne sont en jeu.
    localStorage.setItem('pam-cloud-since', String(Date.now() + 1e10));
    localStorage.setItem('pam-mesure', 'non');
  }, { contrat, j1, j3, j4, reglages, uid, email });

  console.log('\n== Retrait des données de santé déjà en ligne ==');
  await p.reload();
  await attendre(p, () => !!localStorage.getItem('pam-sante-retrait'), 30000);
  const etat = await p.evaluate(() => JSON.parse(localStorage.getItem('pam-sante-retrait')));
  console.log('  état noté sur le téléphone :', JSON.stringify(etat));
  const apres = await dump(uid);
  assert(!enLigne(apres, 'journal', 'j1'), 'note de température identique sur le téléphone : retirée du compte (sans pierre tombale)');
  assert(!!enLigne(apres, 'journal', 'j2'), 'note de soin absente du téléphone : rien n’est retiré');
  assert(!!enLigne(apres, 'journal', 'j3'), 'note « selles liquides » différente sur le téléphone : rien n’est retiré');
  assert(!!enLigne(apres, 'journal', 'j4'), 'note de repas (pas de santé) : reste en ligne');
  const cEnLigne = JSON.parse(enLigne(apres, 'contracts', 'c1').v);
  assert(!('majoreFiscal' in cEnLigne) && cEnLigne.rateNet === 400 && cEnLigne.child === 'Lou', 'contrat en ligne : case handicap retirée, le reste intact');
  assert(etat.retires === 2 && etat.gardes === 2 && etat.verifie === true, 'état : 2 retraits vérifiés par relecture, 2 données gardées et notées');
  const local = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); });
    const get = (s, k) => new Promise((res) => { const r = db.transaction(s).objectStore(s).get(k); r.onsuccess = () => res(r.result); });
    return { j1: await get('journal', 'j1'), j3: await get('journal', 'j3'), c1: await get('contracts', 'c1') };
  });
  assert(local.j1?.temp === 38.4 && local.j3?.time === '11:05' && local.c1?.majoreFiscal === true, 'téléphone : notes de soin et case handicap toujours là');

  console.log('\n== Écran Compte ==');
  for (const theme of ['light', 'dark']) {
    await p.evaluate((t) => localStorage.setItem('pam-theme', t), theme);
    await p.goto(base + '#/compte');
    await p.reload();
    await p.getByText(/2 données de santé copiées par une ancienne version restent/).waitFor();
    await p.getByText(/Ce qui touche à la santé reste sur ce téléphone/).scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(out, `sante-compte-${theme}.png`), fullPage: true });
  }
  assert(true, 'Compte : données gardées signalées, et ce qui reste sur le téléphone expliqué');
  await p.evaluate(() => localStorage.setItem('pam-theme', 'light'));

  console.log('\n== Nouvelle note de soin saisie à l’écran ==');
  await p.goto(base + '#/carnet');
  await p.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Soin' }).click();
  await p.getByText('Les soins restent sur ce téléphone').waitFor();
  await p.getByRole('button', { name: 'Prise de température' }).click();
  await p.locator('#jr-temp').fill('38,9');
  await p.getByRole('button', { name: 'Ajouter la température' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Repas' }).click();
  await p.getByRole('button', { name: 'A bien mangé' }).click();
  await p.waitForTimeout(3000);
  const fin = await dump(uid);
  const notes = fin.filter((d) => d.s === 'journal' && d.v).map((d) => JSON.parse(d.v));
  assert(notes.some((j) => j.detail === 'A bien mangé'), 'la note de repas est copiée dans le compte');
  assert(!notes.some((j) => j.temp === 38.9 || /38,9/.test(j.detail)), 'la note de température 38,9 n’est pas dans le compte');
  const localNotes = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); });
    return new Promise((res) => { const r = db.transaction('journal').objectStore('journal').getAll(); r.onsuccess = () => res(r.result); });
  });
  assert(localNotes.some((j) => j.temp === 38.9), 'la note de température 38,9 est sur le téléphone');

  console.log('\n== Appareil resté sur une ancienne version : renvoie une note de soin (relecture M1) ==');
  const j6 = note('j6', 'soin', 'Lavage de nez', { time: '15:00' });
  await post('/write', { uid, d: 'ancien-telephone', docs: [{ s: 'journal', k: 'j6', v: stable(j6) }] });
  // Ce téléphone écoute de nouveau tout le compte : il range la note, puis la retire (copie identique).
  await p.evaluate(() => localStorage.setItem('pam-cloud-since', '0'));
  await p.reload();
  const fin2 = Date.now() + 30000;
  let docs2 = await dump(uid);
  while (enLigne(docs2, 'journal', 'j6') && Date.now() < fin2) { await p.waitForTimeout(500); docs2 = await dump(uid); }
  assert(!enLigne(docs2, 'journal', 'j6'), 'note de soin renvoyée par l’ancien appareil : rangée sur ce téléphone puis retirée du compte');
  assert(!enLigne(docs2, 'journal', 'j2'), 'note de médicament reçue du compte : rangée sur ce téléphone, puis retirée (copie identique)');
  assert(!!enLigne(docs2, 'journal', 'j3'), 'note « selles liquides » toujours différente : toujours gardée');
  const j6Local = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); });
    return new Promise((res) => { const r = db.transaction('journal').objectStore('journal').get('j6'); r.onsuccess = () => res(r.result); });
  });
  assert(j6Local?.detail === 'Lavage de nez', 'la note renvoyée est sur ce téléphone');

  console.log('\n== Impôts : case inconnue sur cet appareil (relecture B1) ==');
  await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); });
    const c = await new Promise((res) => { const r = db.transaction('contracts').objectStore('contracts').get('c1'); r.onsuccess = () => res(r.result); });
    delete c.majoreFiscal;
    await new Promise((res) => { const tx = db.transaction('contracts', 'readwrite'); tx.objectStore('contracts').put(c); tx.oncomplete = res; });
  });
  await p.goto(base + '#/fiscal');
  await p.reload();
  await p.getByText(/Lou.*est-il en situation de handicap ou de maladie/).waitFor();
  assert(await p.getByText('non calculé').first().isVisible(), 'case inconnue : abattement et revenu « non calculé », la question est posée');
  await p.screenshot({ path: path.join(out, 't121', 'apres-impots-question-clair.png') });
  await p.getByRole('button', { name: 'Oui', exact: true }).click();
  await p.getByText(/Abattement \(4 × SMIC/).waitFor();
  assert(true, 'réponse « Oui » : abattement majoré (4 × SMIC) calculé');
  const cFin = await dump(uid);
  assert(!('majoreFiscal' in JSON.parse(enLigne(cFin, 'contracts', 'c1').v)), 'la réponse reste sur le téléphone : le contrat en ligne n’a pas la case');

  assert(erreurs.length === 0, 'aucune erreur dans la page' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  await b.close();
  console.log('\nParcours T-121 : tout est bon.');
})().catch((e) => { console.error(e); process.exit(1); });
