// Dossier de validation humaine de la paie : chaque cas est calculé par le vrai moteur d'Arvela, puis écrit dans
// docs/dossier-validation-paie.md pour être vérifié par un gestionnaire de paie ou un relais petite enfance.
// Lancer : npx vite-node scripts/dossier-validation.ts
import { writeFileSync } from 'node:fs';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { acquisition } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { euros } from '../src/engine/money';
import { addDays, type ISODate, type Month } from '../src/engine/dates';

function semaine(start: string, end: string, jours = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of jours) p[d] = [{ start, end }];
  return p;
}

function contrat(o: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Enfant', family: 'Famille', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: semaine('08:00', '17:00'), rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...o,
  };
}

const jour = (date: ISODate, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });

interface Cas {
  titre: string;
  contrat: string;
  evenements: string;
  question: string;
  calcul: () => string[];
}

function mois(c: Contract, m: Month, jours: DayRec[] = [], conges: AmLeave[] = [], enfants = 0): string[] {
  const ctx = makeCtx(c, jours, conges, lastOf(m), enfants);
  const r = computeMonth(ctx, m, enfants);
  const out = declarationLines(ctx, r).map((l) => `${l.label} : **${l.value}**${l.hint ? ` (${l.hint})` : ''}`);
  if (r.cpNote) out.push(`Note de l'app : ${r.cpNote}`);
  for (const a of r.alerts ?? []) out.push(`Alerte de l'app : ${a}`);
  return out;
}

function lastOf(m: Month): ISODate {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo, 0));
  return d.toISOString().slice(0, 10) as ISODate;
}

const CAS: Cas[] = [
  {
    titre: 'Mensualisation en année complète',
    contrat: 'Début 01/09/2025, année complète (52 semaines), 45 h par semaine (lundi à vendredi, 8 h à 17 h), 4,00 € net de l’heure, entretien au plancher légal.',
    evenements: 'Novembre 2026 sans absence. Le 11 novembre (mercredi) est férié et chômé.',
    question: 'Salaire mensualisé (45 h × 52 ÷ 12), jours d’activité, indemnité d’entretien et traitement du 11 novembre (art. 111) sont-ils justes ?',
    calcul: () => mois(contrat(), '2026-11'),
  },
  {
    titre: 'Heures majorées prévues au contrat',
    contrat: 'Comme le cas 1, mais 47 h 30 par semaine (8 h à 17 h 30), majoration de 10 % au-delà de 45 h.',
    evenements: 'Novembre 2026 sans absence.',
    question: 'Les 2 h 30 hebdomadaires au-delà de 45 h sont-elles bien mensualisées et majorées ? La réduction de cotisations salariales sur ces heures est-elle traitée comme Pajemploi le fait ?',
    calcul: () => mois(contrat({ planning: semaine('08:00', '17:30') }), '2026-11'),
  },
  {
    titre: 'Enfant malade avec certificat',
    contrat: 'Comme le cas 1.',
    evenements: 'L’enfant est absent, malade avec certificat, du lundi 16 au mercredi 18 novembre 2026.',
    question: 'La retenue pour absence (formule de l’art. 109 : salaire mensualisé × heures non travaillées ÷ heures réelles du mois) et le décompte des jours d’activité sont-ils justes ?',
    calcul: () => mois(contrat(), '2026-11', ['2026-11-16', '2026-11-17', '2026-11-18'].map((d) => jour(d as ISODate, { abs: 'malade_certif' }))),
  },
  {
    titre: 'Avenant en cours de mois (C-003)',
    contrat: 'Début 01/09/2025, année complète, 5 jours par semaine (8 h à 17 h), 4,00 € net. Avenant au 22/10/2026 : 3 jours par semaine (lundi, mardi, jeudi).',
    evenements: 'Octobre 2026 sans absence.',
    question: 'Arvela donne à chaque période sa part des jours mensualisés de ses propres conditions, puis arrondit une fois à l’entier supérieur. Aucun texte officiel ne traite l’avenant en cours de mois : cette convention est-elle acceptable ?',
    calcul: () => mois(contrat({ avenants: [{ id: 'a', from: '2026-10-22', changes: { planning: semaine('08:00', '17:00', [1, 2, 4]) } }] }), '2026-10'),
  },
  {
    titre: 'Entrée en cours de mois avec un férié avant le début (C-005, C-006)',
    contrat: 'Début le jeudi 12/11/2026, année complète, 45 h sur 5 jours, 4,00 € net.',
    evenements: 'Novembre 2026 : le 11 novembre, férié, tombe avant le premier jour.',
    question: 'Le prorata d’entrée est-il juste, et le férié hors période est-il bien exclu ?',
    calcul: () => mois(contrat({ start: '2026-11-12', trackedFrom: '2026-11-12' }), '2026-11'),
  },
  {
    titre: 'Année incomplète : congés payés en juin',
    contrat: 'Début 01/09/2025, année incomplète de 46 semaines programmées, 45 h sur 5 jours, 4,00 € net, congés payés versés en juin.',
    evenements: 'Juin 2026 : versement des congés acquis du 01/09/2025 au 31/05/2026.',
    question: 'Jours acquis, indemnité retenue (la plus favorable entre maintien de salaire et dixième, art. 102) et mensualisation en année incomplète (45 × 46 ÷ 12) sont-ils justes ?',
    calcul: () => mois(contrat({ yearType: 'incomplete', weeks: 46, weeksOff: [] }), '2026-06'),
  },
  {
    titre: 'Congés pris au-delà des droits (année complète)',
    contrat: 'Début 01/09/2025, année complète, 45 h sur 5 jours, 4,00 € net. Droits acquis au 31/05/2026 calculés par l’app.',
    evenements: 'L’AM prend 6 semaines de congés du 06/07/2026 au 14/08/2026.',
    question: 'Les jours pris au-delà des droits sont retenus comme congés sans solde, les droits étant consommés dans l’ordre des jours pris. Est-ce la bonne lecture ?',
    calcul: () => mois(contrat(), '2026-08', [], [{ id: 'l', type: 'cp', from: '2026-07-06', to: '2026-08-14' }]),
  },
  {
    titre: 'Congés supplémentaires pour enfants à charge',
    contrat: 'Début 01/09/2026, année complète, 45 h sur 5 jours. L’AM a 2 enfants à charge de moins de 15 ans.',
    evenements: 'Acquisition du 01/09/2026 au 31/05/2027.',
    question: '2 jours par enfant à charge, sans dépasser 30 jours au total : l’app apprécie les enfants à charge globalement et non au 30 avril. Est-ce juste ?',
    calcul: () => {
      const ctx = makeCtx(contrat({ start: '2026-09-01', trackedFrom: '2026-09-01' }), [], [], '2027-06-15', 2);
      const a = acquisition(ctx, 2026, 2);
      return [`Jours acquis : **${a.jours}**, dont ${a.enfantsBonus} au titre des enfants à charge (${a.semaines.toFixed(1).replace('.', ',')} semaines)`];
    },
  },
  {
    titre: 'Arrêt maladie de l’AM (correction du 08/11/2026)',
    contrat: 'Début 01/09/2026, année complète, 45 h sur 5 jours.',
    evenements: 'L’AM est en arrêt maladie du 02/11/2026 au 29/11/2026 (4 semaines).',
    question: 'L’app compte 2 jours par 4 semaines d’arrêt (L3141-5-1, loi d’avril 2024) et 2,5 pour le reste, et applique le plafond de 24 jours aux seuls jours acquis au titre de l’arrêt. Est-ce la bonne lecture de la combinaison des deux ?',
    calcul: () => {
      const ctx = makeCtx(contrat({ start: '2026-09-01', trackedFrom: '2026-09-01' }), [], [{ id: 'm', type: 'am_malade', from: '2026-11-02', to: '2026-11-29' }], '2027-06-15');
      const a = acquisition(ctx, 2026);
      return [`Jours acquis : **${a.jours}** (25 sans arrêt)`];
    },
  },
  {
    titre: 'Fin de contrat : retrait de l’enfant',
    contrat: 'Début 01/09/2024, année incomplète de 46 semaines, 45 h sur 5 jours, 4,00 € net.',
    evenements: 'Contrat avec 6 semaines sans accueil par an (Noël, printemps, août), prises par l’AM en congés payés, versés en juin. Lettre de retrait remise en main propre le 01/10/2026.',
    question: 'Préavis, indemnité de rupture (1/80 des salaires bruts, art. 121), congés non pris et régularisation (art. 98.1.2) sont-ils justes ? Les congés ont déjà été versés en juin 2025 et en juin 2026 : l’indemnité de congés de fin de contrat ne doit-elle porter que sur les jours acquis depuis le 1er juin 2026, et le montant affiché est-il cohérent avec le nombre de jours ?',
    calcul: () => {
      // 6 semaines sans accueil par année de contrat (Noël, printemps, août), prises par l'AM en congés payés
      const off: ISODate[] = ['2024-12-23', '2024-12-30', '2025-04-14', '2025-08-04', '2025-08-11', '2025-08-18',
        '2025-12-22', '2025-12-29', '2026-04-13', '2026-08-03', '2026-08-10', '2026-08-17',
        '2026-10-19', '2026-12-21', '2026-12-28', '2027-04-12', '2027-08-02', '2027-08-09'];
      const c = contrat({ start: '2024-09-01', trackedFrom: '2024-09-01', yearType: 'incomplete', weeks: 46, weeksOff: off });
      const conges: AmLeave[] = off.filter((d) => d < '2026-10-01').map((d, i) => ({ id: `cp${i}`, type: 'cp', from: d, to: addDays(d, 5) }));
      const ctx = makeCtx(c, [], conges, '2026-10-01');
      const f = finDeContrat(ctx, '2026-10-01', 'retrait');
      return [
        `Ancienneté : ${f.ancienneteMois} mois ; préavis : ${f.preavisLabel}, jusqu’au ${f.preavisFin.split('-').reverse().join('/')}`,
        `Indemnité de rupture : **${euros(f.indemniteRupture)}** (${f.ruptureExplication})`,
        `Congés restants : ${f.cpJoursRestants} jours, **${euros(f.cpIndemnite)}** (${f.cpExplication})`,
        `Régularisation : **${euros(f.regularisation)}**`,
        ...f.alertes.map((a) => `Alerte de l’app : ${a}`),
      ];
    },
  },
];

const lignes: string[] = [
  '# Dossier de validation de la paie d’Arvela',
  '',
  `Généré le ${new Date().toLocaleDateString('fr-FR')} par scripts/dossier-validation.ts, avec le moteur de paie réel de l’app.`,
  '',
  'Ce dossier est destiné à un gestionnaire de paie ou à une animatrice de relais petite enfance. Pour chaque cas : les données saisies, ce que l’app calcule, et la question posée. Merci d’indiquer pour chaque cas « juste » ou la valeur attendue, avec la règle appliquée.',
  '',
  'Cadre : convention collective des particuliers employeurs et de l’emploi à domicile (IDCC 3239), socle assistant maternel. Montants en euros nets sauf mention contraire. Le brut affiché par l’app est une estimation.',
  '',
];
CAS.forEach((k, i) => {
  lignes.push(`## Cas ${i + 1}. ${k.titre}`, '', `**Contrat.** ${k.contrat}`, '', `**Événements.** ${k.evenements}`, '', '**Ce que calcule Arvela :**', '');
  for (const l of k.calcul()) lignes.push(`- ${l}`);
  lignes.push('', `**Question.** ${k.question}`, '', '**Réponse du relecteur :** ……………………………………………', '');
});
writeFileSync(new URL('../docs/dossier-validation-paie.md', import.meta.url), lignes.join('\n'));
console.log(`${CAS.length} cas écrits dans docs/dossier-validation-paie.md`);
