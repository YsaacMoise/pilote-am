// T-121, option b : chiffrement de bout en bout des données de santé (src/sync/coffre.ts), rappels (src/rappels.ts),
// lien des parents (accord), conservation de 5 ans.
import { describe, expect, it } from 'vitest';
import type { Contract, Journal, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { buildSnapshot } from '../src/partage/snapshot';
import { stable } from '../src/sync/plan';
import {
  aChiffrer, chiffrer, codeDeSecours, contratsEchus, dechiffrer, estScelle, lireCode, NOTE_CHIFFREE, nouveauSecret, ouvrirCle, separer,
} from '../src/sync/coffre';
import { estNoteSante } from '../src/engine/carnet';
import { copieAJour, rappelDuJour } from '../src/rappels';

const soin: Journal = { id: 'j1', cid: 'c1', date: '2026-11-04', time: '10:00', kind: 'soin', detail: 'Température 38,4 °C (fièvre)', temp: 38.4 };
const repas: Journal = { id: 'j4', cid: 'c1', date: '2026-11-04', time: '12:00', kind: 'repas', detail: 'A tout mangé' };
const libre: Journal = { id: 'j5', cid: 'c1', date: '2026-11-04', time: '13:00', kind: 'note', detail: 'Il a toussé toute la matinée' };
function week(start: string, end: string): Planning {
  const p: Planning = {};
  for (const d of [1, 2, 3, 4, 5]) p[d] = [{ start, end }];
  return p;
}
const contrat: Contract = {
  id: 'c1', child: 'Léo', family: 'Martin', color: 2, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:15', '17:30'), rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: true, trackedFrom: '2026-09-01',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
  partage: { id: 'AAAAAAAAAAAAAAAAAAAAAA', secret: 'BBBBBBBBBBBBBBBBBBBBBB', code: '1234', salt: 'CCCCCCCCCCCCCCCCCCCCCC', createdAt: 1 },
};

describe('T-121 : clé de secours', () => {
  it('26 caractères par groupes de 4, relue telle quelle, en minuscules, avec espaces ou O pour 0', () => {
    for (let i = 0; i < 50; i++) {
      const s = nouveauSecret();
      const code = codeDeSecours(s);
      expect(code).toMatch(/^([0-9A-Z]{4}-){6}[0-9A-Z]{2}$/);
      expect([...lireCode(code)!]).toEqual([...s]);
      expect([...lireCode(code.toLowerCase().replace(/-/g, ' '))!]).toEqual([...s]);
    }
    expect(lireCode('0000-0000-0000-0000-0000-0000-00')).not.toBeNull();
    expect(lireCode('OOOO-OOOO-OOOO-OOOO-OOOO-OOOO-OO')).toEqual(lireCode('0000-0000-0000-0000-0000-0000-00'));
  });
  it('une clé de mauvaise forme est refusée', () => {
    expect(lireCode('ABCD')).toBeNull();
    expect(lireCode('0000-0000-0000-0000-0000-0000-0U')).toBeNull(); // U n'existe pas
    expect(lireCode('0000-0000-0000-0000-0000-0000-01')).toBeNull(); // bits de fin non nuls
  });
  it('même secret, même empreinte ; secret différent, empreinte différente', async () => {
    const s = nouveauSecret();
    expect((await ouvrirCle(s)).id).toBe((await ouvrirCle(new Uint8Array(s))).id);
    expect((await ouvrirCle(s)).id).not.toBe((await ouvrirCle(nouveauSecret())).id);
  });
});

describe('T-121 : forme chiffrée dans le compte', () => {
  it('note du carnet : seuls identifiant, enfant, date et heure restent lisibles ; rien de la santé en clair', async () => {
    const c = await ouvrirCle(nouveauSecret());
    for (const j of [soin, repas, libre]) {
      const out = (await chiffrer('journal', j, c)) as Record<string, unknown>;
      const { sante: _s, ...lisible } = out;
      expect(stable(lisible)).not.toMatch(/38|fièvre|Température|mangé|toussé|soin|repas/);
      expect(Object.keys(out).sort()).toEqual(['cid', 'date', 'detail', 'id', 'kind', 'sante', 'time']);
      expect(out.detail).toBe(NOTE_CHIFFREE);
      expect(await dechiffrer('journal', out, c)).toEqual(j);
    }
  });
  it('contrat : case handicap, secret et code du lien chiffrés ; le reste lisible ; paie inchangée après aller-retour', async () => {
    const c = await ouvrirCle(nouveauSecret());
    const out = (await chiffrer('contracts', contrat, c)) as Record<string, unknown>;
    const txt = stable(out);
    expect(txt).not.toContain('majoreFiscal');
    expect(txt).not.toContain('BBBBBBBBBBBBBBBBBBBBBB');
    expect(txt).not.toContain('"code"');
    expect(out.rateNet).toBe(400);
    expect((out.partage as Record<string, unknown>).id).toBe('AAAAAAAAAAAAAAAAAAAAAA');
    expect(await dechiffrer('contracts', out, c)).toEqual(contrat);
  });
  it('mauvaise clé : rien n’est déchiffré, l’enregistrement reste scellé', async () => {
    const out = await chiffrer('journal', soin, await ouvrirCle(nouveauSecret()));
    expect(await dechiffrer('journal', out, await ouvrirCle(nouveauSecret()))).toBeNull();
    expect(estScelle(out)).toBe(true);
  });
  it('sans clé : un enregistrement avec une donnée en clair attend (null) ; un enregistrement déjà scellé part tel quel', async () => {
    expect(await chiffrer('journal', soin, null)).toBeNull();
    const scelle = await chiffrer('journal', soin, await ouvrirCle(nouveauSecret()));
    expect(aChiffrer('journal', scelle)).toBe(false);
    expect(await chiffrer('journal', scelle, null)).toBe(scelle);
    const cScelle = await chiffrer('contracts', contrat, await ouvrirCle(nouveauSecret()));
    expect(aChiffrer('contracts', cScelle)).toBe(false);
    expect(aChiffrer('contracts', contrat)).toBe(true);
  });
  it('autres magasins : jamais chiffrés (la paie lit journées et absences comme avant)', async () => {
    const c = await ouvrirCle(nouveauSecret());
    const jour = { key: 'c1|2026-11-03', cid: 'c1', date: '2026-11-03', abs: 'malade' };
    expect(await chiffrer('days', jour, c)).toBe(jour);
    expect(separer('leaves', { id: 'l1' })).toBeNull();
  });
  it('déchiffrer garde la case répondue sur ce téléphone si elle y est déjà (plus récente)', async () => {
    const c = await ouvrirCle(nouveauSecret());
    const out = await chiffrer('contracts', contrat, c);
    const dec = await dechiffrer('contracts', out, c, { ...contrat, majoreFiscal: false });
    expect(dec!.majoreFiscal).toBe(false);
  });
});

describe('T-121 : migration sans perte (vérification avant remplacement)', () => {
  it('chaque document en clair, chiffré puis relu, redonne exactement l’original', async () => {
    const c = await ouvrirCle(nouveauSecret());
    for (const [s, v] of [['journal', soin], ['journal', libre], ['contracts', contrat]] as const) {
      const out = await chiffrer(s, v, c);
      expect(stable(await dechiffrer(s, out, c))).toBe(stable(v));
    }
  });
});

describe('T-121 : lien des parents', () => {
  const ctx = makeCtx({ ...contrat, majoreFiscal: false }, [], [], '2026-11-04');
  it('sans accord des parents : pas de note de santé sur le lien ; avec accord : oui', () => {
    const sans = buildSnapshot({ ctx, journal: [soin, repas], amName: 'Sonia', enfants: 0, now: 1 });
    expect(sans.carnet.map((e) => e.detail)).toEqual(['A tout mangé']);
    const avec = buildSnapshot({ ctx: makeCtx({ ...contrat, accordSante: '2026-11-01' }, [], [], '2026-11-04'), journal: [soin, repas], amName: 'Sonia', enfants: 0, now: 1 });
    expect(avec.carnet.map((e) => e.detail)).toEqual(['Température 38,4 °C (fièvre)', 'A tout mangé']);
  });
  it('une note encore scellée (appareil sans la clé) ne part jamais sur le lien', async () => {
    const scelle = (await chiffrer('journal', repas, await ouvrirCle(nouveauSecret()))) as Journal;
    const snap = buildSnapshot({ ctx, journal: [scelle], amName: 'Sonia', enfants: 0, now: 1 });
    expect(snap.carnet).toEqual([]);
  });
  it('notes de santé repérées', () => {
    expect(estNoteSante(soin)).toBe(true);
    expect(estNoteSante({ kind: 'change', detail: 'Selles liquides' })).toBe(true);
    expect(estNoteSante(repas)).toBe(false);
  });
});

describe('T-121 : conservation de 5 ans', () => {
  const k = (id: string, child: string, end?: string) => ({ id, child, family: 'Martin', end });
  it('5 ans après la fin du dernier contrat de l’enfant, pas avant', () => {
    expect(contratsEchus([k('a', 'Léo', '2021-06-30')], '2026-06-30')).toEqual([]);
    expect(contratsEchus([k('a', 'Léo', '2021-06-30')], '2026-07-01')).toEqual(['a']);
  });
  it('un contrat en cours ou plus récent pour le même enfant garde tout', () => {
    expect(contratsEchus([k('a', 'Léo', '2019-06-30'), k('b', 'Léo')], '2026-11-26')).toEqual([]);
    expect(contratsEchus([k('a', 'Léo', '2019-06-30'), k('b', 'léo ', '2023-01-31')], '2026-11-26')).toEqual([]);
    expect(contratsEchus([k('a', 'Léo', '2019-06-30'), k('b', 'Lou', '2023-01-31')], '2026-11-26')).toEqual(['a']);
  });
});

describe('T-121 : rappel de sauvegarde (ajout du DG)', () => {
  const base = { contrats: 1, maintenant: 100 * 86400000, compte: false, copieAJour: false, cleOk: false, cleManquante: false };
  it('sans compte : rappel de la semaine comme avant', () => {
    expect(rappelDuJour(base)).toBe('sauvegarde');
    expect(rappelDuJour({ ...base, derniereSauvegarde: base.maintenant - 86400000 })).toBeNull();
    expect(rappelDuJour({ ...base, derniereSauvegarde: base.maintenant - 8 * 86400000 })).toBe('sauvegarde');
    expect(rappelDuJour({ ...base, contrats: 0 })).toBeNull();
  });
  it('avec un compte et une copie à jour : plus de rappel de la semaine ; invite à garder la clé tant qu’elle ne l’est pas', () => {
    const c = { ...base, compte: true, copieAJour: true, cleOk: true };
    expect(rappelDuJour(c)).toBe('cle');
    expect(rappelDuJour({ ...c, cleGardee: '2026-11-26' })).toBeNull();
    expect(rappelDuJour({ ...c, inviteEcartee: c.maintenant - 86400000 })).toBeNull();
    expect(rappelDuJour({ ...c, inviteEcartee: c.maintenant - 31 * 86400000 })).toBe('cle');
  });
  it('compte dont la copie n’est pas à jour : rappel de la semaine ; clé absente de ce téléphone : invite à l’entrer', () => {
    expect(rappelDuJour({ ...base, compte: true, copieAJour: false, cleOk: true })).toBe('sauvegarde');
    expect(rappelDuJour({ ...base, compte: true, copieAJour: true, cleManquante: true })).toBe('cle-manquante');
    expect(copieAJour({ status: 'synced' })).toBe(true);
    expect(copieAJour({ status: 'synced', refus: 'x' })).toBe(false);
    expect(copieAJour({ status: 'error' })).toBe(false);
    expect(copieAJour({ status: 'offline' })).toBe(false);
  });
});
