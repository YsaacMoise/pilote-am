// T-122 : contrats en cours de saisie (assistant d'ajout d'un enfant). Gardés sur ce téléphone seulement (localStorage, clé à
// part en démonstration), jamais dans state.contracts ni dans le compte en ligne : le moteur de paie ne lit jamais un brouillon.
import { useEffect, useState } from 'preact/hooks';
import { isDemo } from './db';
import type { Contract } from './engine/model';

/** Réponses de l'assistant qui ne sont pas des champs du contrat (aucune n'est lue par le calcul). */
export interface ReponsesAssistant {
  employeur?: 'nouveau' | string;
  majorations?: 'convention' | 'autres';
  km?: 'oui' | 'non';
  /** Congés de départ : jours pris depuis le 1er juin, longue absence non payée */
  pris?: number;
  absent?: 'non' | 'oui';
  absPrec?: number;
  absCours?: number;
  /** Congés de départ saisis à la main (« Ces chiffres sont faux ») */
  cpManuel?: boolean;
  soldes?: { cpRestants: number; cpEnCours: number };
  /** Pajemploi+ : adhérents, non adhérents, non renseigné */
  pajemploi?: 'oui' | 'non' | 'nr';
  /** Jours d'enfant malade déjà retenus (avant Arvela) */
  maladie?: number;
}

export interface Brouillon {
  id: string;
  c: Contract;
  r: ReponsesAssistant;
  /** Étape en cours (1 à 6), 7 : récapitulatif */
  etape: number;
  /** Écran de l'étape */
  ecran: number;
  faites: number[];
  maj: number;
}

const cle = () => (isDemo() ? 'pam-brouillons-demo' : 'pam-brouillons');
const EVT = 'pam-brouillons';

export function lireBrouillons(): Brouillon[] {
  try {
    const v = JSON.parse(localStorage.getItem(cle()) ?? '[]');
    return Array.isArray(v) ? v.filter((b) => b && typeof b.id === 'string' && b.c && typeof b.c === 'object') : [];
  } catch { return []; }
}

function ecrire(ls: Brouillon[]) {
  try { localStorage.setItem(cle(), JSON.stringify(ls)); } catch { /* stockage refusé : le brouillon reste à l'écran */ }
  window.dispatchEvent(new Event(EVT));
}

export function lireBrouillon(id: string): Brouillon | undefined {
  return lireBrouillons().find((b) => b.id === id);
}

export function enregistrerBrouillon(b: Brouillon) {
  ecrire([...lireBrouillons().filter((x) => x.id !== b.id), { ...b, maj: Date.now() }]);
}

export function supprimerBrouillon(id: string) {
  ecrire(lireBrouillons().filter((x) => x.id !== id));
}

export function useBrouillons(): Brouillon[] {
  const [ls, setLs] = useState(lireBrouillons);
  useEffect(() => {
    const f = () => setLs(lireBrouillons());
    window.addEventListener(EVT, f);
    window.addEventListener('storage', f);
    return () => { window.removeEventListener(EVT, f); window.removeEventListener('storage', f); };
  }, []);
  return ls;
}

/** Nombre d'étapes : la 6e (avant Arvela) seulement si le contrat a commencé avant le mois en cours. */
export const nbEtapes = (c: Pick<Contract, 'start'>, curMonthStart: string) => (c.start && c.start < curMonthStart ? 6 : 5);
