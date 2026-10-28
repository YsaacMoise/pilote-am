/**
 * Lecture des bulletins Pajemploi en PDF, entièrement sur le téléphone.
 * Le texte est extrait avec pdf.js (version « legacy », compatible avec les iPhone
 * plus anciens), puis les montants sont repérés par leurs libellés.
 * Rien n'est envoyé : le fichier ne quitte pas l'appareil.
 */
import { parseEuros, type Cents } from './engine/money';
import type { YearMonth } from './engine/dates';

export interface ParsedBulletin {
  month?: YearMonth;
  netCents?: Cents;
  grossCents?: Cents;
  hours?: number;
  days?: number;
  entretienCents?: Cents;
  mealsCents?: Cents;
  kmCents?: Cents;
  /** Nombre de montants reconnus, pour juger de la fiabilité */
  found: number;
}

interface TextItem {
  str: string;
  transform: number[];
}

/** Texte du PDF, ligne par ligne (les morceaux d'une même hauteur sont regroupés). */
export async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', document.baseURI).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; s: string }>>();
    for (const raw of content.items as unknown[]) {
      const item = raw as Partial<TextItem>;
      if (typeof item.str !== 'string' || !item.transform || item.str.trim() === '') continue;
      const y = Math.round((item.transform[5] ?? 0) / 3) * 3;
      const x = item.transform[4] ?? 0;
      const row = rows.get(y) ?? [];
      row.push({ x, s: item.str });
      rows.set(y, row);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const row = (rows.get(y) ?? []).sort((a, b) => a.x - b.x);
      lines.push(row.map((r) => r.s.trim()).join('  '));
    }
  }
  await doc.destroy();
  return lines.join('\n');
}

const MONTHS: Record<string, string> = {
  janvier: '01', fevrier: '02', février: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', aout: '08', août: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', décembre: '12',
};

const AMOUNT = String.raw`(-?\d{1,3}(?:[   .]\d{3})*(?:[,.]\d{1,2})|-?\d+(?:[,.]\d{1,2})?)`;
const NUMBER = String.raw`(\d+(?:[,.]\d+)?)`;

function amount(s: string): Cents | undefined {
  const cleaned = s.replace(/[   ]/g, '');
  // « 1.234,56 » : le point sépare les milliers
  const normalized = /\.\d{3},/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned;
  const v = parseEuros(normalized);
  return v === null ? undefined : v;
}

/** Cherche la valeur qui suit un libellé : sur la même ligne, sinon sur la ligne suivante. */
function after(lines: string[], label: RegExp, value: string): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = label.exec(line);
    if (!m) continue;
    const rest = line.slice(m.index + m[0].length);
    const same = new RegExp(String.raw`^[^\d\-]*?${value}`).exec(rest);
    if (same?.[1]) return same[1];
    const next = lines[i + 1];
    if (next) {
      const n = new RegExp(String.raw`^\s*[^\d\-a-zA-Z]*${value}`).exec(next);
      if (n?.[1]) return n[1];
    }
  }
  return undefined;
}

export function parseBulletin(text: string): ParsedBulletin {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: ParsedBulletin = { found: 0 };

  // Période d'emploi : « du 01/10/2026 au 31/10/2026 », « Période : octobre 2026 », « 10/2026 »
  const all = lines.join('\n');
  const range = /(?:p[ée]riode|du)\D{0,40}?(\d{2})\/(\d{2})\/(\d{4})/i.exec(all);
  const named = /(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/i.exec(all);
  if (range) out.month = `${range[3]}-${range[2]}`;
  else if (named) out.month = `${named[2]}-${MONTHS[(named[1] ?? '').toLowerCase()] ?? '01'}`;
  else {
    const short = /p[ée]riode\D{0,20}(\d{2})\/(\d{4})/i.exec(all);
    if (short) out.month = `${short[2]}-${short[1]}`;
  }

  const set = <K extends keyof ParsedBulletin>(key: K, v: ParsedBulletin[K] | undefined): void => {
    if (v === undefined || out[key] !== undefined) return;
    out[key] = v;
    out.found += 1;
  };

  set('netCents', amount(after(lines, /salaire\s+net(?!\s*imposable)(?:\s+(?:total|mensuel|vers[ée]))?/i, AMOUNT) ?? ''));
  set('grossCents', amount(after(lines, /salaire\s+brut/i, AMOUNT) ?? ''));
  const hours = after(lines, /(?:nombre\s+d['’]?\s*heures(?:\s+normales)?|heures\s+normales|heures\s+d['’]accueil)/i, NUMBER);
  if (hours) set('hours', Number(hours.replace(',', '.')));
  const days = after(lines, /(?:nombre\s+de\s+)?jours?\s+d['’]?\s*activit[ée]/i, String.raw`(\d+)`);
  if (days) set('days', Number(days));
  set('entretienCents', amount(after(lines, /indemnit[ée]s?\s+d['’]?\s*entretien/i, AMOUNT) ?? ''));
  set('mealsCents', amount(after(lines, /indemnit[ée]s?\s+de\s+repas|frais\s+de\s+repas/i, AMOUNT) ?? ''));
  set('kmCents', amount(after(lines, /indemnit[ée]s?\s+kilom[ée]triques?|frais\s+kilom[ée]triques?/i, AMOUNT) ?? ''));
  return out;
}
