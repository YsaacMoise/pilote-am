// Fabrication du relevé du mois en PDF, entièrement sur le téléphone (aucun réseau).
// Chargé seulement au clic (import dynamique) : pdf-lib et les polices ne pèsent pas sur l'ouverture de l'app.
// A4 portrait, 100 % encre #1E201D : lisible imprimé en noir et blanc. Ne doit jamais ressembler à un bulletin de salaire.
import { LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ReleveDonnees } from './donnees';
import cormorantUrl from './polices/cormorant-600.ttf?url';
import jakartaUrl from './polices/jakarta-400.ttf?url';
import jakartaBoldUrl from './polices/jakarta-700.ttf?url';
import monoUrl from './polices/jetbrains-400.ttf?url';
import monoBoldUrl from './polices/jetbrains-700.ttf?url';

const INK = rgb(0x1e / 255, 0x20 / 255, 0x1d / 255);
const W = 595.28, H = 841.89; // A4 en points
const M = 44; // marges
const FOOT = 70; // hauteur réservée au pied de page

interface Fonts { titre: PDFFont; texte: PDFFont; gras: PDFFont; mono: PDFFont; monoGras: PDFFont }

/** Espaces fines ramenées à l'espace insécable ; remplacé plus bas par un nettoyeur qui connaît les polices */
let clean = (s: string) => s.replace(/[\u202f\u2009]/g, '\u00a0');

/** Un caractère absent des polices perd son accent (« ṇ » → « n ») ou devient « ? » : jamais de lettre qui disparaît. */
function nettoyeur(fonts: PDFFont[]) {
  const sets = fonts.map((f) => new Set(f.getCharacterSet()));
  const ok = (ch: string) => sets.every((s) => s.has(ch.codePointAt(0)!));
  return (s: string) => {
    let out = '';
    for (const ch of s.replace(/[\u202f\u2009]/g, '\u00a0').normalize('NFC')) {
      if (ok(ch)) { out += ch; continue; }
      const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
      out += base && [...base].every(ok) ? base : '?';
    }
    return out;
  };
}

/** Coupe un texte trop long pour `max` points, avec « … » */
function tronquer(text: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

async function bytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('police introuvable');
  return new Uint8Array(await r.arrayBuffer());
}

/** Sceau monochrome de la charte (déclinaison 06) : deux galets penchés et la perle, tout à l'encre. */
function sceau(p: PDFPage, x: number, y: number, size: number) {
  // Repère du logo : boîte de 120 × 120, origine en haut à gauche (src/ui/Logo.tsx).
  const k = size / 120;
  const pt = (lx: number, ly: number) => ({ x: x + lx * k, y: y + size - ly * k });
  const galet = (cx: number, cy: number, deg: number) => {
    // Galet = rectangle 20 × 78 aux bouts ronds : un trait épais de 20 à bouts ronds, de longueur 78 − 20.
    const a = (deg * Math.PI) / 180;
    const half = 29; // (78 − 20) / 2
    const dx = -Math.sin(a) * half, dy = Math.cos(a) * half; // rotation dans le sens des aiguilles d'une montre (SVG)
    p.drawLine({ start: pt(cx - dx, cy - dy), end: pt(cx + dx, cy + dy), thickness: 20 * k, color: INK, lineCap: LineCapStyle.Round });
  };
  galet(43, 57, 19);
  galet(77, 57, -19);
  const c = pt(60, 73);
  // Liseré couleur papier autour de la perle : elle reste lisible quand tout est à l'encre.
  p.drawCircle({ x: c.x, y: c.y, size: 11.5 * k, color: INK, borderColor: rgb(1, 1, 1), borderWidth: 2.5 * k });
}

function espace(p: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, track: number) {
  let cx = x;
  for (const ch of text) {
    p.drawText(ch, { x: cx, y, size, font, color: INK });
    cx += font.widthOfTextAtSize(ch, size) + track;
  }
  return cx - track - x;
}

/** Coupe un texte en lignes qui tiennent dans `max` points */
function couper(text: string, font: PDFFont, size: number, max: number): string[] {
  const mots = clean(text).split(' ');
  const out: string[] = [];
  let cur = '';
  for (const mot of mots) {
    const essai = cur ? `${cur} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, size) <= max || !cur) cur = essai;
    else { out.push(cur); cur = mot; }
  }
  if (cur) out.push(cur);
  return out;
}

export async function genererRelevePdf(d: ReleveDonnees): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${d.titre} · ${d.moisLabel} · ${d.enfant}`);
  doc.setAuthor(d.am || 'Arvela');
  doc.setCreator('Arvela');
  doc.setProducer('Arvela');
  doc.setLanguage('fr-FR');
  const [t, x, g, mo, mg] = await Promise.all([cormorantUrl, jakartaUrl, jakartaBoldUrl, monoUrl, monoBoldUrl].map(bytes));
  const f: Fonts = {
    titre: await doc.embedFont(t, { subset: true }),
    texte: await doc.embedFont(x, { subset: true }),
    gras: await doc.embedFont(g, { subset: true }),
    mono: await doc.embedFont(mo, { subset: true }),
    monoGras: await doc.embedFont(mg, { subset: true }),
  };
  clean = nettoyeur([f.titre, f.texte, f.gras, f.mono, f.monoGras]);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const txt = (s: string, px: number, py: number, size = 9.5, font = f.texte) =>
    page.drawText(clean(s), { x: px, y: py, size, font, color: INK });
  const droite = (s: string, px: number, py: number, size = 9.5, font = f.texte) =>
    txt(s, px - font.widthOfTextAtSize(clean(s), size), py, size, font);
  const trait = (py: number, epais = 0.5, x1 = M, x2 = W - M) =>
    page.drawLine({ start: { x: x1, y: py }, end: { x: x2, y: py }, thickness: epais, color: INK });

  const nouvellePage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    if (pages.length === 1) {
      // En-tête complet : sceau, ARVELA espacé, sous-titre, puis titre du document.
      sceau(page, M, H - M - 46, 46);
      espace(page, 'ARVELA', M + 58, H - M - 24, f.titre, 22, 5);
      espace(page, 'GESTION & SUIVI DE L’ACCUEIL', M + 59, H - M - 39, f.gras, 6.5, 1.6);
      droite(d.titre, W - M, H - M - 20, 17, f.titre);
      droite(d.moisLabel.replace(/^./, (c) => c.toUpperCase()), W - M, H - M - 38, 11, f.gras);
      y = H - M - 62;
      trait(y, 1.2);
      y -= 20;
    } else {
      sceau(page, M, H - M - 22, 22);
      espace(page, 'ARVELA', M + 30, H - M - 15, f.titre, 13, 3);
      droite(tronquer(clean(`${d.titre} · ${d.moisLabel} · ${d.enfant}`), f.gras, 9.5, W - 2 * M - 110), W - M, H - M - 15, 9.5, f.gras);
      y = H - M - 30;
      trait(y, 0.8);
      y -= 18;
    }
  };
  const place = (h: number) => { if (y - h < FOOT + M - 20) nouvellePage(); };

  const section = (titre: string) => {
    place(40);
    y -= 6;
    txt(titre, M, y, 13, f.titre);
    y -= 7;
    trait(y, 0.8);
    y -= 14;
  };

  nouvellePage();

  // Qui et quand
  const infos: [string, string][] = [
    ['Enfant', d.enfant],
    ['Famille', d.famille || '—'],
    ['Assistante maternelle', d.am || '—'],
    ['Mois', d.moisLabel + (d.provisoire ? ' (en cours : chiffres provisoires)' : '')],
  ];
  for (const [k, v] of infos) {
    txt(k, M, y, 9.5, f.texte);
    const lignes = couper(v, f.gras, 9.5, W - 2 * M - 130);
    lignes.forEach((s, i) => txt(s, M + 130, y - i * 12, 9.5, f.gras));
    y -= 15 + (lignes.length - 1) * 12;
  }
  y -= 6;

  // Tableau des jours
  const cols = { jour: M, prevu: M + 62, reel: M + 200, abs: M + 338 };
  const absMax = W - M - cols.abs;
  const entete = () => {
    txt('Date', cols.jour, y, 8, f.gras);
    txt('Horaires prévus', cols.prevu, y, 8, f.gras);
    txt('Horaires réels', cols.reel, y, 8, f.gras);
    txt('Absence', cols.abs, y, 8, f.gras);
    y -= 5;
    trait(y, 0.8);
    y -= 11;
  };
  section('Les jours du mois');
  entete();
  for (const l of d.lignes) {
    const absL = l.absence ? couper(l.absence, f.texte, 8, absMax) : [];
    const prevL = couper(l.prevu, f.mono, 8, cols.reel - cols.prevu - 8);
    const reelL = couper(l.reel, l.reel.includes('–') ? f.mono : f.texte, 8, cols.abs - cols.reel - 8);
    const n = Math.max(1, absL.length, prevL.length, reelL.length);
    const h = n * 10 + 4;
    if (y - h < FOOT + M - 20) { nouvellePage(); section('Les jours du mois (suite)'); entete(); }
    txt(l.jour, cols.jour, y, 8, f.texte);
    prevL.forEach((s, i) => txt(s, cols.prevu, y - i * 10, 8, f.mono));
    reelL.forEach((s, i) => txt(s, cols.reel, y - i * 10, 8, l.reel.includes('–') ? f.mono : f.texte));
    absL.forEach((s, i) => txt(s, cols.abs, y - i * 10, 8, f.texte));
    y -= (n - 1) * 10 + 4;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.25, color: INK, opacity: 0.45 });
    y -= 9.5;
  }
  if (!d.lignes.length) { txt('Aucun jour d’accueil prévu ce mois-ci.', M, y, 9); y -= 14; }
  y -= 8;

  // Totaux
  const liste = (rows: { label: string; value: string; total?: boolean }[]) => {
    for (const r of rows) {
      place(18);
      if (r.total) { trait(y + 10, 0.8, W / 2, W - M); }
      txt(r.label, M, y, r.total ? 10.5 : 9.5, r.total ? f.gras : f.texte);
      droite(r.value, W - M, y, r.total ? 10.5 : 9.5, r.total ? f.monoGras : f.mono);
      y -= r.total ? 18 : 15;
    }
  };
  // Un bloc court ne se coupe pas entre deux pages.
  place(40 + d.totaux.length * 15);
  section('Totaux');
  liste(d.totaux);
  y -= 4;
  place(40 + d.montants.length * 16);
  section('Montants du mois');
  liste(d.montants);
  y -= 4;

  // Lignes de la déclaration Pajemploi, dans l'ordre de l'écran Mois
  section('À déclarer sur Pajemploi (par le parent employeur)');
  for (const l of d.declaration) {
    const hint = l.hint ? couper(l.hint, f.texte, 7.5, W - 2 * M - 120) : [];
    place(15 + hint.length * 9);
    txt(l.label, M, y, 9.5, f.gras);
    droite(l.value, W - M, y, 9.5, f.mono);
    y -= 11;
    for (const s of hint) { txt(s, M, y, 7.5, f.texte); y -= 9; }
    y -= 4;
  }

  // Pied de chaque page : mention obligatoire, fabrication, version, numéro de page
  const n = pages.length;
  pages.forEach((p, i) => {
    page = p;
    const yb = M + 24;
    trait(yb + 12, 0.5);
    couper(d.mention, f.texte, 7.5, W - 2 * M).forEach((s, k) => txt(s, M, yb - k * 9.5, 7.5, f.texte));
    txt(`${d.fabrique} · Arvela version ${d.version}`, M, M - 2, 7, f.texte);
    droite(`Page ${i + 1} sur ${n}`, W - M, M - 2, 7, f.texte);
  });

  return doc.save();
}
