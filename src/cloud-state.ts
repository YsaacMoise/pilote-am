// État du compte en ligne, lisible par l'interface sans charger Firebase.
import { useEffect, useState } from 'preact/hooks';

export type CloudStatus =
  | 'off' // pas de compte sur ce téléphone
  | 'starting' // connexion au service en cours
  | 'merging' // première réunion des données du téléphone et du compte
  | 'choice' // le téléphone et le compte ont chacun des enfants : elle doit choisir
  | 'synced' // tout est envoyé
  | 'pending' // des changements attendent le réseau
  | 'offline' // pas de réseau, rien en attente
  | 'error';

export interface CloudInfo {
  status: CloudStatus;
  email?: string;
  /** Adresse du compte confirmée (lien reçu par e-mail) */
  verified?: boolean;
  /** Heure du dernier échange réussi avec le serveur */
  lastSync?: number;
  /** Message lisible si quelque chose bloque */
  error?: string;
  /**
   * Un envoi a été refusé par le serveur (C-023) : message à afficher en bandeau jusqu'à un nouvel essai réussi
   * (bouton « Réessayer ») ou une nouvelle connexion.
   * Les changements concernés restent sur le téléphone et sont renvoyés au prochain essai.
   */
  refus?: string;
  /** T-121 : le compte a un coffre (données de santé chiffrées) mais ce téléphone n'a pas la clé de secours */
  cleManquante?: boolean;
  /** T-121 : ce téléphone a la clé de secours du compte */
  cleOk?: boolean;
  /** T-121 : identifiant du compte connecté (pour trouver sa clé sur ce téléphone) */
  uid?: string;
  /** T-125 : nombre de clés d'accès (Face ID, empreinte) qui protègent la clé de secours du compte */
  paquets?: number;
}

/** Message du bandeau quand le serveur refuse un envoi (code d'erreur Firebase ou du faux serveur) */
export function messageRefus(code: string): string {
  const garde = 'Tes derniers changements restent sur ce téléphone, mais ils ne sont pas copiés dans ton compte.';
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return `${garde} Le compte a refusé l’envoi : déconnecte-toi puis reconnecte-toi.`;
  if (code.includes('resource-exhausted') || code.includes('quota')) return `${garde} Le service en ligne est saturé : réessaie plus tard.`;
  return `${garde} Réessaie ; si ça recommence, signale-le avec « Ça coince ».`;
}

/** Repères gardés sur le téléphone (localStorage), propres à chaque appareil. */
export const LS = {
  /** uid du compte dont les données ont été réunies avec ce téléphone */
  linked: 'pam-cloud-linked',
  /** uid d'un compte connecté dont la première réunion n'est pas finie (reprise au prochain démarrage) */
  pending: 'pam-cloud-pending',
  /** Dernier compte connecté sur ce téléphone (gardé après déconnexion) */
  last: 'pam-cloud-last',
  /** Heure serveur du dernier changement reçu */
  since: 'pam-cloud-since',
  device: 'pam-device',
  /**
   * T-121 (option b) : clé de secours de ce téléphone (JSON : compte, code de 26 caractères). Reste sur l'appareil, jamais en
   * ligne : elle déchiffre les données de santé du compte.
   */
  coffre: 'pam-coffre',
  /** T-121 : dernier passage du chiffrement des données encore en clair dans le compte (des nombres seulement) */
  chiffrement: 'pam-sante-chiffrement',
  /** T-121 : nombre d'autres appareils du compte restés sur une ancienne version (vus dans les 60 derniers jours) */
  anciens: 'pam-appareils-anciens',
  /** T-121 : appareils vus écrire dans le compte (identifiant → heure), pour repérer ceux restés sur une ancienne version */
  vus: 'pam-appareils-vus',
  /** T-121 : dernière fois que l'invite « garde ta clé de secours » a été écartée (ms) */
  inviteCle: 'pam-invite-cle',
} as const;

/** T-121 : clés de secours gardées sur ce téléphone, par compte (la plus récente en tête ; les autres servent à rechiffrer). */
function lireCoffres(): Record<string, string[]> {
  try {
    const v = JSON.parse(lsGet(LS.coffre) ?? '{}') as Record<string, string[]>;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
export function clesLocales(uid: string): string[] {
  const v = lireCoffres()[uid];
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
/** Garde une clé pour ce compte, en tête ; les autres clés de ce compte restent (jamais effacées sans la suppression du compte). */
export function garderCleLocale(uid: string, code: string) {
  const all = lireCoffres();
  all[uid] = [code, ...clesLocales(uid).filter((c) => c !== code)];
  lsSet(LS.coffre, JSON.stringify(all));
}
export function oublierClesLocales(uid: string) {
  const all = lireCoffres();
  delete all[uid];
  lsSet(LS.coffre, Object.keys(all).length ? JSON.stringify(all) : null);
}
/** Clé de secours du compte connecté sur ce téléphone (celle du coffre), pour l'écran Compte */
export function cleLocale(): string | null {
  return info.uid && info.cleOk ? clesLocales(info.uid)[0] ?? null : null;
}

export interface EtatChiffrement { uid: string; jour: string; chiffres: number; gardes: number; verifie: boolean }
export function etatChiffrement(): EtatChiffrement | null {
  try { return JSON.parse(lsGet(LS.chiffrement) ?? 'null') as EtatChiffrement | null; } catch { return null; }
}
export function appareilsAnciens(): number {
  return Number(lsGet(LS.anciens) ?? 0) || 0;
}

export function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
export function lsSet(k: string, v: string | null) {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* stockage indisponible */ }
}

/** Identifiant aléatoire de ce téléphone, pour ignorer l'écho de ses propres envois. */
export function deviceId(): string {
  let d = lsGet(LS.device);
  if (!d) {
    d = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    lsSet(LS.device, d);
  }
  return d;
}

/** Vrai si un compte a déjà été branché sur ce téléphone : Firebase est alors chargé au démarrage. */
export function hasCloudAccount(): boolean {
  return !!lsGet(LS.linked) || !!lsGet(LS.pending);
}

let info: CloudInfo = { status: 'off' };
let v = 0;
const subs = new Set<() => void>();

export function cloudInfo(): CloudInfo { return info; }

export function setCloud(patch: Partial<CloudInfo>) {
  info = { ...info, ...patch };
  if (patch.status && patch.status !== 'error') info.error = patch.error;
  v++;
  subs.forEach((f) => f());
}

export function useCloud(): CloudInfo {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set(v);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return info;
}

/** Phrase d'état pour l'écran Compte et la liste « Plus » */
export function statusText(c: CloudInfo): string {
  switch (c.status) {
    case 'off': return 'Pas encore de compte';
    case 'starting': return 'Connexion…';
    case 'merging': return 'Réunion de tes données…';
    case 'choice': return 'Un choix est nécessaire avant la première copie';
    case 'synced': return c.lastSync ? `À jour, ${new Date(c.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'À jour';
    case 'pending': return 'En attente de réseau : rien n’est perdu';
    case 'offline': return 'Hors ligne : tout est gardé sur le téléphone';
    case 'error': return c.error ?? 'La copie en ligne est bloquée';
  }
}

/** Phrase d'état, refus d'envoi compris : un refus passe avant « À jour » (C-023) */
export function statusLine(c: CloudInfo): string {
  return c.refus && c.status !== 'off' ? 'Un envoi a été refusé : la copie en ligne n’est pas à jour' : statusText(c);
}
