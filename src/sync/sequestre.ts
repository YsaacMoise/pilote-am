// T-125, point 4 (décision du DG du 26/11/2026) : copie de secours scellée chez Arvela.
//
// Sur le téléphone de l'AM, la clé de secours est chiffrée avec la clé PUBLIQUE d'une clé Google Cloud KMS asymétrique de
// niveau HSM (boîtier matériel), en région Paris (RSA-OAEP 3072 bits, SHA-256 : même procédé des deux côtés, Web Crypto ici,
// KMS là-bas). Le résultat est rangé dans le compte (kv/sequestre). La clé PRIVÉE ne sort jamais du boîtier : seule la fonction
// serveur d'ouverture (functions/sequestre.js) peut demander à KMS de déchiffrer, et seulement à la demande de l'AM connectée
// à son compte, après un délai de sécurité, avec un e-mail à chaque demande et une trace de chaque ouverture.
// Le texte scellé contient l'identifiant du compte : copié dans un autre compte, il ne s'ouvre pas.
// Fonctions testées (tests/t125-cle-acces.test.ts).

import { codeDeSecours, lireCode } from './coffre';
import { b64, unb64 } from './cleacces';

export const SEQUESTRE = 'sequestre';

export interface Sequestre { version: 1; coffre: string; c: string; cree: string }
/** Contenu scellé (lu seulement par la fonction serveur, après déchiffrement KMS) */
export interface Scelle { s: string; u: string; c: string }

function pemEnOctets(pem: string): Uint8Array<ArrayBuffer> {
  return unb64(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_'));
}

export async function importerClePublique(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', pemEnOctets(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

/** Scelle la clé de secours pour ce compte et ce coffre. */
export async function sceller(o: { pem: string; code: string; uid: string; coffre: string; jour: string }): Promise<Sequestre> {
  const sec = lireCode(o.code);
  if (!sec) throw new Error('Clé de secours illisible.');
  const contenu: Scelle = { s: b64(sec), u: o.uid, c: o.coffre };
  const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, await importerClePublique(o.pem), new TextEncoder().encode(JSON.stringify(contenu)));
  return { version: 1, coffre: o.coffre, c: b64(ct), cree: o.jour };
}

/** Ce que rend la fonction serveur : le contenu scellé, déchiffré par KMS. Rend la clé de secours, ou null si ce n'est pas ce compte. */
export function lireOuverture(contenu: Scelle, uid: string, coffre: string): string | null {
  if (contenu.u !== uid || contenu.c !== coffre) return null;
  const sec = unb64(contenu.s);
  return sec.length === 16 ? codeDeSecours(sec) : null;
}
