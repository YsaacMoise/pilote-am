// Lecture des bulletins Pajemploi en PDF, entièrement sur le téléphone (pdf.js, build « legacy » pour iOS).
import type { Month } from './engine/dates';
import { parseEuros } from './engine/money';

export interface Extracted {
  month?: Month;
  net?: number;
  brut?: number;
  heures?: number;
  jours?: number;
  entretien?: number;
  cpJours?: number;
  child?: string;
  text: string;
}

/** Le PDF ne contient qu'une image (scan, photo enregistrée en PDF) : aucun texte à lire. */
export class ScanError extends Error {
  constructor() { super('Ce PDF est un scan ou une photo : l’app ne peut pas y lire de texte. Télécharge plutôt le bulletin depuis ton compte Pajemploi, ou saisis les montants à la main.'); }
}

/** Moins de 40 lettres ou chiffres sur toutes les pages : c'est une image, pas un vrai PDF de bulletin. */
export function isScanText(text: string): boolean {
  return (text.match(/[\p{L}\d]/gu) ?? []).length < 40;
}

export async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '';
    for (const it of tc.items as Array<{ str: string; hasEOL?: boolean }>) {
      line += it.str;
      line += it.hasEOL ? '\n' : ' ';
    }
    parts.push(line);
  }
  await doc.destroy();
  const text = parts.join('\n').replace(/[ \t  ]+/g, ' ');
  if (isScanText(text)) throw new ScanError();
  return text;
}

const MOIS: Record<string, string> = {
  janvier: '01', fevrier: '02', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07',
  aout: '08', août: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', décembre: '12',
};

const AMOUNT = '(\\d{1,3}(?:[ .]\\d{3})*(?:,\\d{2})|\\d+[.,]\\d{2})';

function amountAfter(text: string, labels: string[]): number | undefined {
  for (const l of labels) {
    const re = new RegExp(`${l}[^\\d\\n]{0,60}?${AMOUNT}`, 'i');
    const m = text.match(re);
    if (m) {
      const v = parseEuros(m[1].replace(/[ .](?=\d{3}\b)/g, ''));
      if (v != null) return v;
    }
  }
  return undefined;
}

function numberAfter(text: string, labels: string[]): number | undefined {
  for (const l of labels) {
    const re = new RegExp(`${l}[^\\d\\n]{0,40}?(\\d+(?:[.,]\\d+)?)`, 'i');
    const m = text.match(re);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return undefined;
}

/** Extraction tolérante : les libellés Pajemploi peuvent varier, la saisie reste toujours modifiable. */
export function parseBulletin(text: string): Extracted {
  const t = text;
  const out: Extracted = { text: t };
  const mp = t.match(/p[ée]riode[^\n]{0,30}?(?:du\s*)?\d{2}\/(\d{2})\/(\d{4})/i) ?? t.match(/(\d{2})\/(\d{4})/);
  if (mp) out.month = `${mp[2]}-${mp[1]}` as Month;
  const mm = t.match(/(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(20\d{2})/i);
  if (mm) out.month = `${mm[2]}-${MOIS[mm[1].toLowerCase()] ?? MOIS[mm[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]}` as Month;
  out.net = amountAfter(t, ['salaire net (?:pay[ée]|vers[ée]|à payer|a payer)', 'net (?:à|a) payer', 'net pay[ée]', 'salaire net']);
  out.brut = amountAfter(t, ['salaire brut', 'total brut', 'brut']);
  out.entretien = amountAfter(t, ['indemnit[ée]s? d.entretien', 'entretien']);
  out.heures = numberAfter(t, ['nombre d.heures normales', 'heures normales', 'nombre d.heures']);
  const j = numberAfter(t, ['jours d.activit[ée]', 'nombre de jours']);
  if (j != null) out.jours = Math.round(j);
  const cp = numberAfter(t, ['jours de cong[ée]s']);
  if (cp != null) out.cpJours = cp;
  const ch = t.match(/enfant\s*:?\s*([A-ZÉÈÀÂÎÏÔÛÇ][\p{L}'-]+)/u);
  if (ch) out.child = ch[1];
  return out;
}
