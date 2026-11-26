// T-121 : captures avant et après (390 × 844, clair et sombre) des écrans dont le texte change.
// Mêmes données, compte factice déjà relié (faux service en ligne). TAG=avant ou TAG=apres.
// Usage : VITE_FAKE_CLOUD=http://localhost:4180 npm run build ; node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 &
//         TAG=apres node scripts/shots-t121.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const cloud = process.env.CLOUD || 'http://localhost:4180';
const tag = process.env.TAG || 'apres';
const out = path.join(__dirname, 'out', 't121');
fs.mkdirSync(out, { recursive: true });
const post = (p, body) => fetch(cloud + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
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
};
const reglages = { k: 'settings', v: { amName: 'Sonia', enfantsACharge: 0, onboarded: true, conditionsAcceptees: { version: process.env.CGU || '2026-11-26-2', date: today } } };

(async () => {
  await post('/reset-all', {});
  const email = 'sonia-captures@exemple.fr';
  const { uid } = await post('/create', { email, password: 'Motdepasse-solide' });
  const b = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(base);
    await p.waitForTimeout(800);
    await p.evaluate(async ({ contrat, reglages, uid, email, theme }) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('pam-donnees', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      await new Promise((res, rej) => {
        const tx = db.transaction(['kv', 'contracts'], 'readwrite');
        tx.objectStore('kv').put(reglages);
        tx.objectStore('contracts').put(contrat);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      db.close();
      localStorage.setItem('pam-fake-user', JSON.stringify({ uid, email, verified: true }));
      localStorage.setItem('pam-cloud-linked', uid);
      localStorage.setItem('pam-cloud-last', uid);
      localStorage.setItem('pam-mesure', 'non');
      localStorage.setItem('pam-theme', theme);
      localStorage.setItem('pam-mesure-info', '1');
    }, { contrat, reglages, uid, email, theme });
    const shot = async (n, loc) => {
      if (loc) { await loc.scrollIntoViewIfNeeded(); }
      await p.waitForTimeout(900);
      await p.screenshot({ path: path.join(out, `${tag}-${n}-${theme === 'light' ? 'clair' : 'sombre'}.png`) });
    };
    await p.goto(base + '#/');
    await p.reload();
    await p.waitForTimeout(2500);
    await shot('aujourdhui');
    await p.goto(base + '#/compte');
    await p.getByRole('heading', { name: 'Où vont tes données' }).waitFor();
    await p.waitForTimeout(1500);
    await shot('compte');
    if (await p.getByRole('heading', { name: 'Ta clé de secours' }).isVisible().catch(() => false)) await shot('compte-cle', p.getByRole('heading', { name: 'Ta clé de secours' }));
    await p.goto(base + '#/contrat/c1');
    await p.getByText('Enfant en situation de handicap ou de maladie').waitFor();
    await shot('contrat-lien', (await p.getByText(/^Santé :/).count()) ? p.getByText(/^Santé :/) : p.getByText(/^le carnet \(repas/));
    await p.goto(base + '#/carnet');
    await p.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Soin' }).click();
    await shot('carnet-soin');
    await ctx.close();
  }
  await b.close();
  console.log('captures dans', out);
})().catch((e) => { console.error(e); process.exit(1); });
