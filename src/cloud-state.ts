// État du compte en ligne, lisible par l'interface sans charger Firebase.
import { useEffect, useState } from 'preact/hooks';

export type CloudStatus =
  | 'off' // pas de compte sur ce téléphone
  | 'starting' // connexion au service en cours
  | 'merging' // première réunion des données du téléphone et du compte
  | 'synced' // tout est envoyé
  | 'pending' // des changements attendent le réseau
  | 'offline' // pas de réseau, rien en attente
  | 'error';

export interface CloudInfo {
  status: CloudStatus;
  email?: string;
  /** Heure du dernier échange réussi avec le serveur */
  lastSync?: number;
  /** Message lisible si quelque chose bloque */
  error?: string;
}

/** Repères gardés sur le téléphone (localStorage), propres à chaque appareil. */
export const LS = {
  /** uid du compte dont les données ont été réunies avec ce téléphone */
  linked: 'pam-cloud-linked',
  /** Dernier compte connecté sur ce téléphone (gardé après déconnexion) */
  last: 'pam-cloud-last',
  /** Heure serveur du dernier changement reçu */
  since: 'pam-cloud-since',
  device: 'pam-device',
} as const;

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
  return !!lsGet(LS.linked);
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
    case 'synced': return c.lastSync ? `À jour, ${new Date(c.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'À jour';
    case 'pending': return 'En attente de réseau : rien n’est perdu';
    case 'offline': return 'Hors ligne : tout est gardé sur le téléphone';
    case 'error': return c.error ?? 'La copie en ligne est bloquée';
  }
}
