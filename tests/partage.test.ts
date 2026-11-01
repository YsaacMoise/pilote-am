import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Journal, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { buildSnapshot } from '../src/partage/snapshot';
import { newCode, newShare, open, parseLink, seal, shareUrl } from '../src/partage/crypto';

function week(start: string, end: string): Planning {
  const p: Planning = {};
  for (const d of [1, 2, 3, 4, 5]) p[d] = [{ start, end }];
  return p;
}

const c: Contract = {
  id: 'c1', child: 'Léo', family: 'Martin', color: 2, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:15', '17:30'), rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-09-01',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
};
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const days = [
  rec('2026-11-04', { pres: [{ a: '08:12' }] }),
  rec('2026-11-03', { abs: 'malade' }),
  rec('2026-11-02', { pres: [{ a: '08:20', d: '17:35' }] }),
];
const leaves: AmLeave[] = [{ id: 'l1', type: 'cp', from: '2026-10-29', to: '2026-10-29' }];
const journal: Journal[] = [
  { id: 'j1', cid: 'c1', date: '2026-11-04', time: '11:50', kind: 'repas', detail: 'A tout mangé' },
  { id: 'j0', cid: 'c1', date: '2026-11-04', time: '09:10', kind: 'humeur', detail: 'Joyeux' },
  { id: 'j2', cid: 'c1', date: '2026-10-20', time: '12:00', kind: 'repas', detail: 'trop ancien' },
  { id: 'j3', cid: 'autre', date: '2026-11-04', time: '12:00', kind: 'note', detail: 'autre enfant' },
];

describe('instantané pour les parents', () => {
  const snap = buildSnapshot({ ctx: makeCtx(c, days, leaves, '2026-11-04'), journal, amName: 'Sonia', enfants: 0, now: 1 });

  it('présences des 7 derniers jours, du plus récent au plus ancien, sans les jours sans accueil', () => {
    expect(snap.jours.map((j) => [j.date, j.statut])).toEqual([
      ['2026-11-04', 'present'],
      ['2026-11-03', 'absent'],
      ['2026-11-02', 'parti'],
      ['2026-10-30', 'prevu'],
      ['2026-10-29', 'am'],
    ]);
    expect(snap.jours[1].motif).toBe('Malade, sans certificat');
    expect(snap.jours[2].minutes).toBe(9 * 60 + 15);
    expect(snap.jours[4].motif).toBe('Congés de Sonia');
  });

  it('carnet : seulement cet enfant et les 7 derniers jours, dans l’ordre des heures', () => {
    expect(snap.carnet.map((e) => e.detail)).toEqual(['Joyeux', 'A tout mangé']);
  });

  it('mois précédent terminé puis mois en cours ; cases Pajemploi dans l’ordre', () => {
    expect(snap.mois.map((m) => [m.month, m.termine])).toEqual([['2026-10', true], ['2026-11', false]]);
    expect(snap.mois[0].lignes[0].label).toBe('Heures normales');
    expect(snap.mois[0].total).toBe(snap.mois[0].net + snap.mois[0].entretien + snap.mois[0].repas + snap.mois[0].km);
    expect(snap.mois[1].absences).toBe(1);
  });

  it('rien sur la famille : ni nom, ni identifiant de contrat', () => {
    const txt = JSON.stringify(snap);
    expect(txt).not.toContain('Martin');
    expect(txt).not.toContain('"cid"');
    expect(snap.child).toBe('Léo');
    expect(snap.am).toBe('Sonia');
  });

  it('un jour prévu à venir sans pointage : attendu', () => {
    const s = buildSnapshot({ ctx: makeCtx(c, [], [], '2026-11-05'), journal: [], amName: '', enfants: 0, now: 1 });
    expect(s.jours[0]).toMatchObject({ date: '2026-11-05', statut: 'attendu', minutes: 0 });
    expect(s.am).toBe('votre assistante maternelle');
  });
});

describe('chiffrement du lien parent', () => {
  it('lien, code et sel tirés au hasard, aux bons formats', () => {
    const k = newShare();
    expect(k.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(k.secret).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(k.id).not.toBe(k.secret);
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{4}$/);
    expect(parseLink(`${k.id}.${k.secret}`)).toEqual({ id: k.id, secret: k.secret });
    expect(shareUrl(k)).toBe(`https://arvela.fr/#/p/${k.id}.${k.secret}`);
  });

  it('formes de lien refusées', () => {
    expect(parseLink('court.court')).toBeNull();
    expect(parseLink('a'.repeat(22))).toBeNull();
    expect(parseLink(`${'a'.repeat(22)}.${'b'.repeat(22)}.x`)).toBeNull();
    expect(parseLink(`${'a'.repeat(22)}.${'b'.repeat(21)}/`)).toBeNull();
  });

  it('chiffré puis relu avec le bon code ; refusé avec un autre code ou un autre secret', async () => {
    const k = newShare();
    const s = await seal(k, { child: 'Léo' });
    expect(s.v).not.toContain('Léo');
    expect(await open(k.secret, k.code, s)).toEqual({ child: 'Léo' });
    const autre = k.code === '0000' ? '0001' : '0000';
    await expect(open(k.secret, autre, s)).rejects.toMatchObject({ code: 'partage/code' });
    await expect(open(newShare().secret, k.code, s)).rejects.toMatchObject({ code: 'partage/code' });
  }, 20000);

  it('chaque envoi a son propre vecteur : deux chiffrés du même contenu diffèrent', async () => {
    const k = newShare();
    const [a, b] = [await seal(k, { x: 1 }), await seal(k, { x: 1 })];
    expect(a.iv).not.toBe(b.iv);
    expect(a.v).not.toBe(b.v);
  }, 20000);
});
