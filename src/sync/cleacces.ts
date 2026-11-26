// T-125 (consignes/t125-cle-sans-perte.md) : la clé de secours protégée par une clé d'accès (« passkey ») du trousseau du
// téléphone (iCloud chez Apple, Gestionnaire de mots de passe chez Google), sans que le chiffrement de bout en bout change.
//
// Procédé (WebAuthn, extension PRF, « pseudo-random function ») : l'app crée une clé d'accès Arvela. Le trousseau, après
// Face ID ou l'empreinte, rend un secret de 32 octets propre à cette clé d'accès et à un sel tiré au hasard (PRF). Ce secret,
// passé par HKDF-SHA-256, chiffre la clé de secours (AES-GCM 256 bits). Le résultat, un « paquet », est rangé dans le compte :
// un document par clé d'accès (kv/cleacces-<identifiant>), jamais dans kv/coffre. Le secret PRF ne quitte pas le téléphone ;
// Arvela ne peut pas ouvrir un paquet. Sur un nouveau téléphone relié au même trousseau, Face ID redonne le même secret PRF,
// donc la clé de secours, donc le carnet.
//
// La clé d'accès ne sert à se connecter nulle part : aucun serveur ne la vérifie. Elle ne sert qu'à tirer ce secret.
// Partie pure (paquets) testée dans tests/t125-cle-acces.test.ts ; partie navigateur rejouée par scripts/e2e-cle-acces.cjs
// (authentificateur virtuel de Chromium).

import { codeDeSecours, lireCode, ouvrirCle } from './coffre';

export const PREFIXE = 'cleacces-';
const SEL_PAQUET = 'arvela-cle-acces-v1';

export interface Paquet {
  version: 1;
  /** Identifiant de la clé d'accès (base64url) */
  cred: string;
  /** Sel donné à PRF (base64url, 32 octets) */
  sel: string;
  iv: string;
  /** Clé de secours chiffrée */
  c: string;
  /** Empreinte du coffre que cette clé de secours ouvre */
  coffre: string;
  cree: string;
}

export function b64(bytes: Uint8Array | ArrayBuffer): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}

async function cleDePaquet(prf: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(SEL_PAQUET), info: new TextEncoder().encode('paquet') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Chiffre la clé de secours avec le secret PRF d'une clé d'accès. */
export async function fermerPaquet(o: { prf: Uint8Array<ArrayBuffer>; cred: string; sel: string; code: string; coffre: string; jour: string }): Promise<Paquet> {
  const sec = lireCode(o.code);
  if (!sec) throw new Error('Clé de secours illisible.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`cleacces|${o.cred}|${o.coffre}`) }, await cleDePaquet(o.prf), sec);
  return { version: 1, cred: o.cred, sel: o.sel, iv: b64(iv), c: b64(ct), coffre: o.coffre, cree: o.jour };
}

/** Rouvre un paquet avec le secret PRF ; rend la clé de secours (26 caractères) seulement si elle ouvre bien ce coffre. */
export async function ouvrirPaquet(p: Paquet, prf: Uint8Array<ArrayBuffer>): Promise<string | null> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv), additionalData: new TextEncoder().encode(`cleacces|${p.cred}|${p.coffre}`) }, await cleDePaquet(prf), unb64(p.c));
    const sec = new Uint8Array(pt);
    if ((await ouvrirCle(sec)).id !== p.coffre) return null;
    return codeDeSecours(sec);
  } catch { return null; }
}

/** Paquets d'un compte (enregistrements kv du téléphone), pour ce coffre */
export function paquetsDe(kv: Array<{ k: string; v?: unknown }>, coffre: string | null): Paquet[] {
  if (!coffre) return [];
  return kv.filter((r) => r.k.startsWith(PREFIXE) && (r.v as Paquet | undefined)?.coffre === coffre).map((r) => r.v as Paquet);
}

// ---------- Navigateur (WebAuthn) ----------

export type Support = 'oui' | 'non' | 'inconnu';

/**
 * Le navigateur dit-il gérer PRF ? `getClientCapabilities` (WebAuthn niveau 3) le dit quand il existe ; sinon on ne sait pas
 * avant d'essayer. Dans tous les cas, l'app ne compte la clé d'accès comme filet qu'après avoir rouvert le paquet avec elle.
 */
export async function supportPrf(): Promise<Support> {
  const PK = (globalThis as { PublicKeyCredential?: { getClientCapabilities?: () => Promise<Record<string, boolean>> } }).PublicKeyCredential;
  if (!PK || !navigator.credentials) return 'non';
  try {
    const caps = await PK.getClientCapabilities?.();
    if (caps && 'extension:prf' in caps) return caps['extension:prf'] ? 'oui' : 'non';
  } catch { /* */ }
  return 'inconnu';
}

function rpId(): string {
  return location.hostname;
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

async function lirePrf(credIds: string[], sels: Record<string, string>): Promise<{ cred: string; prf: Uint8Array<ArrayBuffer> } | null> {
  const evalByCredential: Record<string, { first: Uint8Array<ArrayBuffer> }> = {};
  for (const id of credIds) evalByCredential[id] = { first: unb64(sels[id]) };
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: rpId(),
      allowCredentials: credIds.map((id) => ({ type: 'public-key' as const, id: unb64(id) })),
      userVerification: 'required',
      timeout: 120000,
      extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!cred) return null;
  const r = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first;
  return r ? { cred: b64(cred.rawId), prf: new Uint8Array(r) } : null;
}

export class PrfAbsent extends Error {}

/**
 * Crée une clé d'accès Arvela pour ce compte et rend son paquet, après l'avoir rouvert avec une seconde lecture (Face ID deux
 * fois) : un paquet qu'on ne saurait pas rouvrir ne compte pas. Lève PrfAbsent si le navigateur ne rend pas le secret PRF.
 */
export async function creerCleAcces(o: { uid: string; email: string; code: string; coffre: string; existants: string[]; jour: string }): Promise<Paquet> {
  const sel = b64(crypto.getRandomValues(new Uint8Array(32)));
  const userId = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`arvela|${o.uid}`))).slice(0, 16);
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { id: rpId(), name: 'Arvela' },
      user: { id: userId, name: o.email || 'Arvela', displayName: 'Arvela, clé du carnet' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: o.existants.map((id) => ({ type: 'public-key' as const, id: unb64(id) })),
      timeout: 120000,
      extensions: { prf: { eval: { first: unb64(sel) } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Création annulée.');
  const id = b64(cred.rawId);
  const ext = (cred.getClientExtensionResults() as PrfResults).prf;
  if (ext && ext.enabled === false) throw new PrfAbsent('PRF non géré');
  // Seconde lecture : c'est ce chemin qui servira sur un nouveau téléphone ; il doit marcher ici.
  const lu = await lirePrf([id], { [id]: sel }).catch(() => null);
  if (!lu) throw new PrfAbsent('PRF non rendu à la lecture');
  const paquet = await fermerPaquet({ prf: lu.prf, cred: id, sel, code: o.code, coffre: o.coffre, jour: o.jour });
  if ((await ouvrirPaquet(paquet, lu.prf)) !== o.code) throw new Error('Vérification du paquet impossible.');
  return paquet;
}

/** Nouveau téléphone : Face ID sur une des clés d'accès du compte ; rend la clé de secours, ou null. */
export async function ouvrirAvecCleAcces(paquets: Paquet[]): Promise<string | null> {
  if (!paquets.length) return null;
  const sels: Record<string, string> = {};
  for (const p of paquets) sels[p.cred] = p.sel;
  const lu = await lirePrf(paquets.map((p) => p.cred), sels);
  if (!lu) throw new PrfAbsent('PRF non rendu');
  const p = paquets.find((x) => x.cred === lu.cred);
  return p ? ouvrirPaquet(p, lu.prf) : null;
}
