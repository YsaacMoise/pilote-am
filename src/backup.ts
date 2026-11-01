// Sauvegarde complète, restauration contrôlée, export anonymisé du pilote.
import * as db from './db';
import { state } from './store';
import { addMonths, monthOf, today, type Month } from './engine/dates';
import { computeMonth } from './engine/month';
import { weeklyMinutes, daysPerWeek } from './engine/payroll';
import { ctxFor } from './store';
import type { Contract } from './engine/model';

export const FORMAT = 'cc-pilote-am-sauvegarde';
export const FORMAT_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  createdAt: string;
  data: db.Dump;
}

/** Le lien parent (secret et code) ne part jamais dans un fichier : qui l'aurait ouvrirait la page des parents. */
export function sansLiens(d: db.Dump): db.Dump {
  return { ...d, contracts: (d.contracts as Contract[]).map(({ partage: _, ...c }) => c) };
}

export async function buildBackup(): Promise<File> {
  const data = sansLiens(await db.dumpAll());
  const b: BackupFile = { format: FORMAT, version: FORMAT_VERSION, createdAt: new Date().toISOString(), data };
  const name = `pilote-am-sauvegarde-${today()}.json`;
  return new File([JSON.stringify(b)], name, { type: 'application/json' });
}

export interface Checked { ok: true; backup: BackupFile; summary: string }
export interface Rejected { ok: false; error: string }

/** Vérifie un fichier de sauvegarde avant de remplacer quoi que ce soit */
export async function checkBackup(file: File): Promise<Checked | Rejected> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas une sauvegarde lisible (format JSON attendu).' };
  }
  const b = raw as BackupFile;
  if (!b || b.format !== FORMAT) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde d’Arvela.' };
  if (typeof b.version !== 'number' || b.version > FORMAT_VERSION) {
    return { ok: false, error: 'Cette sauvegarde vient d’une version plus récente de l’app. Mets l’app à jour puis réessaie.' };
  }
  const d = b.data as any;
  for (const s of db.STORES) {
    if (s === 'snapshots') continue;
    if (d?.[s] != null && !Array.isArray(d[s])) return { ok: false, error: `Sauvegarde abîmée (partie « ${s} »).` };
    d[s] = d?.[s] ?? [];
  }
  for (const c of d.contracts as Contract[]) {
    if (!c.id || !c.start || !c.planning || typeof c.rateNet !== 'number') return { ok: false, error: 'Sauvegarde abîmée : un contrat est incomplet.' };
  }
  const n = d.contracts.length;
  const when = new Date(b.createdAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  return { ok: true, backup: b, summary: `${n} contrat${n > 1 ? 's' : ''}, ${d.days.length} journée${d.days.length > 1 ? 's' : ''} pointée${d.days.length > 1 ? 's' : ''}, sauvegarde du ${when}` };
}

/** Export mensuel anonymisé : enfants A/B/C, aucun prénom, aucune note du carnet */
export function buildPilotExport(month: Month = addMonths(monthOf(today()), -1)) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const names = new Map<string, string>();
  state.contracts.forEach((c, i) => names.set(c.id, letters[i] ?? `Z${i}`));
  const scrub = (t: string) => {
    let s = t;
    for (const c of state.contracts) {
      for (const n of [c.child, c.family, state.settings.amName]) {
        if (n && n.trim().length > 1) s = s.replace(new RegExp(n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[nom]');
      }
    }
    return s;
  };
  const inMonth = (ts: number) => monthOf(new Date(ts).toISOString().slice(0, 10)) === month;
  const enfants = state.contracts.map((c) => {
    const r = computeMonth(ctxFor(c), month, state.settings.enfantsACharge);
    return {
      enfant: names.get(c.id),
      annee: c.yearType === 'complete' ? 'complète' : 'incomplète',
      semaines: c.weeks,
      heuresParSemaine: Math.round((weeklyMinutes(c.planning) / 60) * 100) / 100,
      joursParSemaine: daysPerWeek(c.planning),
      deuxPlages: Object.values(c.planning).some((p) => p.length > 1),
      reprise: c.trackedFrom > c.start,
      bulletinsImportes: c.history.filter((h) => h.source === 'pdf').length,
      bulletinsManuels: c.history.filter((h) => h.source === 'manuel').length,
      mois: r.active ? {
        heuresNormales: r.heuresNormales, joursActivite: r.joursActivite, minutesComplementaires: r.complMin,
        minutesMajorees: r.majContratMin + r.majMin, joursRetenus: r.deductedDays, departsOublies: r.forgotten.length,
        joursPointes: [...state.days.values()].filter((d) => d.cid === c.id && d.date.startsWith(month)).length,
        entreesCarnet: state.journal.filter((j) => j.cid === c.id && j.date.startsWith(month)).length,
      } : null,
    };
  });
  const usage = state.usage.filter((u) => inMonth(u.ts));
  const parEvenement: Record<string, number> = {};
  for (const u of usage) parEvenement[u.ev] = (parEvenement[u.ev] ?? 0) + 1;
  const ecrans: Record<string, number> = {};
  for (const u of usage) if (u.ev === 'ecran' && u.screen) ecrans[u.screen] = (ecrans[u.screen] ?? 0) + 1;
  const joursUtilises = new Set(usage.map((u) => new Date(u.ts).toISOString().slice(0, 10))).size;
  return {
    format: 'cc-pilote-am-export-anonyme',
    version: 1,
    mois: month,
    genereLe: new Date().toISOString().slice(0, 10),
    enfants,
    usage: { joursUtilises, parEvenement, ecrans },
    caCoince: state.feedback.filter((f) => inMonth(f.ts)).map((f) => ({ ecran: f.screen, texte: scrub(f.text), jour: new Date(f.ts).getDate() })),
  };
}
