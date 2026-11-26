// T-115 et T-116 : retours du DG sur la version publiée (26/11/2026). Consignes : calculateur-arvela,
// consignes/t115-retours-dg.md et consignes/t116-zero-alerte.md. Rapport : rapports/T-115-execution.md.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { entretienPlancher } from '../src/engine/rates';
import { alertesDurees, dureeReunion, informationsDurees, travailEntre } from '../src/engine/durees';
import { congesDeDepart, MESSAGE_CONGES_DEPART, soldeCongesInconnu } from '../src/engine/conges';
import { bornesBande, decaler, finParDefaut, finPourJour, joursBande, libelleBande, peutAvancer, peutReculer } from '../src/ui/bandeJours';
import { libelleEntretien } from '../src/screens/EntretienSaisie';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const ct = (o: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'Lucas', family: 'M', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
  entretienMode: 'jour', repasParents: true, ...o,
} as Contract);

describe('T-115 (R1) : bande des jours, d’une semaine à l’autre', () => {
  const t = '2026-11-26';
  it('par défaut, la bande d’avant : de J-5 à J+1', () => {
    expect(joursBande(finParDefaut(t))).toEqual(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
  });
  it('bornes : début du plus ancien contrat ; fin du mois suivant', () => {
    expect(bornesBande(['2026-03-02', '2025-09-01'], t)).toEqual({ debut: '2025-09-01', fin: '2026-12-31' });
    // Contrat commencé hier : les 5 jours d'avant restent visibles, comme avant.
    expect(bornesBande(['2026-11-25'], t).debut).toBe('2026-11-21');
  });
  it('trois semaines en arrière puis retour : le jour choisi suit la bande', () => {
    const b = bornesBande(['2025-09-01'], t);
    let fin = finParDefaut(t), jour = t;
    for (let i = 0; i < 3; i++) ({ fin, jour } = decaler(fin, jour, -1, b)!);
    expect(jour).toBe('2026-11-05');
    expect(joursBande(fin)).toContain('2026-11-05');
    for (let i = 0; i < 3; i++) ({ fin, jour } = decaler(fin, jour, 1, b)!);
    expect(jour).toBe(t);
  });
  it('pas avant le début du contrat, pas après la fin du mois suivant', () => {
    const b = bornesBande(['2026-11-10'], t);
    let fin = finParDefaut(t), jour = t;
    ({ fin, jour } = decaler(fin, jour, -1, b)!);
    expect(jour).toBe('2026-11-19');
    ({ fin, jour } = decaler(fin, jour, -1, b)!);
    expect(jour).toBe('2026-11-12');
    expect(peutReculer(fin, b)).toBe(false);
    expect(decaler(fin, jour, -1, b)).toBeNull();
    let f2 = finParDefaut(t), j2 = t, n = 0;
    while (peutAvancer(f2, b)) { ({ fin: f2, jour: j2 } = decaler(f2, j2, 1, b)!); n++; }
    expect(n).toBe(5);
    expect(j2 <= '2026-12-31').toBe(true);
    expect(f2 >= '2026-12-31').toBe(true);
  });
  it('un jour choisi hors de la bande (« Corriger » un départ oublié) la déplace', () => {
    expect(joursBande(finPourJour('2026-11-14', finParDefaut(t), t))).toContain('2026-11-14');
    expect(finPourJour('2026-11-24', finParDefaut(t), t)).toBe(finParDefaut(t));
  });
  it('libellé de la semaine', () => {
    expect(libelleBande(joursBande('2026-11-27'), t)).toBe('du 21 au 27 novembre');
    expect(libelleBande(joursBande('2026-12-04'), t)).toBe('du 28 novembre au 4 décembre');
    expect(libelleBande(joursBande('2027-01-03'), t)).toBe('du 28 décembre 2026 au 3 janvier 2027');
    expect(libelleBande(joursBande('2026-12-01'), t)).toBe('du 25 novembre au 1er décembre');
  });
});

describe('T-116 (A1) : entretien laissé vide = minimum légal, sans alerte', () => {
  const m = '2026-11';
  it('contrat à entretien vide (0) : minimum versé, aucune alerte (cas du DG : 4 jours)', () => {
    const r = computeMonth(makeCtx(ct({ entretienJour: 0 }), [], [], '2026-12-31'), m);
    expect(r.alerts.filter((a) => a.includes('entretien'))).toEqual([]);
    // 8 h par jour : minimum de l'article 114.1 pour 8 h, chaque jour prévu.
    expect(r.entretien).toBeGreaterThan(0);
    expect(r.entretien % entretienPlancher('2026-11-02', 480)!).toBe(0);
  });
  it('montant écrit sous le minimum : l’alerte reste, avec le minimum versé', () => {
    const r = computeMonth(makeCtx(ct({ entretienJour: 100 }), [], [], '2026-12-31'), m);
    expect(r.alerts.some((a) => /^Indemnité d’entretien : le montant du contrat \(1,00\s€ par jour\)/.test(a))).toBe(true);
  });
  it('le contrat affiche « minimum légal »', () => {
    expect(libelleEntretien({ entretienJour: 0, entretienMode: 'jour' })).toMatch(/^minimum légal \(/);
    expect(libelleEntretien({ entretienJour: 0, entretienHeure: 0, entretienMode: 'heure' })).toMatch(/^minimum légal \(/);
    expect(libelleEntretien({ entretienJour: 400, entretienMode: 'jour' })).toMatch(/^4,00\s€ par jour$/);
  });
});

describe('T-116 (A2) : contrat commencé avant le suivi, solde de congés jamais donné', () => {
  // Contrat du 01/09/2025, suivi depuis le 01/11/2026, soldes à 0 jamais saisis ; 15 jours de congés en novembre.
  const base = ct({ start: '2025-09-01', trackedFrom: '2026-11-01', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 } });
  const leaves: AmLeave[] = [{ id: 'l1', type: 'cp', from: '2026-11-09', to: '2026-11-25' } as AmLeave];
  it('solde inconnu : aucun jour sans solde, aucune alerte de retenue, une seule invite', () => {
    expect(soldeCongesInconnu(base)).toBe(true);
    const r = computeMonth(makeCtx(base, [], leaves, '2026-12-31'), '2026-11');
    expect(r.alerts.some((a) => a.includes('sans solde'))).toBe(false);
    // T-119 : l'app calcule les congés de départ ; la seule question est celle des jours déjà pris (un geste).
    expect(r.nonGere).toEqual([MESSAGE_CONGES_DEPART]);
  });
  it('calcul impossible (année incomplète sans les semaines sans accueil) : le solde est demandé comme avant', () => {
    const inc = { ...base, yearType: 'incomplete', weeks: 40 } as Contract;
    const r = computeMonth(makeCtx(inc, [], leaves, '2026-12-31'), '2026-11');
    expect(r.alerts.some((a) => a.includes('sans solde'))).toBe(false);
  });
  it('solde donné (même 0, confirmé) : le calcul d’avant revient', () => {
    const c = { ...base, balances: { ...base.balances, cpSaisi: true } };
    expect(soldeCongesInconnu(c)).toBe(false);
    const r = computeMonth(makeCtx(c, [], leaves, '2026-12-31'), '2026-11');
    expect(r.nonGere).toEqual([]);
    expect(r.alerts.some((a) => a.includes('au-delà de tes droits acquis'))).toBe(true);
  });
  it('contrat suivi depuis son début : jamais d’invite', () => {
    expect(soldeCongesInconnu(ct({ balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 } }))).toBe(false);
  });
});

describe('T-116 (A3) : trois enfants accueillis aux mêmes heures', () => {
  // Lucas, Leolio et Marc, du lundi au vendredi de 8 h à 17 h : 45 h par semaine chacun, la même plage. Avant : 135 h comptées.
  const enfants = ['Lucas', 'Leolio', 'Marc'].map((child, i) => ct({ id: `c${i}`, child, family: `F${i}`, start: '2026-01-05', planning: week('08:00', '17:00') }));
  const ctxs = enfants.map((c) => makeCtx(c, [], [], '2026-12-31'));
  it('le temps commun compte une fois : 45 h par semaine, aucune alerte de 48 h', () => {
    expect(travailEntre(ctxs, '2026-11-02', '2026-11-08')).toBe(45 * 60);
    expect(alertesDurees(ctxs, '2026-11-26')).toEqual([]);
  });
  it('plages qui se chevauchent en partie : réunion', () => {
    expect(dureeReunion([[480, 1020], [600, 1080], [420, 450]])).toBe(630);
    expect(dureeReunion([[480, 720], [720, 1020]])).toBe(540);
  });
  it('dépassement qui n’existe que tous parents réunis : information, pas d’alerte (regles/t116-48h.md)', () => {
    // Famille M : 8 h – 14 h (30 h) ; famille N : 14 h – 19 h (25 h) ; aucune famille ne dépasse, 55 h tous parents réunis.
    const a = ct({ planning: week('08:00', '14:00') });
    const b = { ...ct({ planning: week('14:00', '19:00') }), id: 'c2', family: 'N' } as Contract;
    const ctxs = [makeCtx(a, [], [], '2026-12-31'), makeCtx(b, [], [], '2026-12-31')];
    expect(alertesDurees(ctxs, '2026-11-26')).toEqual([]);
    expect(informationsDurees(ctxs, '2026-11-26').join(' ')).toMatch(/Tous parents réunis, 55 h/);
  });
  it('un vrai dépassement reste signalé : 50 h chez une même famille', () => {
    const a = ct({ planning: week('07:00', '17:00') });
    expect(alertesDurees([makeCtx(a, [], [], '2026-12-31')], '2026-11-26').join(' ')).toMatch(/chez la famille M/);
  });
  it('10 h par jour chez une famille (50 h), puis 2 h ailleurs : alerte, cette famille dépasse seule', () => {
    const a = ct({ planning: week('07:00', '17:00') });
    const b = { ...ct({ planning: week('17:00', '19:00') }), id: 'c2', family: 'N' } as Contract;
    expect(alertesDurees([makeCtx(a, [], [], '2026-12-31'), makeCtx(b, [], [], '2026-12-31')], '2026-11-26').join(' ')).toMatch(/quatre derniers mois/);
  });
});

import { estInformation } from '../src/engine/alertes';
import { MESSAGE_ARRET_MOIS_ENTIER, MESSAGE_DISPENSE_PAJEMPLOI, messageMoisSansSoldeChange, messageSansSoldeEnfant } from '../src/engine/payroll';
import { MESSAGE_REDUCTION_HS_MAYOTTE } from '../src/engine/month';
import { MESSAGE_OCCASIONNEL_SALAIRE } from '../src/engine/occasionnel';
import { MESSAGE_MAINTIEN_LOCAL } from '../src/engine/regions';
import { messageTermeAVenir } from '../src/engine/cdd';

describe('T-116 : revue des alertes de l’écran Mois (information ou vrai problème)', () => {
  it('information : explication ou donnée à donner, bandeau d’information', () => {
    for (const m of [MESSAGE_ARRET_MOIS_ENTIER, MESSAGE_DISPENSE_PAJEMPLOI, MESSAGE_REDUCTION_HS_MAYOTTE, MESSAGE_OCCASIONNEL_SALAIRE,
      `${MESSAGE_MAINTIEN_LOCAL} 12,00 € d’indemnités journalières déduits du salaire de ce mois.`, messageTermeAVenir('2026-11-30'),
      'Avenant au 15/11 : le salaire du mois est calculé au prorata de chaque période.', '2 départs non pointés : l’heure prévue a été retenue.',
      'Régularisation à l’avenant du 15/11 : 12 h accueillies depuis le 01/01/2026 et pas encore payées.',
      'Des jours d’enfant malade dépassent la limite de l’article 105 : ils restent payés.']) expect(estInformation(m), m).toBe(true);
  });
  it('vrai problème : alerte gardée', () => {
    for (const m of [messageSansSoldeEnfant('2026-11-12'), messageMoisSansSoldeChange(2),
      'Indemnité d’entretien : le montant du contrat (1,00 € par jour) est sous le minimum de la convention (article 114.1) pour 4 jours.',
      '3 jours de congés pris au-delà de tes droits acquis : retenus comme congés sans solde.']) expect(estInformation(m), m).toBe(false);
  });
});

import { brutDepuisNet, brutHoraireDepuisNet, netLigneParLigne } from '../src/engine/brut';

describe('T-115 (R3) : brut calculé depuis le net (calculateur-arvela, regles/t115-net-brut.md, sections 3 et 6)', () => {
  const d = '2026-11-15';
  it('F1, convertisseur officiel net → brut : 17 sorties recopiées', () => {
    const cas: [number, number][] = [[300, 384], [328, 420], [340, 435], [391, 501], [400, 512], [745, 954], [13410, 17166], [13836, 17711],
      [37639, 48181], [39113, 50068], [76050, 97351], [85844, 109888], [100000, 128009], [145275, 185964], [182914, 234146], [184388, 236033]];
    for (const [net, brut] of cas) expect(brutDepuisNet(net, d, 'metropole'), String(net)).toBe(brut);
    expect(brutDepuisNet(328, d, 'alsaceMoselle')).toBe(427);
  });
  it('brut → net ligne par ligne : couples publiés (Urssaf, DREETS)', () => {
    const cas: [number, number, 'metropole' | 'alsaceMoselle', string][] = [[420, 328, 'metropole', d], [437, 341, 'metropole', d],
      [420, 323, 'alsaceMoselle', d], [437, 335, 'alsaceMoselle', d], [364, 286, 'metropole', '2026-03-01'], [364, 281, 'alsaceMoselle', '2026-03-01'],
      [379, 296, 'metropole', '2026-03-01'], [379, 291, 'alsaceMoselle', '2026-03-01'], [500, 391, 'metropole', d],
      [345, 269, 'metropole', '2024-02-01'], [345, 265, 'alsaceMoselle', '2024-02-01'], [359, 281, 'metropole', '2024-02-01'], [359, 276, 'alsaceMoselle', '2024-02-01'],
      [350, 274, 'metropole', '2025-02-01']];
    for (const [brut, net, r, dd] of cas) expect(netLigneParLigne(brut, dd, r), `${brut} ${r}`).toBe(net);
  });
  it('F2, brut horaire affiché : retrouve le brut de chaque couple publié', () => {
    const cas: [number, number, 'metropole' | 'alsaceMoselle', string][] = [[328, 420, 'metropole', d], [341, 437, 'metropole', d],
      [323, 420, 'alsaceMoselle', d], [335, 437, 'alsaceMoselle', d], [286, 364, 'metropole', '2026-03-01'], [281, 364, 'alsaceMoselle', '2026-03-01'],
      [296, 379, 'metropole', '2026-03-01'], [291, 379, 'alsaceMoselle', '2026-03-01'], [391, 500, 'metropole', d],
      [269, 345, 'metropole', '2024-02-01'], [265, 345, 'alsaceMoselle', '2024-02-01'], [281, 359, 'metropole', '2024-02-01'], [276, 359, 'alsaceMoselle', '2024-02-01'],
      [274, 350, 'metropole', '2025-02-01']];
    for (const [net, brut, r, dd] of cas) expect(brutHoraireDepuisNet(net, dd, r), `${net} ${r}`).toBe(brut);
  });
  it('Mayotte et avant 2024 : aucun brut calculé, le brut est demandé', () => {
    expect(brutDepuisNet(370, d, 'mayotte')).toBeUndefined();
    expect(brutHoraireDepuisNet(286, '2023-06-01', 'metropole')).toBeUndefined();
  });
});

import { MESSAGE_MAINTIEN_LOCAL_SUSPENSION } from '../src/engine/regions';
import { brutDuNet, brutConnu } from '../src/engine/payroll';

describe('Relecture T-115 : corrections m3, m4, m5', () => {
  it('m3 : congé ou arrêt en Alsace-Moselle, indemnités déduites : information', () => {
    expect(estInformation(`${MESSAGE_MAINTIEN_LOCAL_SUSPENSION} 30,00 € d’indemnités journalières déduits du salaire de ce mois.`)).toBe(true);
  });
  it('m4 : deux contrats sans nom de famille ne sont pas réunis en un employeur ; le message nomme l’enfant', () => {
    // Deux contrats sans famille, 30 h et 25 h à des heures différentes : 55 h tous réunis, aucun ne dépasse seul.
    const a = ct({ family: '', child: 'Lucas', planning: week('08:00', '14:00') });
    const b = { ...ct({ family: '', child: 'Marc', planning: week('14:00', '19:00') }), id: 'c2' } as Contract;
    const ctxs = [makeCtx(a, [], [], '2026-12-31'), makeCtx(b, [], [], '2026-12-31')];
    expect(alertesDurees(ctxs, '2026-11-26')).toEqual([]);
    expect(informationsDurees(ctxs, '2026-11-26').length).toBe(1);
    const seul = ct({ family: '', child: 'Lucas', planning: week('07:00', '17:00') });
    expect(alertesDurees([makeCtx(seul, [], [], '2026-12-31')], '2026-11-26').join(' ')).toMatch(/quatre derniers mois pour Lucas :/);
  });
  it('m5 : un avenant « brut calculé » (0) remplace le brut écrit avant lui', () => {
    const c = ct({ rateBrut: 700, avenants: [{ id: 'a1', from: '2026-11-01', changes: { rateBrut: 0 } }] } as Partial<Contract>);
    expect(brutDuNet(c, 50000, '2026-10-31')).toBe(70000); // avant l'avenant : 500 € × 7,00 ÷ 5,00
    expect(brutDuNet(c, 50000, '2026-11-30')).toBe(64004); // après : F1, 500 ÷ 0,7811975 = 640,04 €
    expect(brutConnu(c, '2026-11-30')).toBe(true);
    // La sauvegarde JSON garde le 0 (une valeur vide disparaîtrait).
    expect(JSON.parse(JSON.stringify(c)).avenants[0].changes.rateBrut).toBe(0);
  });
});

describe('T-119 : congés de départ calculés par Arvela (calculateur-arvela, regles/t119-conges-depart.md)', () => {
  // Suivi depuis le 01/11/2026 : période y = 2026 (01/06/2026 – 31/05/2027), précédente 01/06/2025 – 31/05/2026.
  const T = '2026-11-01';
  const sans = { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 };
  it('14 mois avant (01/09/2025), 5 jours : septembre à mai, 9 mois → 22,5 → 23 jours ; juin à octobre, 5 mois → 12,5', () => {
    const d = congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans }), T);
    expect(d).toMatchObject({ droitsPrec: 23, cpRestants: 23, cpEnCours: 12.5, precDu: '2025-09-01', precAu: '2026-05-31', depuis: '2026-06-01', jusqua: '2026-10-31' });
    expect(d.aConfirmer).toBeUndefined();
    // 5 jours déjà pris depuis le 1er juin : reste 18.
    expect(congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans }), T, { pris: 5 }).cpRestants).toBe(18);
  });
  it('3 mois avant (01/08/2026) : aucune période précédente ; août à octobre, 3 mois → 7,5', () => {
    const d = congesDeDepart(ct({ start: '2026-08-01', trackedFrom: T, balances: sans }), T);
    expect(d).toMatchObject({ droitsPrec: 0, cpRestants: 0, cpEnCours: 7.5 });
    expect(d.precDu).toBeUndefined();
  });
  it('3 ans avant (01/11/2023) : période précédente entière, 12 mois → 30 ; 12,5 depuis le 1er juin', () => {
    expect(congesDeDepart(ct({ start: '2023-11-01', trackedFrom: T, balances: sans }), T)).toMatchObject({ droitsPrec: 30, cpEnCours: 12.5 });
  });
  it('3 et 4 jours par semaine, sans absence : même acquisition (mois entiers)', () => {
    for (const j of [[1, 2, 3], [1, 2, 4, 5]]) {
      expect(congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans, planning: week('08:00', '16:00', j) }), T)).toMatchObject({ droitsPrec: 23, cpEnCours: 12.5 });
    }
  });
  it('longue absence non payée : 20 jours d’accueil en septembre 2025 ; octobre à mai restent (8 mois, 20 jours au moins), moins que 23', () => {
    const d = congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans }), T, { absencePrec: 20 });
    expect(d.droitsPrec).toBeLessThan(23);
    expect(d.droitsPrec).toBeGreaterThanOrEqual(20);
    expect(d.cpEnCours).toBe(12.5);
    // 10 jours d'absence en juin 2026 ne font rien perdre : décompte en jours d'accueil (110 − 10) ÷ 20 = 5 périodes → 12,5
    // (le plus favorable, T-103 C10 bis) ; 30 jours : (110 − 30) ÷ 20 = 4 périodes, moins que 12,5.
    // Plafond (règle, 3.4) : 5 jours d'absence donneraient (110 − 5) ÷ 20 × 2,5 = 13,125 ; jamais plus que sans absence : 12,5.
    expect(congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans }), T, { absenceCours: 5 }).cpEnCours).toBe(12.5);
    expect(congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans }), T, { absenceCours: 10 }).cpEnCours).toBe(12.5);
    const e = congesDeDepart(ct({ start: '2025-09-01', trackedFrom: T, balances: sans }), T, { absenceCours: 30 });
    expect(e.cpEnCours).toBeLessThan(12.5);
    expect(e.droitsPrec).toBe(23);
  });
  it('sans réponse : le moteur prend les soldes calculés (0 jour pris) ; les mois sans congé gardent leur montant', () => {
    const c = ct({ start: '2025-09-01', trackedFrom: T, balances: sans });
    const ctx = makeCtx(c, [], [], '2026-12-31');
    expect(ctx.c.balances.cpRestants).toBe(23);
    expect(ctx.c.balances.cpEnCours).toBe(12.5);
    expect(computeMonth(ctx, '2026-11').nonGere).toEqual([]);
  });
  it('réponse donnée (case cochée) : les chiffres enregistrés servent, plus de question', () => {
    const c = ct({ start: '2025-09-01', trackedFrom: T, balances: { cpRestants: 18, cpEnCours: 12.5, maladieDeduits: 0, cpSaisi: true } });
    const leaves: AmLeave[] = [{ id: 'l1', type: 'cp', from: '2026-11-09', to: '2026-11-14' } as AmLeave];
    const r = computeMonth(makeCtx(c, [], leaves, '2026-12-31'), '2026-11');
    expect(r.nonGere).toEqual([]);
    expect(makeCtx(c, [], [], '2026-12-31').c.balances.cpRestants).toBe(18);
  });
});
