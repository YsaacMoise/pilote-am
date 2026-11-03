// Carnet de liaison : textes lisibles tirés des champs précis (sieste, biberon, température) et résumé du jour.
// Fonctions pures, testées (tests/carnet.test.ts). Le texte « detail » reste la seule chose lue par le lien
// parent et par le résumé : les champs précis servent à le recalculer et à modifier une note.
import { minutes } from './dates';
import type { Journal } from './model';
import { de as deNom } from './texte';

export type Kind = Journal['kind'];

export const KIND_LABEL: Record<Kind, string> = { repas: 'Repas', sieste: 'Sommeil', change: 'Change', humeur: 'Humeur', soin: 'Soin', note: 'Note' };

/** Pour l'affichage : pas de retour à la ligne entre un nombre et son unité (« 180 ml », « 38,4 °C », « 1 h 55 ») */
export function insecable(s: string): string {
  return s.replace(/(\d) (ml|°C|h|min)\b/g, '$1\u00a0$2').replace(/(\d\u00a0h) (\d)/g, '$1\u00a0$2');
}

/** Fièvre : 38 °C ou plus */
export const SEUIL_FIEVRE = 38;

export function hh(t: string): string {
  return t.replace(':', 'h');
}

/** Durée lisible : « 45 min », « 1 h », « 1 h 55 » */
export function dureeLabel(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Minutes de sieste, ou undefined si la sieste n'est pas terminée ou si les heures sont incohérentes */
export function minutesSieste(j: Pick<Journal, 'time' | 'fin'>): number | undefined {
  if (!j.fin) return undefined;
  const d = minutes(j.fin) - minutes(j.time);
  return d > 0 ? d : undefined;
}

export function detailSieste(debut: string, fin?: string): string {
  if (!fin) return `Dort depuis ${hh(debut)}`;
  const d = minutesSieste({ time: debut, fin });
  return d ? `${hh(debut)} à ${hh(fin)} (${dureeLabel(d)})` : `${hh(debut)} à ${hh(fin)}`;
}

export function detailBiberon(ml: number): string {
  return `Biberon de ${ml} ml`;
}

/** « 38,2 » ou « 38.2 » → 38.2 ; refuse ce qui n'est pas une température corporelle plausible */
export function parseTemperature(s: string): number | undefined {
  const v = Number(s.trim().replace(',', '.'));
  if (!Number.isFinite(v) || v < 34 || v > 43) return undefined;
  return Math.round(v * 10) / 10;
}

export function temperatureLabel(t: number): string {
  return `${t.toFixed(1).replace('.', ',')} °C`;
}

export function estFievre(t: number): boolean {
  return t >= SEUIL_FIEVRE;
}

export function detailTemperature(t: number): string {
  return `Température ${temperatureLabel(t)}${estFievre(t) ? ' (fièvre)' : ''}`;
}

/** Quantité de biberon plausible, en ml */
export function parseMl(s: string): number | undefined {
  const v = Math.round(Number(s.trim().replace(',', '.')));
  return Number.isFinite(v) && v > 0 && v <= 500 ? v : undefined;
}

/** Minutes de sommeil de la journée : les périodes qui se chevauchent ne comptent qu'une fois */
export function sommeilTotal(siestes: Pick<Journal, 'time' | 'fin'>[]): number {
  const p = siestes
    .filter((e) => minutesSieste(e))
    .map((e) => [minutes(e.time), minutes(e.fin!)] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0, debut = -1, fin = -1;
  for (const [a, b] of p) {
    if (a > fin) { total += fin - debut; debut = a; fin = b; } else if (b > fin) fin = b;
  }
  return total + (fin - debut);
}

/** Sommeil commencé un jour passé et jamais terminé : le réveil a été oublié */
export function reveilOublie(j: Journal, aujourdhui: string): boolean {
  return siesteEnCours(j) && j.date < aujourdhui;
}

/** Texte d'un sommeil dont le réveil n'a pas été noté (jour terminé) */
export function detailReveilOublie(debut: string): string {
  return `Endormissement à ${hh(debut)}, réveil non noté`;
}

/** Sieste commencée et pas encore terminée */
export function siesteEnCours(j: Journal): boolean {
  return j.kind === 'sieste' && !!j.sommeil && !j.fin;
}

/**
 * Résumé du jour à envoyer aux parents : l'essentiel en tête (présence, soins, sommeil, repas), puis le reste.
 * `presence` : « Arrivée 8h05, départ 17h10 » ou undefined.
 */
/** Ce que les parents doivent apporter : une note « À apporter : couches », regroupée sur une ligne à part dans le résumé */
export const A_APPORTER = ['Couches', 'Lingettes', 'Crème de change', 'Vêtements de rechange', 'Lait infantile'];
const PREFIXE_APPORTER = 'À apporter : ';
/** « Couches » → « À apporter : couches ». Seule la première lettre passe en minuscule (une marque reste écrite comme elle est). */
export const detailApporter = (chose: string) => PREFIXE_APPORTER + chose.trim().charAt(0).toLowerCase() + chose.trim().slice(1);
export const estApporter = (e: { kind: Journal['kind']; detail: string }) => e.kind === 'note' && e.detail.startsWith(PREFIXE_APPORTER);
/** « À apporter : couches » → « couches » */
export const choseApporter = (e: { detail: string }) => e.detail.slice(PREFIXE_APPORTER.length);

/** Pour la page des parents : ce qui a été demandé depuis la dernière arrivée de l'enfant (« 2026-11-03 08:05 »), sans doublon, le plus récent d'abord.
 *  À l'arrivée suivante, les parents ont apporté : la demande disparaît. */
export function demandesApporter<E extends { date: string; time: string; kind: Journal['kind']; detail: string }>(carnet: E[], depuis: string): E[] {
  const vues = new Set<string>();
  return carnet
    .filter((e) => estApporter(e) && `${e.date} ${e.time}` >= depuis)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .filter((e) => { const k = choseApporter(e).toLowerCase(); if (vues.has(k)) return false; vues.add(k); return true; });
}

export function resumeJour(o: { enfant: string; jour: string; presence?: string; notes: Journal[]; jourTermine?: boolean }): string {
  const es = [...o.notes].sort((a, b) => a.time.localeCompare(b.time));
  const de = (k: Kind) => es.filter((e) => e.kind === k);
  const avecHeure = (e: Journal) => `${e.detail} (${hh(e.time)})`;
  const lignes: string[] = [`Bonjour ! La journée ${deNom(o.enfant)}, ${o.jour} :`, ''];
  if (o.presence) lignes.push(o.presence);

  const soins = de('soin');
  if (soins.length) lignes.push(`Soins : ${soins.map(avecHeure).join(', ')}`);

  const siestes = de('sieste');
  if (siestes.length) {
    const total = sommeilTotal(siestes);
    const tete = total ? `Sommeil : ${dureeLabel(total)} en tout` : 'Sommeil';
    const parts = siestes.map((e) =>
      minutesSieste(e) ? `${hh(e.time)} à ${hh(e.fin!)}` : siesteEnCours(e) ? (o.jourTermine ? detailReveilOublie(e.time).toLowerCase() : `en cours depuis ${hh(e.time)}`) : avecHeure(e));
    lignes.push(`${tete} (${parts.join(', ')})`);
  }

  const repas = de('repas');
  if (repas.length) {
    const ml = repas.reduce((s, e) => s + (e.ml ?? 0), 0);
    lignes.push(`Repas : ${repas.map(avecHeure).join(', ')}${ml && repas.filter((e) => e.ml).length > 1 ? ` (${ml} ml en tout)` : ''}`);
  }

  const humeur = de('humeur');
  if (humeur.length) lignes.push(`Humeur : ${humeur.map(avecHeure).join(', ')}`);

  const changes = de('change');
  if (changes.length) lignes.push(`Change : ${changes.length} (${changes.map(avecHeure).join(', ')})`);

  const apporter = [...new Set(es.filter(estApporter).map(choseApporter))];
  if (apporter.length) lignes.push(`${PREFIXE_APPORTER}${apporter.join(', ')}`);

  const notes = de('note').filter((e) => !estApporter(e));
  if (notes.length) lignes.push(`Note : ${notes.map(avecHeure).join(', ')}`);

  lignes.push('', 'Bonne soirée !');
  return lignes.join('\n');
}
