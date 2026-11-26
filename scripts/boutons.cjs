// T-135 : robot de tous les boutons et de tous les liens (téléphone 390 × 844, démonstration, thème clair).
// Il ouvre chaque route de src/app.tsx, puis chaque feuille qu'un élément ouvre, et touche chaque élément actionnable
// (a, button, role=button, tab, radio, switch, menuitem, checkbox, summary). Pour chacun : écran, nom lu, texte visible, effet
// réel (adresse, feuille et son titre, message bref, téléchargement, partage, presse-papiers, changement d'état) et un verdict.
//
// Usage :
//   npm run build ; node scripts/serve.mjs 4173 &
//   BASE=http://localhost:4173/pilote-am/ node scripts/boutons.cjs robot sortie.json      (environ 20 minutes)
//   node scripts/boutons.cjs table sortie.json [vision-1.0.json] > boutons.md               (table, écarts, comparaison)
// Playwright : celui des autres parcours (scripts/e2e*.cjs). Date fixe : jeudi 26/11/2026 à 10 h, Paris.
// ROUTES=mois,plus : seulement ces routes (essai rapide).
const fs = require('fs');

const MOIS = '2026-11';
// Routes de src/app.tsx, avec les identifiants de la démonstration (src/demo.ts).
const ROUTES = [
  // neuf : données de démonstration neuves avant chaque élément (pointages et notes changent l'écran à chaque geste).
  { r: '', neuf: true }, { r: 'carnet', neuf: true }, { r: 'mois' },
  { r: 'mois', nom: 'mois (paie vue)', paie: true },
  { r: `mois/${MOIS}/demo-ines` }, { r: 'plus' },
  { r: 'enfant/demo-leo' }, { r: 'enfant/demo-leo/parents' }, { r: 'enfant/demo-leo/absences' },
  { r: 'contrat/demo-leo' }, { r: 'contrat/demo-leo/planning' }, { r: 'contrat-cree/demo-leo' },
  { r: 'avenant/demo-leo/nouveau' }, { r: 'historique/demo-leo' }, { r: 'fin/demo-leo' }, { r: 'fin' },
  { r: 'controle' }, { r: `controle/demo-leo/${MOIS}` }, { r: 'conges' }, { r: 'fiscal' }, { r: 'sauvegarde' },
  { r: 'pilote' }, { r: 'reglages' }, { r: 'compte', neuf: true }, { r: 'regles' }, { r: 'installer' }, { r: 'guide' },
  { r: 'confidentialite' }, { r: 'mentions' }, { r: 'conditions' }, { r: 'simulateur' }, { r: 'bienvenue' },
  { r: 'contrat/nouveau' }, { r: 'ajout' },
];
// Site public (avant le compte) : app.tsx rend ces écrans sans démonstration.
const PUBLIQUES = [{ r: '', pub: true }, { r: 'simulateur', pub: true }, { r: 'confidentialite', pub: true }, { r: 'mentions', pub: true }, { r: 'conditions', pub: true }];
const CONNUES = ['', 'carnet', 'mois', 'plus', 'contrat', 'ajout', 'contrat-cree', 'enfant', 'avenant', 'historique', 'controle', 'conges', 'fin', 'simulateur', 'fiscal', 'sauvegarde', 'pilote', 'reglages', 'compte', 'regles', 'confidentialite', 'mentions', 'conditions', 'installer', 'guide', 'bienvenue'];
const nomRoute = (x) => x.nom ?? (x.pub ? `public : #/${x.r}` : `#/${x.r}`);

// ---------- dans la page ----------
// Nom lu (calcul simplifié du nom accessible), texte visible, rôle ; éléments marqués data-robot-i.
function collecteDansPage(dansFeuille) {
  const SEL = 'a[href], button, [role=button], [role=tab], [role=radio], [role=switch], [role=menuitem], [role=checkbox], input[type=checkbox], input[type=radio], summary';
  const propre = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const texteSansCache = (el) => {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' && !['svg', 'style', 'script'].includes(n.tagName.toLowerCase())) s += ' ' + texteSansCache(n) + ' ';
    }
    return s;
  };
  const nomLu = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) return propre(lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
    const al = el.getAttribute('aria-label');
    if (al) return propre(al);
    if (el.tagName === 'INPUT') {
      const l = (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
      if (l) return propre(texteSansCache(l));
    }
    const t = propre(texteSansCache(el));
    return t || propre(el.getAttribute('title'));
  };
  const role = (el) => el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'SUMMARY' ? 'summary' : el.tagName === 'INPUT' ? el.type : 'button');
  const visible = (el) => {
    if (el.closest('[inert], [aria-hidden="true"], .toast-wrap')) return false;
    if (el.tagName === 'INPUT' && el.getAttribute('role') !== 'switch' && getComputedStyle(el).opacity === '0') return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) {
      // case à cocher cachée sous son libellé : le libellé est la cible
      if (el.tagName !== 'INPUT') return false;
    }
    return el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : true;
  };
  const feuille = [...document.querySelectorAll('dialog[open]')].pop();
  const racine = dansFeuille ? feuille : document;
  if (dansFeuille && !feuille) return [];
  const vus = {};
  const out = [];
  document.querySelectorAll('[data-robot-i]').forEach((e) => e.removeAttribute('data-robot-i'));
  [...racine.querySelectorAll(SEL)].forEach((el) => {
    if (!dansFeuille && el.closest('dialog')) return;
    if (!visible(el)) return;
    const nom = nomLu(el), rl = role(el);
    const k0 = `${rl}|${nom}`;
    vus[k0] = (vus[k0] || 0) + 1;
    const i = out.length;
    el.setAttribute('data-robot-i', String(i));
    const kn = `${rl}|${nom.replace(/\d+/g, '#')}`;
    vus[kn] = (vus[kn] || 0) + 1;
    out.push({
      i, cle: `${k0}|${vus[k0]}`, cleN: `${kn}|${vus[kn]}`, role: rl, nom, texte: propre(el.innerText || el.value || ''),
      href: el.getAttribute('href') || '', desactive: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      courant: el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true',
      commun: !!el.closest('nav.tabbar, .demo-banner'), externe: !!el.getAttribute('target') || /^(https?:|mailto:|tel:)/.test(el.getAttribute('href') || ''),
    });
  });
  return out;
}

function etatDansPage() {
  const propre = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const aria = {};
  document.querySelectorAll('[data-robot-i]').forEach((el) => {
    aria[el.getAttribute('data-robot-i')] = ['aria-pressed', 'aria-checked', 'aria-expanded', 'aria-selected', 'aria-current'].map((a) => el.getAttribute(a)).join('/') + '/' + (el.checked ?? '') + '/' + (el.tagName === 'SUMMARY' ? el.parentElement.open : '');
  });
  const main = document.querySelector('dialog[open]') ? [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText).join('|') : (document.querySelector('main')?.innerText || document.body.innerText);
  let h = 0; for (let k = 0; k < main.length; k++) h = (h * 31 + main.charCodeAt(k)) | 0;
  return {
    url: location.origin + location.pathname, hash: location.hash || '#/', titre: document.title,
    theme: document.documentElement.getAttribute('data-theme') || 'auto',
    h1: propre(document.querySelector('.topbar h1, .welcome h1, main h1, h1')?.textContent),
    feuilles: [...document.querySelectorAll('dialog[open]')].map((d) => propre(d.querySelector('h2')?.textContent) || '(sans titre)'),
    toast: propre(document.querySelector('.toast:not([data-robot-vu]) p')?.textContent), aria, texte: h, y: Math.round(scrollY),
    focus: propre(document.activeElement && document.activeElement !== document.body ? (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent).slice(0, 60) : ''),
    introuvable: /introuvable/i.test(document.querySelector('main')?.innerText || ''),
  };
}

// ---------- robot ----------
async function robot(sortie) {
  const { chromium } = require('playwright');
  const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
  const seules = process.env.ROUTES ? process.env.ROUTES.split(',') : null;
  const b = await chromium.launch();
  const lignes = [];
  const js = new Set();
  const ecrire = () => fs.writeFileSync(sortie, JSON.stringify({ base, js: [...js], lignes }, null, 1));

  async function contexte() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
    await ctx.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
    await ctx.clock.resume();
    // Rien ne sort de la machine : seules les adresses locales passent.
    await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(() => {
      window.__fx = [];
      const pousse = (x) => window.__fx.push(x);
      try {
        navigator.share = async (d) => { pousse(`partage${d?.files?.length ? ` du fichier ${d.files[0].name}` : d?.text ? ' d’un texte' : d?.url ? ` du lien ${d.url}` : ''}`); };
        navigator.canShare = () => true;
      } catch { /* rien */ }
      try {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => pousse(`copié : « ${String(t).slice(0, 60)} »`), readText: async () => '' } });
      } catch { /* rien */ }
      window.open = (u) => { pousse(`fenêtre : ${u}`); return null; };
      window.print = () => pousse('impression');
    });
    const p = await ctx.newPage();
    p.on('response', (r) => { const m = /assets\/(index-[^/]*\.js)$/.exec(r.url()); if (m) js.add(m[1]); });
    p.on('dialog', async (d) => { await p.evaluate((m) => window.__fx.push(`confirmation : « ${m.slice(0, 80)} » (refusée)`), d.message()).catch(() => {}); await d.dismiss().catch(() => {}); });
    p.on('download', async (d) => { await p.evaluate((n) => window.__fx.push(`téléchargement : ${n}`), d.suggestedFilename()).catch(() => {}); });
    p.on('filechooser', async () => { await p.evaluate(() => window.__fx.push('choix d’un fichier')).catch(() => {}); });
    p.on('popup', async (w) => { await p.evaluate((u) => window.__fx.push(`nouvel onglet : ${u}`), w.url()).catch(() => {}); await w.close().catch(() => {}); });
    return { ctx, p };
  }

  async function demo(p) {
    await p.goto(base);
    await p.waitForTimeout(500);
    if (await p.locator('.demo-banner').count()) return;
    await p.getByRole('button', { name: /avec des enfants fictifs/ }).first().click();
    await p.waitForTimeout(1200);
    const seule = p.getByRole('button', { name: 'Explorer seule' });
    if (await seule.count()) { await seule.click(); await p.waitForTimeout(200); }
  }

  // Démonstration remise à neuf : « Quitter la démonstration » (base effacée), puis « Essayer avec des enfants fictifs ».
  async function neuve(p) {
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    const q = p.getByRole('button', { name: 'Quitter la démonstration' });
    if (await q.count()) { await q.click(); await p.waitForLoadState('load'); await p.waitForTimeout(600); }
    await demo(p);
  }

  // Ouvre une route à neuf (l'écran est démonté puis remonté), puis le chemin jusqu'à une feuille.
  async function ouvrir(p, x, chemin = []) {
    await p.evaluate(({ r, paie }) => {
      try { if (paie) localStorage.setItem('pam-paie-visible', '1'); else localStorage.removeItem('pam-paie-visible'); } catch { /* rien */ }
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      location.hash = '#/robot-vide';
      return new Promise((ok) => setTimeout(() => { location.hash = '#/' + r; ok(); }, 60));
    }, x);
    await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    for (const cle of chemin) {
      const ls = await p.evaluate(collecteDansPage, false);
      const el = ls.find((e) => e.cle === cle);
      if (!el) return false;
      await toucher(p, el.i);
      await p.waitForTimeout(450);
    }
    return true;
  }

  async function toucher(p, i) {
    const loc = p.locator(`[data-robot-i="${i}"]`);
    await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
    try { await loc.click({ timeout: 2500 }); return ''; } catch {
      try { await loc.evaluate((e) => e.click()); return 'clic direct (élément couvert)'; } catch (e) { return 'clic impossible'; }
    }
  }

  function effets(av, ap, el, fx) {
    const out = [];
    if (ap.url !== av.url) out.push(`page : ${ap.url}`);
    if (ap.hash !== av.hash) out.push(`adresse : ${ap.hash} (écran « ${ap.h1 || ap.titre} »)`);
    const nouvelles = ap.feuilles.filter((f) => !av.feuilles.includes(f));
    const fermees = av.feuilles.filter((f) => !ap.feuilles.includes(f));
    nouvelles.forEach((f) => out.push(`feuille : « ${f} »`));
    fermees.forEach((f) => out.push(`feuille fermée : « ${f} »`));
    if (ap.toast && ap.toast !== av.toast) out.push(`message : « ${ap.toast} »`);
    if (ap.theme !== av.theme) out.push(`thème : ${ap.theme}`);
    fx.forEach((f) => out.push(f));
    if (!out.length) {
      const ch = Object.keys(ap.aria).filter((k) => av.aria[k] !== undefined && av.aria[k] !== ap.aria[k]);
      if (ch.includes(String(el.i))) out.push('état changé (cet élément)');
      else if (ch.length) out.push(`état changé (${ch.length} autre${ch.length > 1 ? 's' : ''} élément${ch.length > 1 ? 's' : ''})`);
      if (ap.texte !== av.texte) out.push('contenu changé');
      if (!out.length && ap.y !== av.y) out.push('défilement');
      if (!out.length && ap.focus !== av.focus && ap.focus) out.push(`focus : « ${ap.focus} »`);
    }
    return out;
  }

  const feuillesVues = new Set();
  const normFeuille = (t) => t.replace(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d+ \w+/gi, '<jour>').replace(/\d+/g, '#');

  async function parcourir(p, x, chemin, ecran, communFait) {
    if (!(await ouvrir(p, x, chemin))) { lignes.push({ ecran, nom: '(chemin perdu)', effet: ['feuille introuvable après réouverture'] }); return; }
    const liste = await p.evaluate(collecteDansPage, chemin.length > 0);
    for (const el0 of liste) {
      if (el0.commun && communFait) continue;
      const ligne = { ecran, role: el0.role, nom: el0.nom, texte: el0.texte, href: el0.href, courant: el0.courant, commun: el0.commun, effet: [] };
      lignes.push(ligne);
      if (el0.desactive) { ligne.effet = ['désactivé']; continue; }
      if (/^(mailto:|tel:)/.test(el0.href)) { ligne.effet = [`lien ${el0.href.split(':')[0]} : ${el0.href}`]; continue; }
      if (x.neuf) await neuve(p);
      if (!(await ouvrir(p, x, chemin))) { ligne.effet = ['feuille introuvable après réouverture']; continue; }
      const ls = await p.evaluate(collecteDansPage, chemin.length > 0);
      // Un geste d'avant a pu changer un chiffre du nom (heures, nombre) : même élément, chiffres mis à part.
      const el = ls.find((e) => e.cle === el0.cle) ?? ls.find((e) => e.cleN === el0.cleN);
      if (!el) { ligne.effet = ['introuvable après réouverture']; continue; }
      await p.evaluate(() => { window.__fx = []; document.querySelectorAll('.toast').forEach((t) => t.setAttribute('data-robot-vu', '1')); });
      const av = await p.evaluate(etatDansPage);
      const note = await toucher(p, el.i);
      await p.waitForTimeout(450);
      if (/robot-vide/.test(await p.evaluate(() => location.hash))) await p.waitForTimeout(300);
      let ap, fx;
      try {
        ap = await p.evaluate(etatDansPage);
        fx = await p.evaluate(() => window.__fx || []);
      } catch { await p.waitForTimeout(800); ap = await p.evaluate(etatDansPage); fx = []; }
      ligne.effet = effets(av, ap, el, fx);
      if (note) ligne.effet.push(note);
      ligne.introuvable = ap.introuvable && !av.introuvable;
      ligne.destination = ap.hash !== av.hash ? ap.hash : '';
      ligne.titreArrivee = ap.hash !== av.hash ? ap.titre : '';
      // Démonstration quittée (ou page rechargée) : on y revient pour la suite.
      if (!x.pub && !(await p.locator('.demo-banner').count())) { await demo(p); }
      // Feuille ouverte : ses éléments, une fois par feuille (titre sans date ni chiffre).
      const nouvelle = ap.feuilles.find((f) => !av.feuilles.includes(f));
      if (nouvelle && chemin.length === 0) {
        const kf = normFeuille(nouvelle);
        if (!feuillesVues.has(kf)) { feuillesVues.add(kf); await parcourir(p, x, [el.cle], `${ecran} › feuille « ${nouvelle} »`, true); }
      }
    }
  }

  // Démonstration
  let { ctx, p } = await contexte();
  await demo(p);
  let communFait = false;
  for (const x of ROUTES) {
    if (seules && !seules.includes(x.nom ?? x.r)) continue;
    const t0 = Date.now();
    // Données de démonstration neuves pour chaque route : un geste d'une route ne change pas la suivante.
    await ctx.close();
    ({ ctx, p } = await contexte());
    await demo(p);
    await parcourir(p, x, [], nomRoute(x), communFait);
    communFait = true;
    ecrire();
    console.log(`${nomRoute(x)} : ${lignes.filter((l) => l.ecran.startsWith(nomRoute(x))).length} éléments, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  // Site public : un contexte neuf par élément (un geste peut créer le compte ou lancer la démonstration).
  for (const x of PUBLIQUES) {
    if (seules && !seules.includes(nomRoute(x))) continue;
    const t0 = Date.now();
    await ctx.close();
    ({ ctx, p } = await contexte());
    await p.goto(base + '#/' + x.r); await p.waitForTimeout(700);
    const liste = await p.evaluate(collecteDansPage, false);
    for (const el0 of liste) {
      const ligne = { ecran: nomRoute(x), role: el0.role, nom: el0.nom, texte: el0.texte, href: el0.href, courant: el0.courant, effet: [] };
      lignes.push(ligne);
      if (el0.desactive) { ligne.effet = ['désactivé']; continue; }
      if (/^(mailto:|tel:)/.test(el0.href)) { ligne.effet = [`lien ${el0.href.split(':')[0]} : ${el0.href}`]; continue; }
      await ctx.close();
      ({ ctx, p } = await contexte());
      await p.goto(base + '#/' + x.r); await p.waitForTimeout(700);
      const ls = await p.evaluate(collecteDansPage, false);
      const el = ls.find((e) => e.cle === el0.cle) ?? ls.find((e) => e.cleN === el0.cleN);
      if (!el) { ligne.effet = ['introuvable après réouverture']; continue; }
      await p.evaluate(() => { window.__fx = []; });
      const av = await p.evaluate(etatDansPage);
      const note = await toucher(p, el.i);
      await p.waitForTimeout(700);
      let ap, fx;
      try { ap = await p.evaluate(etatDansPage); fx = await p.evaluate(() => window.__fx || []); } catch { await p.waitForTimeout(800); ap = await p.evaluate(etatDansPage); fx = []; }
      ligne.effet = effets(av, ap, el, fx);
      if (note) ligne.effet.push(note);
      ligne.destination = ap.hash !== av.hash ? ap.hash : '';
      ligne.titreArrivee = ap.hash !== av.hash ? ap.titre : '';
    }
    ecrire();
    console.log(`${nomRoute(x)} : ${lignes.filter((l) => l.ecran === nomRoute(x)).length} éléments, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await ctx.close();
  await b.close();
  ecrire();
  console.log('fichier principal servi :', [...js].join(', '), '; éléments :', lignes.length);
}

// ---------- verdicts et table ----------
const sansAccent = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VIDES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'a', 'au', 'aux', 'ton', 'ta', 'tes', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'd', 'l', 'en', 'pour', 'sur', 'avec', 'ce', 'cette', 'voir', 'ouvrir', 'arvela']);
const mots = (t) => new Set(sansAccent(t || '').split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !VIDES.has(m)).map((m) => m.replace(/s$/, '')));
const normHash = (h) => (h || '').replace(/^#\/?/, '#/').replace(/\/$/, '');

function verdict(l) {
  const e = l.effet.join(' ; ');
  if (!l.nom) return 'ÉCART : sans nom lu';
  if (e === 'désactivé') return 'désactivé (rien à toucher)';
  if (/introuvable après|chemin perdu/.test(e)) return 'non mesuré (élément qui change à chaque ouverture)';
  if (l.introuvable) return 'ÉCART : lien mort (« introuvable »)';
  if (l.destination) {
    const seg = normHash(l.destination).slice(2).split('/')[0].split('?')[0];
    if (!['robot-vide'].includes(seg) && !CONNUES.includes(seg)) return 'ÉCART : lien mort (route inconnue)';
  }
  if (l.href && l.href.startsWith('#/') && l.destination && normHash(l.href) !== normHash(l.destination)) return 'ÉCART : mène ailleurs que son lien';
  if (l.nom === 'Retour' && l.destination) return 'OK (écran parent)';
  if (!l.effet.length) {
    if (l.courant) return 'OK (déjà choisi)';
    return 'ÉCART : sans effet';
  }
  if (l.effet.every((x) => /^(défilement|focus)/.test(x))) {
    if (l.courant) return 'OK (déjà choisi)';
    if (l.role !== 'link') return 'à relire (seulement un défilement ou le focus)';
  }
  if (l.destination) {
    const dest = /écran « (.*) »/.exec(e)?.[1] || '';
    const a = mots(l.nom), d = mots(dest + ' ' + (l.titreArrivee || '') + ' ' + l.destination.replace(/[#/-]/g, ' '));
    if (![...a].some((m) => d.has(m))) return 'à relire (nom et écran d’arrivée sans mot commun)';
  }
  return 'OK';
}

function table(fichier, fichier10, manuels) {
  const { lignes, js, base } = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const v10 = fichier10 ? JSON.parse(fs.readFileSync(fichier10, 'utf8')).lignes : null;
  const man = manuels && fs.existsSync(manuels) ? JSON.parse(fs.readFileSync(manuels, 'utf8')) : {};
  const cle = (l) => `${l.ecran}|${l.role}|${l.nom}`;
  const esc = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = [];
  lignes.forEach((l) => { l.verdict = man[cle(l)] || verdict(l); });
  const nb = (re) => lignes.filter((l) => re.test(l.verdict)).length;
  out.push(`Fichier principal servi : ${js.join(', ')} (${base}). Éléments : ${lignes.length}. OK : ${nb(/^OK/)} ; écarts : ${nb(/^ÉCART/)} ; à relire : ${nb(/^à relire/)} ; désactivés : ${nb(/^désactivé/)} ; non mesurés : ${nb(/^non mesuré/)}.`, '');
  // Deux noms différents, même endroit (même écran de départ ; barre d'onglets et flèche Retour à part).
  out.push('## Deux noms différents qui mènent au même endroit', '');
  const groupes = {};
  lignes.filter((l) => l.destination && !l.commun).forEach((l) => { const k = `${l.ecran}|${normHash(l.destination)}`; (groupes[k] ||= new Set()).add(l.nom); });
  const doubles = Object.entries(groupes).filter(([, s]) => s.size > 1);
  if (!doubles.length) out.push('Aucun.');
  else { out.push('| Écran | Destination | Noms |', '|---|---|---|'); doubles.forEach(([k, s]) => { const [e, d] = k.split('|'); out.push(`| ${esc(e)} | ${esc(d)} | ${[...s].map((n) => `« ${esc(n)} »`).join(', ')} |`); }); }
  out.push('');
  // Comparaison à la Vision 1.0 (même écran, même rôle, même nom).
  if (v10) {
    out.push('## Effet différent de la Vision 1.0 pour le même bouton', '');
    const index = {}; v10.forEach((l) => { index[cle(l)] = l; });
    const sorte = (l) => (l.destination ? `adresse ${normHash(l.destination)}` : l.effet.filter((x) => /^(feuille :|message|partage|copié|téléchargement|fenêtre|nouvel onglet|impression|choix)/.test(x)).map((x) => x.replace(/« .*? »/g, (m) => m.replace(/\d+/g, '#'))).join(' ; ') || (l.effet.length ? 'changement dans l’écran' : 'aucun effet'));
    const mesure = (l) => !/introuvable|chemin perdu/.test(l.effet.join(' '));
    const diffs = lignes.filter((l) => index[cle(l)] && mesure(l) && mesure(index[cle(l)]) && sorte(index[cle(l)]) !== sorte(l));
    if (!diffs.length) out.push('Aucun.');
    else { out.push('| Écran | Nom lu | Vision 1.0 | Maintenant |', '|---|---|---|---|'); diffs.forEach((l) => out.push(`| ${esc(l.ecran)} | ${esc(l.nom)} | ${esc(sorte(index[cle(l)]))} | ${esc(sorte(l))} |`)); }
    const nouveaux = lignes.filter((l) => !index[cle(l)]).length, partis = v10.filter((l) => !lignes.some((m) => cle(m) === cle(l))).length;
    out.push('', `Éléments sans équivalent de même nom : ${nouveaux} nouveaux (nom ou écran nouveau) ; ${partis} de la Vision 1.0 (renommés ou déplacés par la Vision 1.1, liste en annexe).`, '');
    out.push('<details><summary>Éléments de la Vision 1.0 sans équivalent de même nom</summary>', '', '| Écran | Rôle | Nom lu | Effet en Vision 1.0 |', '|---|---|---|---|');
    v10.filter((l) => !lignes.some((m) => cle(m) === cle(l))).forEach((l) => out.push(`| ${esc(l.ecran)} | ${l.role} | ${esc(l.nom)} | ${esc(l.effet.join(' ; '))} |`));
    out.push('', '</details>', '');
  }
  out.push('## Table complète (une ligne par élément)', '', '| Écran | Rôle | Nom lu | Texte visible | Effet réel | Verdict |', '|---|---|---|---|---|---|');
  lignes.forEach((l) => out.push(`| ${esc(l.ecran)} | ${l.role} | ${esc(l.nom)} | ${esc(l.texte === l.nom ? '=' : l.texte)} | ${esc(l.effet.join(' ; ') || 'aucun effet')} | ${esc(l.verdict)} |`));
  return out.join('\n');
}

module.exports = { CONNUES, verdict };
if (require.main === module) {
  const [cmd, a, b2, c] = process.argv.slice(2);
  if (cmd === 'robot') robot(a || 'boutons.json').catch((e) => { console.error(e); process.exit(1); });
  else if (cmd === 'table') process.stdout.write(table(a, b2, c) + '\n');
  else { console.error('usage : boutons.cjs robot <sortie.json> | table <sortie.json> [vision-1.0.json] [verdicts.json]'); process.exit(2); }
}
