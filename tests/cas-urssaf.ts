// Cas de validation de l'étape 5 : chaque cas produit les montants mensuels que la famille déclarerait à Pajemploi,
// passés au simulateur officiel Urssaf (api.urssaf.fr/paje/anss/v1/simulateur/calculerResteACharge) le 1er novembre 2026.
import { naissanceIlYA, planningRegulier, simulationParDefaut, type SimInput } from '../src/engine/simulation';
import type { Planning } from '../src/engine/model';

export const D = '2026-11-01';
const base: SimInput = { ...simulationParDefaut(D), planning: planningRegulier(5, 40), tauxBrut: 509, entretien: 380, revenusAn: 42000, enfants: [naissanceIlYA(D, 18)] };
const pl = (o: Record<number, [string, string][]>): Planning => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(([start, end]) => ({ start, end }))]));
const age = (mois: number) => naissanceIlYA(D, mois);

export interface Cas { id: string; libelle: string; input: SimInput; departement: string }

export const CAS: Cas[] = [
  { id: 'c01', libelle: 'couple, 1 enfant de 18 mois, 40 h sur 5 jours, 5,09 € brut', input: base, departement: '76' },
  { id: 'c02', libelle: 'couple, enfant de 8 ans : pas d’aide', input: { ...base, enfants: [age(96)] }, departement: '76' },
  { id: 'c03', libelle: '45 h à 10,89 € brut : au-dessus du plafond horaire', input: { ...base, planning: planningRegulier(5, 45), tauxBrut: 1089, entretien: 392 }, departement: '76' },
  { id: 'c04', libelle: 'Alsace-Moselle (Bas-Rhin), 5,10 € brut', input: { ...base, tauxBrut: 510, alsaceMoselle: true }, departement: '67' },
  { id: 'c05', libelle: 'Moselle, 45 h à 12,00 € brut : plafond dépassé', input: { ...base, planning: planningRegulier(5, 45), tauxBrut: 1200, alsaceMoselle: true, entretien: 400 }, departement: '57' },
  { id: 'c06', libelle: 'parent seul, 2 enfants à charge, enfant de 8 ans, déjeuner 4 €', input: { ...base, foyer: 'seul', enfants: [age(96)], enfantsACharge: 2, revenusAn: 18000, repas: { petitDej: 0, dejeuner: 400, gouter: 0, diner: 0 } }, departement: '76' },
  { id: 'c07', libelle: 'fratrie : 18 mois et 4 ans gardés', input: { ...base, enfants: [age(18), age(48)], enfantsACharge: 2 }, departement: '76' },
  { id: 'c08', libelle: 'fratrie en couple : 18 mois aidé, 8 ans sans aide', input: { ...base, enfants: [age(18), age(96)], enfantsACharge: 2 }, departement: '76' },
  { id: 'c09', libelle: 'trois enfants gardés, revenu 60 000 €', input: { ...base, enfants: [age(12), age(30), age(50)], enfantsACharge: 3, revenusAn: 60000 }, departement: '76' },
  { id: 'c10', libelle: 'revenu 6 000 € : plancher de ressources', input: { ...base, revenusAn: 6000 }, departement: '76' },
  { id: 'c11', libelle: 'revenu 150 000 € : plafond, CMG nul, cotisations prises en charge', input: { ...base, revenusAn: 150000 }, departement: '76' },
  { id: 'c12', libelle: '3 enfants à charge, 1 gardé, revenu 50 000 €', input: { ...base, enfantsACharge: 3, revenusAn: 50000 }, departement: '76' },
  { id: 'c13', libelle: '8 enfants à charge, revenu 30 000 €', input: { ...base, enfantsACharge: 8, revenusAn: 30000 }, departement: '76' },
  { id: 'c14', libelle: '2 enfants à charge dont 1 à l’AEEH', input: { ...base, enfantsACharge: 2, enfantsAeeh: 1 }, departement: '76' },
  { id: 'c15', libelle: '3 enfants à charge dont 2 à l’AEEH', input: { ...base, enfantsACharge: 3, enfantsAeeh: 2 }, departement: '76' },
  {
    id: 'c16', libelle: 'année incomplète 43 semaines, 50 h, 4,70 € brut, déjeuner 3,50 €, 2 enfants à charge',
    input: { ...base, yearType: 'incomplete', semainesAbsence: 4, planning: planningRegulier(5, 50), tauxBrut: 470, entretien: 435, repas: { petitDej: 0, dejeuner: 350, gouter: 0, diner: 0 }, enfantsACharge: 2, revenusAn: 60000 },
    departement: '76',
  },
  {
    id: 'c17', libelle: 'planning varié, déjeuner 4 € et goûter 1,20 €',
    input: { ...base, planning: pl({ 1: [['07:30', '18:30']], 2: [['07:30', '18:30']], 3: [['07:30', '08:30'], ['16:30', '18:30']], 5: [['08:00', '12:00']] }), repas: { petitDej: 0, dejeuner: 400, gouter: 120, diner: 0 } },
    departement: '76',
  },
  { id: 'c18', libelle: 'petit contrat : 20 h sur 3 jours, entretien 0,50 € de l’heure, revenu 25 000 €', input: { ...base, planning: planningRegulier(3, 20), entretienMode: 'heure', entretien: 50, revenusAn: 25000 }, departement: '76' },
  { id: 'c19', libelle: 'minimum 4,20 € brut, 47 h dont 2 majorées, entretien au minimum', input: { ...base, planning: planningRegulier(5, 47), tauxBrut: 420, entretien: 0, revenusAn: 36000 }, departement: '76' },
  { id: 'c20', libelle: 'La Réunion : mêmes règles qu’en métropole', input: base, departement: '974' },
];

export function tranche(mois: number): string {
  return mois < 36 ? '03' : mois < 72 ? '36' : mois < 144 ? '612' : '+12';
}
