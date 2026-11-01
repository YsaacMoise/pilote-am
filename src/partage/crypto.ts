// Chiffrement du lien parent.
//
// Le lien contient un identifiant et un secret : https://arvela.fr/#/p/{id}.{secret}
// Le secret est après le « # » : le navigateur ne l'envoie jamais à un serveur.
// La clé de chiffrement vient du secret ET du code à 4 chiffres, donné de vive voix aux parents.
// Le serveur ne garde qu'un texte chiffré (AES-GCM) : sans le lien et le code, il est illisible.
//
// Limite honnête : 4 chiffres, c'est 10 000 possibilités. Le code protège d'un lien transféré par
// erreur ; il ne résiste pas longtemps à quelqu'un qui a le lien et s'acharne (la dérivation
// PBKDF2 ralentit chaque essai, sans le rendre impossible).

export const ITERATIONS = 600_000;

export interface ShareKeys {
  /** Nom du document en ligne (22 caractères) */
  id: string;
  /** Secret du lien, jamais envoyé au serveur (22 caractères) */
  secret: string;
  /** Code à 4 chiffres, donné de vive voix */
  code: string;
  /** Sel de la dérivation (gardé avec le document chiffré) */
  salt: string;
  createdAt: number;
}

export interface Sealed { v: string; iv: string; salt: string }

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}

function rand(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Code à 4 chiffres tiré uniformément (sans biais de modulo) */
export function newCode(): string {
  const a = new Uint16Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 60000);
  return String(a[0] % 10000).padStart(4, '0');
}

export function newShare(now = Date.now()): ShareKeys {
  return { id: b64url(rand(16)), secret: b64url(rand(16)), code: newCode(), salt: b64url(rand(16)), createdAt: now };
}

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Lit « {id}.{secret} » (la fin du lien) ; null si la forme n'est pas bonne */
export function parseLink(s: string): { id: string; secret: string } | null {
  const [id, secret, ...rest] = s.split('.');
  if (rest.length || !id || !secret || !ID_RE.test(id) || !ID_RE.test(secret)) return null;
  return { id, secret };
}

export function shareUrl(k: Pick<ShareKeys, 'id' | 'secret'>, origin = 'https://arvela.fr'): string {
  return `${origin}/#/p/${k.id}.${k.secret}`;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

export function deriveKey(secret: string, code: string, salt: string): Promise<CryptoKey> {
  const k = `${secret}|${code}|${salt}`;
  let p = keyCache.get(k);
  if (!p) {
    p = (async () => {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${secret}:${code}`), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: unb64url(salt), iterations: ITERATIONS },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
      );
    })();
    p.catch(() => keyCache.delete(k));
    keyCache.set(k, p);
  }
  return p;
}

export async function seal(k: Pick<ShareKeys, 'secret' | 'code' | 'salt'>, data: unknown): Promise<Sealed> {
  const key = await deriveKey(k.secret, k.code, k.salt);
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: b64url(new Uint8Array(ct)), iv: b64url(iv), salt: k.salt };
}

/** Déchiffre ; lève une erreur « code » si le code (ou le lien) ne correspond pas */
export async function open<T>(secret: string, code: string, s: Sealed): Promise<T> {
  const key = await deriveKey(secret, code, s.salt);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(s.iv) }, key, unb64url(s.v));
  } catch {
    throw Object.assign(new Error('Code incorrect'), { code: 'partage/code' });
  }
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
