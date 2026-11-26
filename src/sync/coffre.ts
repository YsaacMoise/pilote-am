// T-121, option b (décision du DG du 26/11/2026 ; consignes/t121-option-b.md ; regles/t123-hds.md) : chiffrement de bout en
// bout des données de santé copiées dans le compte en ligne.
//
// Procédé : Web Crypto du navigateur, comme le lien des parents (partage/crypto.ts). Un secret de 128 bits est tiré au hasard
// sur le téléphone de l'AM : c'est sa « clé de secours », montrée sous forme de 26 caractères. De ce secret, HKDF-SHA-256
// dérive (1) la clé AES-GCM 256 bits qui chiffre, (2) une empreinte publique qui permet de vérifier une clé tapée. Le secret
// et la clé restent sur les appareils de l'AM : jamais en ligne, jamais lisibles par Arvela.
//
// Ce qui est chiffré (tout le reste du document reste lisible, la paie n'en dépend pas) :
// - carnet (`journal`) : tout le contenu de la note (genre, texte, température, biberon, sommeil), sauf l'identifiant,
//   l'enfant, la date et l'heure. En clair, une note chiffrée se lit « Note chiffrée » (une ancienne version de l'app
//   affiche ce texte au lieu de planter) ;
// - contrat : la case « handicap ou maladie » (`majoreFiscal`) et le secret et le code du lien des parents.
// Fonctions testées (tests/t121-coffre.test.ts).

export const SEL = 'arvela-coffre-v1';
/** Texte d'une note chiffrée, lu par un appareil sans la clé ou resté sur une ancienne version */
export const NOTE_CHIFFREE = 'Note chiffrée : ouvre Arvela à jour, avec ta clé de secours, pour la lire.';

export interface Blob { v: 1; k: string; iv: string; c: string }

// ---------- Clé de secours ----------

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // base 32 de Crockford : sans I, L, O, U

export function nouveauSecret(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** 16 octets → 26 caractères, par groupes de 4 (« 7K2D-9QXA-… ») */
export function codeDeSecours(secret: Uint8Array): string {
  let bits = 0, val = 0, out = '';
  for (const b of secret) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(val << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

/** Lit une clé tapée ou collée (espaces, tirets, minuscules, O pour 0, I ou L pour 1 acceptés) ; null si la forme n'est pas bonne */
export function lireCode(texte: string): Uint8Array<ArrayBuffer> | null {
  const s = texte.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 26 || [...s].some((c) => !ALPHA.includes(c))) return null;
  const out = new Uint8Array(16);
  let bits = 0, val = 0, i = 0;
  for (const c of s) {
    val = (val << 5) | ALPHA.indexOf(c); bits += 5;
    if (bits >= 8) { if (i < 16) out[i++] = (val >>> (bits - 8)) & 255; bits -= 8; }
  }
  // Les 2 derniers bits (26 × 5 = 130) doivent être nuls : une faute de frappe sur le dernier caractère est souvent vue.
  if ((val & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}

export interface Cle { cle: CryptoKey; id: string }

/** Clé de chiffrement (non exportable) et empreinte publique, dérivées du secret par HKDF-SHA-256 */
export async function ouvrirCle(secret: Uint8Array<ArrayBuffer>): Promise<Cle> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const sel = new TextEncoder().encode(SEL);
  const cle = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: sel, info: new TextEncoder().encode('chiffrement') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sel, info: new TextEncoder().encode('empreinte') }, base, 96);
  return { cle, id: b64(new Uint8Array(bits)) };
}

async function sceller(c: Cle, data: unknown): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, c.cle, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, k: c.id, iv: b64(iv), c: b64(new Uint8Array(ct)) };
}

async function desceller(c: Cle, b: Blob): Promise<unknown> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(b.iv) }, c.cle, unb64(b.c));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------- Partage d'un enregistrement entre partie lisible et partie chiffrée ----------

type Obj = Record<string, unknown>;
const objet = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Champs du carnet qui restent lisibles (tout le reste est chiffré) */
const CARNET_LISIBLE = ['id', 'cid', 'date', 'time'];

/**
 * Sépare ce qui reste lisible de ce qui se chiffre. `secret` vide : rien à chiffrer. Un enregistrement qui porte déjà une
 * partie chiffrée (`sante`) et aucun champ à chiffrer en clair (appareil sans la clé) est rendu tel quel.
 */
export function separer(s: string, value: unknown): { lisible: Obj; secret: Obj } | null {
  if (!objet(value)) return null;
  if (s === 'journal') {
    const lisible: Obj = {}, secret: Obj = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'sante') continue;
      if (CARNET_LISIBLE.includes(k)) lisible[k] = v; else secret[k] = v;
    }
    // Une note déjà chiffrée, lue sans la clé, n'a en clair que le texte de remplacement : rien à chiffrer de plus.
    if ('sante' in value && secret.kind === 'note' && secret.detail === NOTE_CHIFFREE && Object.keys(secret).length === 2) return { lisible, secret: {} };
    return { lisible, secret };
  }
  if (s === 'contracts') {
    const { sante: _s, majoreFiscal, partage, ...reste } = value as Obj & { partage?: Obj };
    const secret: Obj = {};
    const lisible: Obj = { ...reste };
    if (majoreFiscal !== undefined) secret.majoreFiscal = majoreFiscal;
    if (objet(partage)) {
      const { secret: sec, code, ...p } = partage;
      lisible.partage = p;
      if (sec !== undefined || code !== undefined) secret.partage = { secret: sec, code };
    }
    return { lisible, secret };
  }
  return null;
}

/** Magasins dont une partie se chiffre */
export const CHIFFRES = ['journal', 'contracts'] as const;

/** Vrai si cet enregistrement a, en clair, une donnée à chiffrer */
export function aChiffrer(s: string, value: unknown): boolean {
  const p = separer(s, value);
  return !!p && Object.keys(p.secret).length > 0;
}

/** Vrai si cet enregistrement porte une partie chiffrée */
export function estScelle(value: unknown): boolean {
  return objet(value) && objet(value.sante);
}

/**
 * Forme en ligne : partie lisible + partie chiffrée (`sante`). Sans rien à chiffrer : l'enregistrement tel quel. Rend null
 * s'il faut chiffrer et qu'aucune clé n'est là (l'envoi attend la clé de secours).
 */
export async function chiffrer(s: string, value: unknown, c: Cle | null): Promise<unknown | null> {
  const p = separer(s, value);
  if (!p || Object.keys(p.secret).length === 0) return value;
  if (!c) return null;
  const sante = await sceller(c, p.secret);
  const lisible = s === 'journal' ? { ...p.lisible, kind: 'note', detail: NOTE_CHIFFREE } : p.lisible;
  return { ...lisible, sante };
}

/** Remet ensemble partie lisible et partie déchiffrée (`garderLocal` : champs déjà en clair sur ce téléphone, plus récents) */
export function reunir(s: string, lisible: Obj, secret: Obj, garderLocal?: Obj): Obj {
  const { sante: _s, ...base } = lisible;
  if (s === 'journal') {
    const { kind: _k, detail: _d, ...b } = base;
    return { ...b, ...secret };
  }
  const out: Obj = { ...base };
  if ('majoreFiscal' in secret) out.majoreFiscal = garderLocal && 'majoreFiscal' in garderLocal && typeof garderLocal.majoreFiscal === 'boolean' ? garderLocal.majoreFiscal : secret.majoreFiscal;
  if (objet(secret.partage) && objet(base.partage)) out.partage = { ...base.partage, ...secret.partage };
  return out;
}

/** Déchiffre la partie `sante` d'un enregistrement. Sans la bonne clé (ou blob abîmé) : null, l'enregistrement reste scellé. */
export async function dechiffrer(s: string, value: unknown, c: Cle | null, garderLocal?: unknown): Promise<Obj | null> {
  if (!objet(value) || !objet(value.sante) || !c) return null;
  const b = value.sante as unknown as Blob;
  if (b.k !== c.id) return null;
  try {
    const secret = await desceller(c, b);
    if (!objet(secret)) return null;
    return reunir(s, value, secret, objet(garderLocal) ? garderLocal : undefined);
  } catch { return null; }
}

/** Document du coffre dans le compte (magasin kv, clé `coffre`) : l'empreinte seulement, jamais le secret */
export const COFFRE = 'coffre';
export interface Coffre { k: typeof COFFRE; v: { version: 1; id: string; cree: string } }

/**
 * Conservation (décision du DG du 26/11/2026) : 5 ans après la fin du dernier contrat de l'enfant (même prénom et même
 * famille), son carnet et la case handicap sont supprimés. Code civil, art. 2224 (prescription de cinq ans).
 * Rend les identifiants de contrats dont la durée est passée.
 */
export const CONSERVATION_ANS = 5;
export function contratsEchus(contracts: Array<{ id: string; child: string; family: string; end?: string }>, aujourdhui: string): string[] {
  const groupes = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const k = `${c.child.trim().toLowerCase()}|${c.family.trim().toLowerCase()}`;
    groupes.set(k, [...(groupes.get(k) ?? []), c]);
  }
  const out: string[] = [];
  for (const g of groupes.values()) {
    if (g.some((c) => !c.end)) continue;
    const fin = g.map((c) => c.end!).sort().pop()!;
    const limite = `${Number(fin.slice(0, 4)) + CONSERVATION_ANS}${fin.slice(4)}`;
    if (aujourdhui > limite) out.push(...g.map((c) => c.id));
  }
  return out;
}
