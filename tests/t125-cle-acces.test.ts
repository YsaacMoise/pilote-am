// T-125 : paquets des clés d'accès (src/sync/cleacces.ts), copie scellée (src/sync/sequestre.ts, functions/regles.js),
// filets (src/rappels.ts).
import { describe, expect, it } from 'vitest';
import { constants, privateDecrypt, createPrivateKey } from 'node:crypto';
import { fermerPaquet, ouvrirPaquet, paquetsDe, b64 } from '../src/sync/cleacces';
import { codeDeSecours, nouveauSecret, ouvrirCle } from '../src/sync/coffre';
import { lireOuverture, sceller, type Scelle } from '../src/sync/sequestre';
import { aUnFilet } from '../src/rappels';
// @ts-expect-error module JavaScript des fonctions serveur, sans types
import { contenuValide, decisionAdresse, DELAI_MS, etatDemande, VALIDITE_MS } from '../functions/regles.js';

const prfDe = () => crypto.getRandomValues(new Uint8Array(32));

async function coffre() {
  const sec = nouveauSecret();
  return { code: codeDeSecours(sec), id: (await ouvrirCle(sec)).id };
}

describe('T-125 : paquet d’une clé d’accès', () => {
  it('le même secret PRF rouvre la clé de secours ; un autre secret, non', async () => {
    const c = await coffre();
    const prf = prfDe();
    const p = await fermerPaquet({ prf, cred: 'Q1', sel: b64(prfDe()), code: c.code, coffre: c.id, jour: '2026-11-26' });
    expect(JSON.stringify(p)).not.toContain(c.code);
    expect(JSON.stringify(p)).not.toContain(c.code.replace(/-/g, ''));
    expect(await ouvrirPaquet(p, prf)).toBe(c.code);
    expect(await ouvrirPaquet(p, prfDe())).toBeNull();
  });
  it('un paquet déplacé vers une autre clé d’accès ou un autre coffre ne s’ouvre pas', async () => {
    const c = await coffre();
    const prf = prfDe();
    const p = await fermerPaquet({ prf, cred: 'Q1', sel: 'x', code: c.code, coffre: c.id, jour: '2026-11-26' });
    expect(await ouvrirPaquet({ ...p, cred: 'Q2' }, prf)).toBeNull();
    expect(await ouvrirPaquet({ ...p, coffre: 'autre' }, prf)).toBeNull();
  });
  it('seuls les paquets du coffre du compte comptent', () => {
    const kv = [
      { k: 'cleacces-A', v: { coffre: 'c1' } }, { k: 'cleacces-B', v: { coffre: 'c2' } }, { k: 'settings', v: {} }, { k: 'coffre', v: { id: 'c1' } },
    ];
    expect(paquetsDe(kv, 'c1').length).toBe(1);
    expect(paquetsDe(kv, null)).toEqual([]);
  });
});

describe('T-125 : copie scellée chez Arvela (procédé de Cloud KMS : RSA-OAEP 3072, SHA-256)', () => {
  async function paireKms() {
    const k = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', k.publicKey)).toString('base64');
    const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----\n`;
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', k.privateKey));
    return { pem, prive: createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }) };
  }
  it('scellé dans le navigateur, déchiffré comme le fait KMS (OAEP SHA-256) : seul ce compte et ce coffre l’ouvrent', async () => {
    const kms = await paireKms();
    const c = await coffre();
    const s = await sceller({ pem: kms.pem, code: c.code, uid: 'alice', coffre: c.id, jour: '2026-11-26' });
    expect(JSON.stringify(s)).not.toContain(c.code.replace(/-/g, ''));
    const contenu = JSON.parse(privateDecrypt({ key: kms.prive, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(s.c, 'base64url')).toString('utf8')) as Scelle;
    expect(contenuValide(contenu, 'alice', c.id)).toBe(true);
    expect(contenuValide(contenu, 'bob', c.id)).toBe(false);
    expect(lireOuverture(contenu, 'alice', c.id)).toBe(c.code);
    // Copiée dans le compte de Bob, la copie d'Alice ne lui rend rien.
    expect(lireOuverture(contenu, 'bob', c.id)).toBeNull();
    expect(lireOuverture(contenu, 'alice', 'autre-coffre')).toBeNull();
  });
  it('règles de la demande : délai de 72 h, ouverture pendant 7 jours, annulation, une seule ouverture', () => {
    const d = { pret: 1000 };
    expect(DELAI_MS).toBe(72 * 3600 * 1000);
    expect(etatDemande(null, 0)).toBe('aucune');
    expect(etatDemande(d, 999)).toBe('attente');
    expect(etatDemande(d, 1000)).toBe('prete');
    expect(etatDemande(d, 1000 + VALIDITE_MS + 1)).toBe('expiree');
    expect(etatDemande({ ...d, annulee: true }, 2000)).toBe('aucune');
    expect(etatDemande({ ...d, ouverte: true }, 2000)).toBe('ouverte');
  });
});

describe('T-125 : suivi de l’adresse du compte (fonctions serveur)', () => {
  it('notée dès la première fois ; changée : ancienne prévenue, demandes refusées 72 h ; puis acceptées', () => {
    expect(decisionAdresse(undefined, 'a@x.fr', 0)).toBe('noter');
    const premier = { email: 'a@x.fr', depuis: 100, premier: 100 };
    expect(decisionAdresse(premier, 'a@x.fr', 200)).toBe('ok');
    expect(decisionAdresse(premier, 'voleur@x.fr', 200)).toBe('changee');
    const change = { email: 'voleur@x.fr', depuis: 200, premier: 100 };
    expect(decisionAdresse(change, 'voleur@x.fr', 200 + DELAI_MS - 1)).toBe('attente');
    expect(decisionAdresse(change, 'voleur@x.fr', 200 + DELAI_MS)).toBe('ok');
  });
});

describe('T-125 : filets', () => {
  it('au moins un filet : clé d’accès, e-mail, impression, fichier ou clé notée', () => {
    expect(aUnFilet({})).toBe(false);
    expect(aUnFilet({ paquets: 1 })).toBe(true);
    expect(aUnFilet({ filets: { email: '2026-11-26' } })).toBe(true);
    expect(aUnFilet({ filets: { impression: '2026-11-26' } })).toBe(true);
    expect(aUnFilet({ filets: { fichier: '2026-11-26' } })).toBe(true);
    expect(aUnFilet({ cleGardee: '2026-11-26' })).toBe(true);
  });
});
