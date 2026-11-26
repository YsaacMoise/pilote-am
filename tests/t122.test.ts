// T-122 (phase C) : validation partagée du contrat, assistant d'ajout (rien de choisi d'avance), contrat enregistré.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Contract, Planning } from '../src/engine/model';
import { contratAEnregistrer, erreursContrat } from '../src/screens/contrat-validation';
import { contratFinal, contratVide, ecransEtape, erreursEcran } from '../src/screens/AjoutEnfant';
import { nbEtapes } from '../src/brouillons';
import { state } from '../src/store';
import { firstDay, monthOf, today } from '../src/engine/dates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, entretienMode: 'jour', repasParents: true,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, departement: '75', ...over,
  } as Contract;
}
const debutMois = firstDay(monthOf(today()));

describe('T-122 : validation du contrat partagée', () => {
  it('contrat complet : aucune erreur', () => {
    expect(erreursContrat(contract(), true)).toEqual([]);
  });
  it('mêmes messages qu’avant l’extraction', () => {
    const e = erreursContrat(contract({ child: ' ', start: '', planning: {}, repasParents: undefined, alsaceMoselle: undefined, planningVariable: undefined, accueilOccasionnel: undefined, cdd: undefined, entretienMode: undefined }), true);
    expect(e).toEqual([
      'Indique le prénom de l’enfant.', 'Indique la date de début du contrat.', 'Le planning est vide : ajoute au moins un jour d’accueil.',
      'Indique qui fournit les repas de l’enfant.', 'Indique le département où tu accueilles l’enfant.', 'Indique si le planning est le même chaque semaine.',
      'Indique si l’accueil est régulier ou occasionnel.', 'Indique si le contrat est un CDI ou un CDD.', 'Indique si l’indemnité d’entretien est fixée par heure ou par jour.',
    ]);
    // Contrat existant : le mode de l'entretien n'est pas redemandé.
    expect(erreursContrat(contract({ entretienMode: undefined }), false)).toEqual([]);
    expect(erreursContrat(contract({ cdd: true }), true)).toEqual(['Indique la date de fin prévue du CDD.', 'Indique pourquoi le CDD a été signé.']);
    expect(erreursContrat(contract({ planning: { 1: [{ start: '17:00', end: '08:00' }] } }), true)).toContain('lundi : l’heure de fin doit être après le début.');
  });
  it('contrat enregistré : reprise au 1er du mois, semaines, noms nettoyés, soldes de départ cochés', () => {
    const c = contract({ child: ' Léa ', family: ' Martin ', start: '2025-09-01', weeks: 40, partage: undefined });
    const s = contratAEnregistrer(c, { isNew: true, curMonthStart: '2026-11-01', soldesDepart: { cpRestants: 23, cpEnCours: 12.5 } });
    expect(s.trackedFrom).toBe('2026-11-01');
    expect(s.weeks).toBe(52);
    expect([s.child, s.family]).toEqual(['Léa', 'Martin']);
    expect(s.balances).toMatchObject({ cpRestants: 23, cpEnCours: 12.5, cpSaisi: true });
    expect('partage' in s).toBe(false);
    const n = contratAEnregistrer(contract({ start: '2026-11-10' }), { isNew: true, curMonthStart: '2026-11-01' });
    expect(n.trackedFrom).toBe('2026-11-10');
    expect(n.balances.cpSaisi).toBeUndefined();
  });
  it('l’écran Contrat et l’assistant appellent les mêmes fonctions', () => {
    for (const f of ['src/screens/Contrat.tsx', 'src/screens/AjoutEnfant.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('erreursContrat(');
      expect(src).toContain('contratAEnregistrer(');
    }
  });
});

describe('T-122 : assistant, rien de choisi d’avance (décision 1 du DG)', () => {
  it('contrat vide : aucune réponse proposée', () => {
    state.settings = { ...state.settings, departement: undefined };
    const c = contratVide();
    expect(c.start).toBe('');
    expect(c.yearType).toBeUndefined();
    expect(c.cdd).toBeUndefined();
    expect(c.accueilOccasionnel).toBeUndefined();
    expect(c.planningVariable).toBeUndefined();
    expect(c.planning).toEqual({});
    expect(c.rateNet).toBeUndefined();
    expect(c.entretienMode).toBeUndefined();
    expect(c.repasParents).toBeUndefined();
    expect(c.cpMode).toBeUndefined();
    expect(c.pajemploiPlus).toBeUndefined();
    expect(c.departement).toBeUndefined();
  });
  it('le département du profil est repris (Alsace-Moselle déduite)', () => {
    state.settings = { ...state.settings, departement: '67' };
    expect(contratVide()).toMatchObject({ departement: '67', alsaceMoselle: true, mayotte: false });
    state.settings = { ...state.settings, departement: undefined };
  });
  it('étape 6 seulement si le contrat a commencé avant le mois en cours', () => {
    expect(nbEtapes({ start: '2025-09-01' }, debutMois)).toBe(6);
    expect(nbEtapes({ start: debutMois }, debutMois)).toBe(5);
    expect(ecransEtape(6, contract({ start: debutMois }))).toEqual([]);
    expect(ecransEtape(6, contract({ start: '2025-09-01' }))).toEqual(['avant1', 'avant2']);
    expect(ecransEtape(2, contract({ cdd: true, yearType: 'incomplete' }))).toEqual(['contrat', 'cdd', 'annee', 'incomplete']);
    expect(ecransEtape(3, contract({ accueilOccasionnel: true }))).toEqual([]);
  });
  it('chaque écran demande ses réponses ; taux sous le minimum refusé', () => {
    const vide = contratVide();
    expect(Object.keys(erreursEcran('contrat', vide, {}, {}))).toEqual(['start', 'cdd', 'accueil']);
    expect(Object.keys(erreursEcran('salaire', vide, {}, {}))).toEqual(['rateNet', 'majorations']);
    expect(erreursEcran('salaire', contract({ rateNet: 100 }), { majorations: 'convention' }, {}).rateNet).toMatch(/^Inférieur au minimum conventionnel/);
    expect(Object.keys(erreursEcran('frais', vide, {}, {}))).toEqual(['entretien', 'repas', 'km']);
    expect(Object.keys(erreursEcran('frais', contract({ repasParents: false }), { km: 'oui' }, {}))).toEqual(['repasPrix', 'repasParJour', 'kmTaux']);
    expect(Object.keys(erreursEcran('planning', contract({ planning: { 1: [{ start: '', end: '' }] } }), {}, {}))).toEqual(['j1']);
    expect(Object.keys(erreursEcran('enfant', vide, {}, {}))).toEqual(['child', 'family', 'departement']);
    expect(erreursEcran('enfant', contract({ parentEmail: 'abc' }), {}, { departementProfil: '75' }).parentEmail).toBeTruthy();
    expect(erreursEcran('avant2', contract(), {}, {}).maladie).toBeTruthy();
  });
  it('contrat final : réponses reportées, année complète en « juin » comme avant', () => {
    const f = contratFinal(contract({ cpMode: undefined as unknown as Contract['cpMode'] }), { pajemploi: 'oui', maladie: 2 });
    expect(f.cpMode).toBe('juin');
    expect(f.pajemploiPlus).toBe(true);
    expect(f.balances.maladieDeduits).toBe(2);
    expect('pajemploiPlus' in contratFinal(contract({ pajemploiPlus: true }), { pajemploi: 'nr' })).toBe(false);
    expect(erreursContrat(contratFinal(contract(), {}), true)).toEqual([]);
  });
  it('les brouillons ne passent jamais par les données ni le compte', () => {
    const src = readFileSync('src/brouillons.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\/store'|putContract|cloud/);
    expect(src).toContain("isDemo() ? 'pam-brouillons-demo' : 'pam-brouillons'");
  });
});
