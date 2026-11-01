// Ce dont la synchronisation a besoin d'un service en ligne. Firebase en production ;
// un faux serveur local pour les tests automatisés (jamais inclus dans le site publié).
import type { RemoteDoc } from './plan';

export interface CloudUser { uid: string; email: string | null; /** Adresse confirmée par le lien de l'e-mail */ verified?: boolean }

export interface ListenMeta {
  /** Les données viennent du cache du téléphone, pas du serveur (hors ligne) */
  fromCache: boolean;
  /** Heure serveur la plus récente vue, échos de ce téléphone compris (pour reprendre l'écoute au bon endroit) */
  maxT: number;
}

export interface Backend {
  /** Vrai si les écritures en attente survivent à la fermeture de l'app */
  durableQueue: boolean;
  onUser(cb: (u: CloudUser | null) => void): () => void;
  createAccount(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Lien « nouveau mot de passe » reçu par e-mail : renvoie l'adresse du compte (le code n'est pas consommé) */
  verifyResetCode(code: string): Promise<string>;
  /** Enregistre le nouveau mot de passe avec le code du lien (le code est alors consommé) */
  confirmReset(code: string, password: string): Promise<void>;
  /** Envoie l'e-mail de confirmation d'adresse au compte connecté */
  sendVerification(): Promise<void>;
  /** Relit le compte connecté sur le serveur (adresse confirmée ou non) */
  refreshUser(): Promise<CloudUser | null>;
  /** Lien « confirmer mon adresse » reçu par e-mail */
  applyEmailCode(code: string): Promise<void>;
  signOut(): Promise<void>;
  /** Supprime toutes les données en ligne puis le compte (mot de passe redemandé par sécurité) */
  deleteAccount(password: string): Promise<void>;
  /** Tout le contenu du compte, lu sur le serveur (échoue hors ligne) */
  fetchAll(uid: string): Promise<RemoteDoc[]>;
  /** Écrit (ou marque supprimés, v = null) des documents ; l'heure est posée par le serveur */
  write(uid: string, docs: Array<Omit<RemoteDoc, 't'>>): Promise<void>;
  /** Écoute les documents modifiés après `since` (ms). Les échos des écritures de ce téléphone sont filtrés. */
  listen(uid: string, since: number, cb: (docs: RemoteDoc[], meta: ListenMeta) => void, onError: (e: unknown) => void): () => void;
  /** Prévient quand des changements de ce téléphone attendent ou non d'être envoyés */
  onPending(cb: (pending: boolean) => void): () => void;
  /** Attend l'envoi des changements en attente ; faux si le délai expire (pas de réseau) */
  waitPending(timeoutMs: number): Promise<boolean>;
  /** Lien parent : écrit le texte chiffré au nom du compte connecté */
  putShare(id: string, d: Omit<SharedDoc, 't'>): Promise<void>;
  /** Lien parent : coupe le lien (le document disparaît) */
  deleteShare(id: string): Promise<void>;
  /** Lien parent, côté parents (sans compte) : suit le document en direct ; null s'il n'existe pas ou plus */
  watchShare(id: string, cb: (d: SharedDoc | null) => void, onError: (e: unknown) => void): () => void;
}

/** Document du lien parent : texte chiffré, vecteur et sel (voir partage/crypto.ts) */
export interface SharedDoc { v: string; iv: string; salt: string; /** Heure serveur (ms) */ t: number }

/** Code d'erreur lisible (« auth/wrong-password »…) quel que soit le service */
export function errCode(e: unknown): string {
  return (e as { code?: string })?.code ?? String((e as Error)?.message ?? e);
}
