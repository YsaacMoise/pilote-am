// Outils communs aux scénarios de capture des vidéos.
// Chaque geste est une « étape » nommée. Si l'app a changé (bouton renommé, écran différent), le scénario s'arrête
// avec un message lisible : l'étape en cause, l'élément introuvable, et une capture de l'écran à ce moment-là.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const HIDE = `.demo-banner{display:none!important} .toast-wrap{display:none!important} .aide-video{display:none!important}`;

async function navigateur() {
  return chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr' }, args: ['--lang=fr'] });
}

// Un téléphone : 390 × 844 points, captures en double résolution, horloge fixée, aides vidéo fermées
async function telephone(br, horloge) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  ctx.setDefaultTimeout(8000);
  await ctx.clock.setFixedTime(new Date(horloge));
  await ctx.addInitScript(() => { try { localStorage.setItem('pam-videos', JSON.stringify({ vues: ['quotidien', 'parents'], fermees: ['pointer', 'carnet', 'mois', 'inviter', 'simulateur'] })); localStorage.setItem('pam-demo-video', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('Erreur dans l’app :', e.message));
  return { ctx, p };
}

// Rectangle d'un élément à l'écran (points), avec son centre
async function rect(loc) {
  const b = await loc.first().boundingBox();
  if (!b) throw new Error('élément présent mais invisible à l’écran');
  const r = { left: Math.round(b.x), top: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  r.x = r.left + Math.round(r.w / 2); r.y = r.top + Math.round(r.h / 2);
  return r;
}

// Traduit une erreur de Playwright en phrase lisible
function explication(e) {
  const msg = String(e && e.message || e);
  const loc = /waiting for (.+?)(?:\n|$)/.exec(msg)?.[1] ?? /locator\('([^']+)'\)/.exec(msg)?.[1];
  // Dans une chaîne (zone → bouton), c'est le dernier élément cherché qui manque
  const roles_ = [...(loc ?? '').matchAll(/getByRole\('(\w+)'(?:,\s*\{\s*name:\s*['"/]\^?([^'"/]+)['"/])?/g)];
  const dernier = roles_[roles_.length - 1];
  const role = dernier?.[1];
  const nom = dernier?.[2];
  const roles = { button: 'bouton', link: 'lien', heading: 'titre', region: 'zone', tab: 'onglet', radio: 'choix' };
  if (/Timeout/.test(msg) && nom) return `Élément introuvable : ${roles[role] ?? 'élément'} « ${nom} ». Il a peut-être changé de nom ou de place dans l’app.`;
  if (/Timeout/.test(msg) && loc) return `Élément introuvable : ${loc}. L’écran de l’app a peut-être changé.`;
  return msg.split('\n')[0];
}

// Journal d'étapes pour un scénario. pages() renvoie les pages à photographier en cas d'arrêt.
function scenario(nom, dossier, pages) {
  fs.mkdirSync(dossier, { recursive: true });
  for (const f of fs.readdirSync(dossier)) if (f.startsWith('ARRET-')) fs.unlinkSync(path.join(dossier, f));
  let n = 0;
  return async function etape(titre, fn) {
    n++;
    try {
      return await fn();
    } catch (e) {
      const fichiers = [];
      for (const [i, p] of pages().entries()) {
        const f = path.join(dossier, `ARRET-${n}-${i}.png`);
        await p.screenshot({ path: f }).then(() => fichiers.push(f)).catch(() => {});
      }
      const err = new Error(`Scénario « ${nom} », étape ${n} « ${titre} » : ${explication(e)}${fichiers.length ? `\nÉcran au moment de l’arrêt : ${fichiers.join(', ')}` : ''}`);
      err.lisible = true;
      throw err;
    }
  };
}

const allerA = async (p, h, w = 700) => { await p.evaluate((x) => (location.hash = x), h); await p.waitForTimeout(w); await p.evaluate(() => scrollTo(0, 0)); };
const masquer = (p) => p.addStyleTag({ content: HIDE });

function terminer(promesse) {
  promesse.catch((e) => { console.error(e.lisible ? '\n' + e.message + '\n' : e); process.exit(1); });
}

module.exports = { navigateur, telephone, rect, scenario, allerA, masquer, terminer };
