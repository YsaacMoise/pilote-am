// Adaptateur du moteur A (moteur en production, TypeScript) pour le comparateur T-008.
// Il ne modifie aucun fichier du moteur A : il importe ses fonctions publiques et les appelle.
// Entrée : chemin d'un fichier JSON (liste de situations). Sortie : JSON sur la sortie standard.
// Montants en centimes entiers. Le taux de la situation est donné au moteur A tel quel (champ rateNet).
import { readFileSync } from 'node:fs';
import type { AmLeave, Contract, DayRec, Planning } from '__A_RACINE__/src/engine/model';
import { TERM_KEYS } from '__A_RACINE__/src/engine/model';

// T-042c : le moteur A a-t-il l'entrée « montant horaire d'entretien » (T-044, M10, commit 7cf046d) ? Lu à l'exécution
// dans la liste des clés du contrat, pour rester compatible avec A = 19f985f, qui ne l'a pas (refus visible).
const A_ENTRETIEN_HORAIRE = (TERM_KEYS as string[]).includes('entretienHeure');
// T-042c : le moteur A a-t-il le paramètre d'inexécution du préavis (T-045, M11) ? Lu dans le texte de la fonction,
// faute d'autre marque à l'exécution (le type `Inexecution` n'existe pas à l'exécution).
const A_INEXECUTION = finDeContrat.toString().includes('dernierJourTravaille');
/** Montant « n » ou « a/b » (centimes), tel que la situation le donne. */
const montant = (v: unknown): number => {
  const t = String(v);
  const [a, b] = t.split('/');
  return b === undefined ? Number(a) : Number(a) / Number(b);
};
import { dayInfo, makeCtx, mensuelMinutes, monthBase, regularisation, salaireMensualise, type Ctx } from '__A_RACINE__/src/engine/payroll';
import { acquisition, cpForMonth, decompteConge, indemnite, maintien } from '__A_RACINE__/src/engine/conges';
import { finDeContrat, type Motif } from '__A_RACINE__/src/engine/fin';
import { entretienPlancher, netToBrut, ratesAt } from '__A_RACINE__/src/engine/rates';
// T-027 : fonctions publiques du moteur A pour les kilomètres et les événements familiaux (signatures seulement).
import { controleKm } from '__A_RACINE__/src/engine/km';
import { dureeEvenement } from '__A_RACINE__/src/engine/evenements';

type Sortie = { statut: 'ok' | 'absent' | 'refus'; valeur?: unknown; note?: string; non_comparable?: boolean; lectures?: unknown[] };
type Sorties = Record<string, Sortie>;

function contrat(k: any): Contract {
  const planning: Planning = {};
  for (const [j, plages] of Object.entries(k.planning ?? {})) {
    planning[Number(j)] = (plages as string[][]).map(([start, end]) => ({ start, end }));
  }
  return {
    id: 'c1', child: 'Enfant', family: 'Famille', color: 0, start: k.debut, end: k.fin ?? undefined,
    yearType: k.type_annee, weeks: k.semaines, weeksOff: k.semaines_sans_accueil ?? [], planning,
    // T-033 (M6) : taux des heures complémentaires du contrat (T-030, HC-03 à HC-06) ; réponses aux 3 questions T-031
    // (situations de la grille et des cas officiels : métropole, semaine type fixe, accueil régulier).
    rateNet: k.taux, majoration: k.majoration_hm ?? 10, majorationCompl: k.majoration_hc, entretienJour: k.entretien_jour ?? 0,
    // T-034 (M7) : réponse à la question « CDI ou CDD ? » ajoutée par T-033 (cbbbd66). Toutes les situations sont des CDI
    // (FIN-11, seul CDD, est déclaré « absent » de A par generer_situations.py).
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    repasPrix: k.repas_prix ?? 0, repasParJour: k.repas_par_jour ?? 0, kmTaux: k.km_taux ?? 0, kmCv: k.km_cv ?? undefined,
    cpMode: k.cp_mode ?? 'juin', majoreFiscal: false, trackedFrom: k.suivi_depuis ?? k.debut,
    balances: {
      cpRestants: k.soldes?.cp_restants ?? 0, cpEnCours: k.soldes?.cp_en_cours ?? 0,
      maladieDeduits: k.soldes?.maladie_deduits ?? 0,
    },
    history: k.historique ?? [], createdAt: 0,
    // T-042c : montant horaire transmis tel quel quand A sait le lire ; sinon rien (refus visible dans « mois »).
    ...(k.entretien_horaire != null && A_ENTRETIEN_HORAIRE ? { entretienHeure: montant(k.entretien_horaire) } : {}),
    // T-042f (M11, T-045b) : réponse enregistrée sur le préavis (Contract.rupture), seulement si la situation la donne.
    ...(k.rupture ? { rupture: { motif: k.rupture.motif, notif: k.rupture.notif, presentation: k.rupture.presentation,
      preavis: k.rupture.preavis, dernierJourTravaille: k.rupture.dernier_jour_travaille } } : {}),
  } as Contract;
}

function contexte(s: any): Ctx {
  const c = contrat(s.contrat);
  const recs: DayRec[] = (s.evenements?.jours ?? []).map((j: any) => ({
    key: `c1|${j.date}`, cid: 'c1', date: j.date,
    pres: j.pres ? j.pres.map(([a, d]: string[]) => ({ a, d })) : undefined,
    abs: j.abs, extra: j.extra, ferieTravaille: j.ferie_travaille, repas: j.repas, km: j.km,
    kmPartage: j.km_partage === undefined ? undefined : j.km_partage, kmEnfants: j.km_enfants ?? undefined,
  }));
  const leaves: AmLeave[] = (s.evenements?.absences_am ?? []).map((l: any, i: number) => ({
    id: `l${i}`, type: l.type, from: l.du, to: l.au, nature: l.nature ?? undefined,
  }));
  // T-033 (M6) : âge de l'AM (R-CP-03) passé comme dans l'app : dernière année y où elle a moins de 21 ans au 30 avril y.
  // La situation donne l'âge au début du contrat ; on le rapporte à l'année de début.
  const age = s.contrat.age_am;
  const moins21 = typeof age === 'number' && age < 21 ? Number(c.start.slice(0, 4)) + (20 - age) : undefined;
  return makeCtx(c, recs, leaves, s.aujourdhui ?? '2027-12-31', s.contrat.enfants_a_charge ?? 0, moins21);
}

function preavisNormalise(label: string): unknown {
  if (label.startsWith('8 jours')) return { jours: 8 };
  if (label.startsWith('15 jours')) return { jours: 15 };
  if (label.startsWith('1 mois')) return { mois: 1 };
  if (label.startsWith('Pas de préavis')) return null;
  return label;
}

const ok = (valeur: unknown, note?: string): Sortie => (note ? { statut: 'ok', valeur, note } : { statut: 'ok', valeur });
const absent = (note: string): Sortie => ({ statut: 'absent', note });
// T-033 (M6) : ce que A affiche « à confirmer » ou « non géré » est un refus, pas la borne interne.
const refus = (note: string, lectures?: unknown[]): Sortie => (lectures ? { statut: 'refus', note, lectures } : { statut: 'refus', note });

// Un calcul produit des sorties nommées ; `nom` les renomme (clé du moteur A -> clé commune).
function calculer(s: any, ctx: Ctx, k: any): Sorties {
  const out: Sorties = {};
  const enfants = s.contrat.enfants_a_charge ?? 0;
  switch (k.type) {
    case 'mois': {
      const b = monthBase(ctx, k.mois);
      out.salaire_mensualise = ok(b.salaireMens);
      out.salaire_base_mois = ok(b.base);
      out.deduction = ok(b.salaireMens - b.base);
      out.heures_compl_montant = ok(b.complAmount);
      out.heures_maj_montant = ok(b.majAmount);
      out.ferie_travaille_montant = ok(b.ferieAmount);
      out.salaire_mois_hors_cp = ok(b.net);
      out.entretien = ok(b.entretien);
      // T-042c : contrat à montant horaire et moteur A sans cette entrée (19f985f) : refus visible, aucune conversion.
      if (s.contrat.entretien_horaire != null && !A_ENTRETIEN_HORAIRE) {
        out.entretien = refus('A : montant horaire d’entretien non géré par cette version de A (tarif par jour seulement)');
      }
      // T-042c, T-042f : A (T-044) verse la part certaine et met l'écart « à confirmer », hors du total (tarif par jour sur un
      // jour d'une autre durée que le planning ; montant horaire quand la présence diffère du temps de travail, T-044b). La sortie est donc rendue comme un refus de A, avec le montant.
      const entAConf = (b as any).entretienAConfirmer;
      if (entAConf) out.entretien = refus(`A : ${entAConf} centimes d’entretien à confirmer (${s.contrat.entretien_horaire != null ? 'montant horaire : présence de l’enfant différente du temps de travail' : 'tarif par jour : jour d’une autre durée que le planning'} ; part certaine ${b.entretien})`);
      out.repas = ok(b.repas);
      out.km = ok(b.km);
      out.alertes = ok(b.alerts);
      if (b.evenementAConfirmer) {
        const n = `A : ${b.evenementAConfirmer} centimes de salaire à confirmer (jours ni payés ni retenus)`;
        for (const cle of ['salaire_base_mois', 'deduction', 'salaire_mois_hors_cp']) out[cle] = refus(n);
      }
      if (b.kmAConfirmer) out.km = refus(`A : ${b.kmAConfirmer} km à confirmer`);
      if (b.nonGere.length) for (const cle of Object.keys(out)) if (cle !== 'alertes') out[cle] = refus(`A : non géré (${b.nonGere.join(' ')})`);
      break;
    }
    case 'mensualisation': {
      out.salaire_mensualise = ok(salaireMensualise(ctx.c));
      out.minutes_mensualisees = ok(mensuelMinutes(ctx.c));
      out.heures_mensualisees = ok(mensuelMinutes(ctx.c) / 60);
      break;
    }
    case 'cp_acquisition': {
      const a = acquisition(ctx, k.periode, enfants);
      out.jours_acquis = ok(a.jours);
      out.jours_enfants = ok(a.enfantsBonus);
      out.jours_acquis_hors_enfants = ok(a.jours - a.enfantsBonus);
      if (a.aConfirmer) {
        // SUS-11 (année incomplète) et A-23 (année complète) : A affiche « à confirmer » avec ses lectures.
        const lec = a.aConfirmer.lectures.map((l: any) => ({ methode: l.methode, jours: l.jours }));
        const note = `A : à confirmer (${a.aConfirmer.message})`;
        out.jours_acquis = refus(note, lec);
        out.jours_enfants = refus(note);
        out.jours_acquis_hors_enfants = refus(note);
      }
      break;
    }
    case 'cp_indemnite': {
      const i = indemnite(ctx, k.periode, enfants);
      out.indemnite_cp = ok(i.montant);
      out.maintien_cp = ok(i.maintien);
      out.dixieme_cp = ok(i.dixieme);
      out.jours_droit = ok(i.jours);
      if (i.aConfirmer) {
        const note = `A : à confirmer (${i.aConfirmer.message})`;
        const lec = i.aConfirmer.montants.map((m: any) => ({ libelle: m.libelle, jours: m.jours, montant: m.montant }));
        for (const cle of ['indemnite_cp', 'maintien_cp', 'dixieme_cp', 'jours_droit']) out[cle] = refus(note, lec);
      }
      break;
    }
    case 'cp_mois': {
      const m = cpForMonth(ctx, k.mois, enfants);
      out.cp_indemnite_mois = ok(m.indemnite);
      out.cp_complement_mois = ok(m.complement);
      if (m.aConfirmer) {
        // Année incomplète : l'indemnité est à confirmer ; il n'y a pas de complément de juin (année complète seulement).
        out.cp_indemnite_mois = refus(`A : à confirmer (${m.aConfirmer})`);
        if (ctx.c.yearType === 'complete') out.cp_complement_mois = refus(`A : à confirmer (${m.aConfirmer})`);
      }
      break;
    }
    case 'fin': {
      // T-042c (M11, T-045) : préavis non exécuté, transmis à A sous la forme `Inexecution` (6e paramètre de
      // finDeContrat). Une version de A sans ce paramètre l'ignorerait en silence : refus visible dans ce cas.
      if (k.inexecution && !A_INEXECUTION) {
        for (const cle of ['date_fin_preavis', 'indemnite_rupture', 'iccp', 'regularisation_fin', 'assiette_rupture'])
          out[cle] = refus('A : préavis non exécuté non géré par cette version de A (pas de paramètre d’inexécution)');
        out.preavis = ok(preavisNormalise(finDeContrat(ctx, k.notification, k.motif as Motif, enfants, k.presentation).preavisLabel));
        break;
      }
      const inex = k.inexecution ? { demandeur: k.inexecution.demandeur, dernierJourTravaille: k.inexecution.dernier_jour_travaille } : undefined;
      const f = (finDeContrat as (...a: unknown[]) => ReturnType<typeof finDeContrat>)(ctx, k.notification, k.motif as Motif, enfants, k.presentation, inex);
      out.preavis = ok(preavisNormalise(f.preavisLabel));
      out.date_fin_preavis = ok(f.preavisFin);
      out.indemnite_rupture = ok(f.indemniteRupture);
      out.iccp = ok(f.cpIndemnite);
      const bloque = f.alertes.some((a) => a.startsWith('Régularisation non calculée'));
      out.regularisation_fin = bloque ? { statut: 'refus', note: 'alerte : semaines sans accueil manquantes' } : ok(f.regularisation);
      out.assiette_rupture = ok(f.totalBrut);
      if (f.preavisFinAConfirmer) out.date_fin_preavis = refus(`A : date calculée ${f.preavisFin}, affichée à confirmer (${f.preavisFinAConfirmer})`);
      if (f.ruptureAConfirmer) out.indemnite_rupture = refus(`A : indemnité affichée à confirmer (${f.indemniteRupture} calculés)`);
      if (f.cpAConfirmer) out.iccp = refus(`A : à confirmer (${f.cpAConfirmer})`);
      if (f.nonGere?.length) for (const cle of Object.keys(out)) if (cle !== 'preavis') out[cle] = refus(`A : non géré (${f.nonGere.join(' ')})`);
      break;
    }
    case 'cp_decompte': {
      // T-033 (M6) : décompte de l'app (T-019, `decompteConge` : jusqu'à la veille de la reprise), pas la fonction brute
      // `joursOuvrables` entre les deux dates saisies.
      const conge: AmLeave = { id: 'decompte', type: 'cp', from: k.du, to: k.au };
      const ctx2 = makeCtx(ctx.c, [...ctx.days.values()], [...ctx.leaves, conge], ctx.today, ctx.enfants, ctx.amMoins21Jusqu);
      const d = decompteConge(ctx2, conge);
      out.jours_decomptes = d.aConfirmer ? refus(`A : à confirmer (${d.aConfirmer})`) : ok(d.jours);
      break;
    }
    case 'jour_retenu': {
      const di = dayInfo(ctx, k.date);
      out.deductible = di.aConfirmer ? refus(`A : à confirmer (${di.aConfirmer})`) : ok(di.deducted);
      break;
    }
    case 'ferie': {
      const di = dayInfo(ctx, k.date);
      if (di.kind !== 'ferie') out.ferie_paye = absent(`jour de type ${di.kind}`);
      else out.ferie_paye = ok(!di.ferieNonPaye);
      break;
    }
    // Appels « atomiques » utilisés pour les cas officiels.
    case 'maintien':
      out.maintien = ok(maintien(ctx, k.jours, k.date ?? ctx.today));
      break;
    case 'plancher_entretien':
      out.minimum_entretien = ok(entretienPlancher(k.date, k.minutes));
      break;
    case 'minimum_conventionnel':
      out.minimum_brut = ok(ratesAt(k.date).minConvBrut);
      out.minimum_net = ok(ratesAt(k.date).minConvNet);
      break;
    case 'brut_depuis_net':
      out.brut_estime = ok(netToBrut(k.net, k.date));
      break;
    case 'denominateur': {
      const b = monthBase(ctx, k.mois);
      out.prevu_minutes = ok(b.divisorMin);
      out.prevu_jours = ok(b.divisorDays);
      break;
    }
    case 'regularisation':
      out.regularisation = ok(regularisation(ctx, k.du, k.au).montant);
      break;
    // T-027
    case 'km_controle':
      out.km_controle = ok(controleKm(k.cv, k.taux, k.date).niveau);
      break;
    case 'evt_duree': {
      const n = dureeEvenement(k.nature, k.date);
      out.evt_duree = n === undefined ? { statut: 'refus', note: 'durée non donnée par A' } : ok(n);
      break;
    }
    case 'absent':
      for (const nom of k.sorties) out[nom] = k.non_comparable ? { statut: 'absent', note: k.note, non_comparable: true } as Sortie : absent(k.note);
      break;
    default:
      throw new Error(`type de calcul inconnu : ${k.type}`);
  }
  const res: Sorties = {};
  const prefixe = k.id ? `${k.id}.` : '';
  for (const [cle, v] of Object.entries(out)) {
    if (k.sorties && !k.sorties.includes(cle)) continue;
    const nom = k.renommer?.[cle] ?? `${prefixe}${cle}`;
    res[nom] = v;
  }
  return res;
}

function executer(s: any): Sorties {
  const calculs = s.a_calculs ?? s.calculs;
  const res: Sorties = {};
  for (const k of calculs) {
    // Une variante de contrat propre au calcul est permise (cas officiels).
    const sit = k.contrat ? { ...s, contrat: { ...s.contrat, ...k.contrat }, evenements: k.evenements ?? s.evenements } : s;
    try {
      Object.assign(res, calculer(sit, contexte(sit), k));
    } catch (e) {
      const nom = k.id ?? k.type;
      res[`${nom}.erreur`] = { statut: 'refus', note: String(e) };
    }
  }
  return res;
}

const situations = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sortie: Record<string, Sorties> = {};
for (const s of situations) sortie[s.id] = executer(s);
process.stdout.write(JSON.stringify(sortie));
