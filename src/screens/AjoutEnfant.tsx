// T-122 (phase C) : assistant d'ajout d'un enfant accueilli (maquettes 03 à 11 et 15 à 18 ; états d'arrivée 05b, 07a, 09b,
// 10, 10b). Écrans courts dans l'ordre, rien de coché ni de rempli d'avance (décision 1 du DG du 26/11/2026), progression
// gardée sur ce téléphone à chaque « Continuer » (brouillons.ts) ; « Créer le contrat » applique la validation et
// l'enregistrement de l'écran Contrat (contrat-validation.ts).
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { logErreur, logUsage, putContract, deleteContract, saveSettings, state, toast, uid, useStore } from '../store';
import { firstDay, monthOf, shortDate, today, JOUR_NOMS } from '../engine/dates';
import { dureeMoyenneContrat, SEUIL_ACCORD_MIN, AMPLITUDE_MAX_MIN, messageAmplitude, erreursDureeContrat } from '../engine/durees';
import { daysPerWeek, joursMensualises, mensuelMinutes, salaireMensualise, weeklyMinutes } from '../engine/payroll';
import { ratesAtRegion, ratesConnus } from '../engine/rates';
import { regionDe } from '../engine/regions';
import { congesDeDepart, MESSAGE_SOLDE_CONGES, soldeCongesInconnu } from '../engine/conges';
import { euros, hoursLabel } from '../engine/money';
import type { Contract, Plage, Planning } from '../engine/model';
import { manquesOccasionnel } from '../engine/occasionnel';
import { manquesPV } from '../engine/planningVariable';
import { messagesCdd } from '../engine/cdd';
import { planningAvecDimanche } from '../engine/nonGeres';
import { libelleDepartement, lieuDuDepartement } from '../engine/departements';
import { de } from '../engine/texte';
import { PAJEMPLOI_PLUS_AIDE } from '../legal';
import { Banner, Choices, couleurLibre, couleursPrises, DateInput, EuroInput, ListLink, NumberInput, Switch, TextInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { AccueilsOccasionnels, brouillon as brouillonSimulateur, WeeksOff } from './Contrat';
import { PlanningVariableSaisie } from './PlanningVariableSaisie';
import { EntretienSaisie, libelleEntretien } from './EntretienSaisie';
import { BrutSaisie } from './BrutSaisie';
import { CongesDepart } from './CongesDepart';
import { DepartementSaisie } from './Profil';
import { TITRE_AM_AP } from './textes-contrat';
import { SupprimerBrouillon } from './BrouillonSuppression';
import { contratAEnregistrer, erreursContrat } from './contrat-validation';
import { enregistrerBrouillon, lireBrouillon, nbEtapes, supprimerBrouillon, type Brouillon, type ReponsesAssistant } from '../brouillons';

export const NOMS_ETAPES = ['L’enfant et son employeur', 'Le contrat', 'Le planning', 'Le salaire', 'Les frais', 'Avant Arvela'];
const SOUS_TITRES = ['Prénom, employeur, contact', 'Début, CDI ou CDD, semaines', 'Jours et horaires', 'Taux horaire, majorations', 'Entretien, repas, kilomètres', 'Congés pris, absences retenues'];

const debutMoisEnCours = () => firstDay(monthOf(today()));

/** Contrat vide de l'assistant : aucune réponse proposée (le département vient du profil, la couleur est libre). */
export function contratVide(): Contract {
  const t = today();
  const dep = state.settings.departement;
  return {
    id: uid(), child: '', family: '', color: couleurLibre(couleursPrises(state.contracts, '', t)), start: '',
    yearType: undefined as unknown as Contract['yearType'], weeks: 52, weeksOff: [], planning: {},
    rateNet: undefined as unknown as number, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
    cpMode: undefined as unknown as Contract['cpMode'], majoreFiscal: false, trackedFrom: '',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: Date.now(),
    ...(dep ? { departement: dep, ...lieuDuDepartement(dep) } : {}),
    // Brouillon venu du simulateur : les conditions que l'AM y a saisies.
    ...(brouillonSimulateur() ?? {}),
  };
}

/** Plages complètes seulement (horaires vides pendant la saisie) */
function planningRempli(pl: Planning): Planning {
  const out: Planning = {};
  for (let d = 1; d <= 7; d++) out[d] = (pl[d] ?? []).filter((p) => p.start && p.end && p.end > p.start);
  return out;
}

/** Contrat final : réponses de l'assistant reportées dans les champs que lit le moteur. */
export function contratFinal(c: Contract, r: ReponsesAssistant): Contract {
  const out: Contract = {
    ...c,
    balances: { ...c.balances, maladieDeduits: r.maladie ?? c.balances.maladieDeduits ?? 0 },
    // Année complète : le mode de versement n'est pas demandé (il ne sert qu'en année incomplète) ; valeur d'avant T-122.
    cpMode: c.cpMode ?? 'juin',
  };
  if (r.pajemploi === 'oui') out.pajemploiPlus = true;
  else if (r.pajemploi === 'non') out.pajemploiPlus = false;
  else delete out.pajemploiPlus;
  return out;
}

type Ecran = 'enfant' | 'contrat' | 'cdd' | 'annee' | 'incomplete' | 'accueils' | 'planning' | 'salaire' | 'frais' | 'avant1' | 'avant2';

/** Écrans de l'étape n, selon les réponses déjà données */
export function ecransEtape(n: number, c: Contract): Ecran[] {
  switch (n) {
    case 1: return ['enfant'];
    case 2: return ['contrat', ...(c.cdd ? ['cdd' as const] : []), ...(c.accueilOccasionnel ? ['accueils' as const] : ['annee' as const]), ...(!c.accueilOccasionnel && c.yearType === 'incomplete' ? ['incomplete' as const] : [])];
    case 3: return c.accueilOccasionnel ? [] : ['planning'];
    case 4: return ['salaire'];
    case 5: return ['frais'];
    case 6: return c.start && c.start < debutMoisEnCours() ? ['avant1', 'avant2'] : [];
    default: return [];
  }
}

const familles = () => {
  const m = new Map<string, string[]>();
  for (const k of state.contracts) { const f = k.family.trim(); if (f) m.set(f, [...(m.get(f) ?? []), k.child]); }
  return [...m.entries()];
};

const emailValide = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const telValide = (v: string) => !v.trim() || /^[+\d][\d .-]{7,}$/.test(v.trim());

/** Erreurs d'un écran (clé = champ). Plus strict que la validation finale : chaque réponse est demandée. */
export function erreursEcran(e: Ecran, c: Contract, r: ReponsesAssistant, o: { departementProfil?: string; departCalculable?: boolean; avantComplet?: boolean }): Record<string, string> {
  const x: Record<string, string> = {};
  if (e === 'enfant') {
    if (!c.child.trim()) x.child = 'Indique le prénom de l’enfant.';
    if (familles().length && !r.employeur) x.employeur = 'Choisis l’employeur.';
    else if (!c.family.trim()) x.family = 'Indique le nom de famille de l’employeur.';
    if (!emailValide(c.parentEmail ?? '')) x.parentEmail = 'Adresse e-mail incomplète, par exemple nom@exemple.fr.';
    if (!telValide(c.parentTel ?? '')) x.parentTel = 'Numéro incomplet, par exemple 06 12 34 56 78.';
    if (!o.departementProfil && !c.departement) x.departement = 'Choisis le département où tu accueilles.';
  }
  if (e === 'contrat') {
    if (!c.start) x.start = 'Indique la date de début du contrat.';
    if (c.cdd === undefined) x.cdd = 'Choisis CDI ou CDD.';
    if (c.accueilOccasionnel === undefined) x.accueil = 'Choisis un accueil régulier ou occasionnel.';
  }
  if (e === 'cdd') {
    if (c.cddTermeImprecis === undefined) x.cddTermeImprecis = 'Indique si le CDD a une date de fin précise.';
    else if (!c.cddTerme) x.cddTerme = c.cddTermeImprecis ? 'Indique la fin de la durée minimale.' : 'Indique la date de fin prévue.';
    else if (c.cddTerme < c.start) x.cddTerme = 'Cette date est avant le début du contrat.';
    if (!c.cddMotif) x.cddMotif = 'Indique pourquoi ce CDD a été signé.';
    else if (c.cddMotif === 'remplacement' && !c.cddTermeImprecis && !c.cddCasRemplacement) x.cddCasRemplacement = 'Indique quel remplacement.';
  }
  if (e === 'annee' && !c.yearType) x.yearType = 'Choisis année complète ou incomplète.';
  if (e === 'incomplete') {
    if (!c.weeks || c.weeks < 1 || c.weeks > 46) x.weeks = 'Nombre de semaines entre 1 et 46.';
    if (!c.cpMode) x.cpMode = 'Indique quand tes congés payés te sont versés.';
  }
  if (e === 'accueils') {
    const m = manquesOccasionnel(c);
    if (m.length) x.accueils = `Indique ${m.join(', ')}.`;
    for (const a of c.accueils ?? []) for (let d = 1; d <= 7; d++) for (const p of a.planning[d] ?? []) if (!p.start || !p.end || p.end <= p.start) x.accueils = `${JOUR_NOMS[d - 1]} (accueil du ${shortDate(a.du)}) : l’heure de fin doit être après le début.`;
  }
  if (e === 'planning') {
    if (c.planningVariable === undefined) x.planningVariable = 'Indique si les horaires sont les mêmes chaque semaine.';
    else if (!c.planningVariable) {
      if (weeklyMinutes(planningRempli(c.planning)) <= 0 && ![1, 2, 3, 4, 5, 6, 7].some((d) => (c.planning[d] ?? []).length)) x.jours = 'Coche au moins un jour d’accueil.';
      for (let d = 7; d >= 1; d--) for (const p of c.planning[d] ?? []) {
        if (!p.start || !p.end) x[`j${d}`] = `${JOUR_NOMS[d - 1].replace(/^./, (y) => y.toUpperCase())} : indique l’heure d’arrivée et de départ.`;
        else if (p.end <= p.start) x[`j${d}`] = `${JOUR_NOMS[d - 1].replace(/^./, (y) => y.toUpperCase())} : l’heure de fin doit être après le début.`;
      }
      if (planningAvecDimanche(c) && c.reposHebdo === undefined) x.reposHebdo = 'Indique ton jour de repos de la semaine.';
    } else {
      const m = manquesPV(c);
      if (m.length) x.pv = `Indique ${m.join(', ')}.`;
    }
    const duree = erreursDureeContrat({ ...c, planning: planningRempli(c.planning) });
    if (duree.length && !Object.keys(x).length) x.duree = duree.join(' ');
  }
  if (e === 'salaire') {
    const rates = ratesAtRegion(today(), regionDe(c)) ?? ratesConnus(today());
    if (!c.rateNet || c.rateNet <= 0) x.rateNet = 'Indique le taux horaire net du contrat.';
    else if (rates.minConvNet !== undefined && c.rateNet < rates.minConvNet) x.rateNet = `Inférieur au minimum conventionnel : ${euros(rates.minConvNet)} net (${euros(rates.minConvBrut)} brut).`;
    if (!r.majorations) x.majorations = 'Indique les majorations du contrat.';
    else if (r.majorations === 'autres') {
      if (c.majoration === undefined || c.majoration < 10) x.majoration = 'Au-delà de 45 h : 10 % au moins.';
      if (c.majorationCompl === undefined) x.majorationCompl = 'Indique la majoration des heures complémentaires (0 si aucune).';
    }
  }
  if (e === 'frais') {
    if (!c.entretienMode) x.entretien = 'Indique si l’indemnité d’entretien est fixée par heure ou par jour.';
    if (c.repasParents === undefined) x.repas = 'Indique qui fournit les repas.';
    else if (!c.repasParents) {
      if (!c.repasPrix) x.repasPrix = 'Indique le prix d’un repas.';
      if (!c.repasParJour) x.repasParJour = 'Indique le nombre de repas par jour.';
    }
    if (!r.km) x.km = 'Indique si des indemnités kilométriques sont prévues.';
    else if (r.km === 'oui' && !c.kmTaux) x.kmTaux = 'Indique le tarif par kilomètre.';
  }
  if (e === 'avant1') {
    if (o.departCalculable && !r.cpManuel) { if (!o.avantComplet) x.depart = 'Réponds aux questions sur tes congés.'; }
    else if (!c.balances.cpSaisi) x.depart = 'Indique tes congés de départ, ou « aucun congé de départ ».';
  }
  if (e === 'avant2') {
    if (r.maladie === undefined) x.maladie = 'Indique le nombre de jours (0 si aucun).';
    else if (r.maladie > 0 && c.balances.maladieDeduitsLongue === undefined) x.maladieLongue = 'Indique d’où venaient ces jours.';
  }
  return x;
}

/** Une ligne de résumé par étape (liste des étapes et récapitulatif) */
export function resumeEtape(n: number, c: Contract, r: ReponsesAssistant): string {
  switch (n) {
    case 1: return c.child ? `${c.child}${c.family ? `, famille ${c.family}` : ''}` : SOUS_TITRES[0];
    case 2: return c.start && c.cdd !== undefined ? `${c.cdd ? 'CDD' : 'CDI'} depuis le ${shortDate(c.start)}${c.accueilOccasionnel ? ', accueil occasionnel' : c.yearType ? `, année ${c.yearType === 'complete' ? 'complète' : 'incomplète'}` : ''}` : SOUS_TITRES[1];
    case 3: return c.accueilOccasionnel ? 'Accueils datés, étape 2' : c.planningVariable ? 'Horaires qui changent' : weeklyMinutes(planningRempli(c.planning)) > 0 ? `${hoursLabel(weeklyMinutes(planningRempli(c.planning)))} par semaine sur ${daysPerWeek(planningRempli(c.planning))} jours` : SOUS_TITRES[2];
    case 4: return c.rateNet ? `${euros(c.rateNet)} net de l’heure` : SOUS_TITRES[3];
    case 5: return c.entretienMode ? `Entretien ${libelleEntretien(c).replace(/ \(.*\)$/, '')}${c.repasParents === undefined ? '' : c.repasParents ? ', repas des parents' : ', repas fournis par toi'}` : SOUS_TITRES[4];
    case 6: return r.maladie !== undefined ? 'Congés et absences repris' : SOUS_TITRES[5];
    default: return '';
  }
}

/** Erreur d'un groupe de champs (jours, horaires, composants partagés) ; `id` la relie aux champs qui la citent. */
function Err({ m, id }: { m?: string; id?: string }) {
  return m ? <p class="err" id={id} role="alert">{m}</p> : null;
}

/** Jours d'accueil puis horaires, vides à l'arrivée (maquettes 07 et 07a) */
function JoursHoraires({ planning, onChange, errs }: { planning: Planning; onChange: (p: Planning) => void; errs: Record<string, string> }) {
  const coches = [1, 2, 3, 4, 5, 6, 7].filter((d) => (planning[d] ?? []).length > 0);
  const setDay = (d: number, ps: Plage[]) => onChange({ ...planning, [d]: ps });
  const nom = (d: number) => JOUR_NOMS[d - 1].replace(/^./, (x) => x.toUpperCase());
  return (
    <div class="stack">
      <div class="field">
        <span class="label" id="jours-l">Jours d’accueil</span>
        <div class="chips" role="group" aria-labelledby="jours-l" aria-describedby={errs.jours ? 'err-jours' : undefined} style={{ flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button type="button" class="chip" aria-pressed={coches.includes(d)} aria-label={nom(d)} onClick={() => setDay(d, coches.includes(d) ? [] : [{ start: '', end: '' }])}>
              {JOUR_NOMS[d - 1].slice(0, 3)}
            </button>
          ))}
        </div>
        <Err m={errs.jours} id="err-jours" />
      </div>
      {coches.length === 0
        ? <p class="hint">Coche les jours : leurs horaires s’ouvrent ici, vides. Une 2e plage par jour est possible.</p>
        : (
          <div class="stack">
            <span class="label">Horaires</span>
            {coches.map((d) => (
              <div class="plan-day">
                <span class="label">{nom(d)}</span>
                {(planning[d] ?? []).map((p, i) => (
                  <div class="plan-range">
                    <input class="input num" type="time" aria-label={`${nom(d)}, arrivée${i ? ' (2e plage)' : ''}`} value={p.start} aria-invalid={errs[`j${d}`] ? 'true' : undefined} aria-describedby={errs[`j${d}`] ? `err-j${d}` : undefined} onInput={(e) => setDay(d, planning[d].map((x, j) => (j === i ? { ...x, start: (e.target as HTMLInputElement).value } : x)))} />
                    <span aria-hidden="true">à</span>
                    <input class="input num" type="time" aria-label={`${nom(d)}, départ${i ? ' (2e plage)' : ''}`} value={p.end} aria-invalid={errs[`j${d}`] ? 'true' : undefined} aria-describedby={errs[`j${d}`] ? `err-j${d}` : undefined} onInput={(e) => setDay(d, planning[d].map((x, j) => (j === i ? { ...x, end: (e.target as HTMLInputElement).value } : x)))} />
                    {i === 1 ? <button type="button" class="icon-btn" aria-label={`Retirer la 2e plage du ${JOUR_NOMS[d - 1]}`} onClick={() => setDay(d, planning[d].slice(0, 1))}><Icon name="x" size={20} /></button> : null}
                  </div>
                ))}
                {(planning[d] ?? []).length < 2 && <button type="button" class="btn btn-ghost" onClick={() => setDay(d, [...planning[d], { start: '', end: '' }])}><Icon name="plus" />2e plage</button>}
                <Err m={errs[`j${d}`]} id={`err-j${d}`} />
              </div>
            ))}
            {coches.length > 1 && (
              <button type="button" class="btn btn-outline" onClick={() => { const pl: Planning = { ...planning }; for (const d of coches.slice(1)) pl[d] = structuredClone(planning[coches[0]]); onChange(pl); }}>
                Copier {JOUR_NOMS[coches[0] - 1]} sur les jours cochés
              </button>
            )}
          </div>
        )}
    </div>
  );
}

export function AjoutEnfant({ id }: { id?: string }) {
  const s = useStore();
  const curMonthStart = debutMoisEnCours();
  const [b, setB] = useState<Brouillon>(() => {
    const ex = id ? lireBrouillon(id) : undefined;
    if (ex) return ex;
    const c = contratVide();
    return { id: c.id, c, r: {}, etape: 1, ecran: 0, faites: [], maj: Date.now() };
  });
  // Reprise d'un contrat pas fini : la liste des étapes d'abord (maquette 03), ce n'est pas un menu.
  const [vue, setVue] = useState<'liste' | 'ecran'>(() => (id && lireBrouillon(id) ? 'liste' : 'ecran'));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [versRecap, setVersRecap] = useState(false);
  const [erreursFinales, setErreursFinales] = useState<string[]>([]);
  const [avantComplet, setAvantComplet] = useState(false);
  const c = b.c, r = b.r;
  const garde = (n: Brouillon) => { setB(n); if (lireBrouillon(n.id) || n.c.child.trim()) enregistrerBrouillon(n); };
  const set = (p: Partial<Contract>) => { setErrs({}); setB((x) => { const n = { ...x, c: { ...x.c, ...p } }; if (lireBrouillon(n.id)) enregistrerBrouillon(n); return n; }); };
  const setR = (p: Partial<ReponsesAssistant>) => { setErrs({}); setB((x) => { const n = { ...x, r: { ...x.r, ...p } }; if (lireBrouillon(n.id)) enregistrerBrouillon(n); return n; }); };
  const total = nbEtapes(c, curMonthStart);
  const reprise = !!c.start && c.start < curMonthStart;
  const wk = weeklyMinutes(planningRempli(c.planning));
  const suiviDepuis = reprise ? curMonthStart : c.start;
  const depart = reprise && wk > 0 && c.yearType ? congesDeDepart({ ...c, planning: planningRempli(c.planning), trackedFrom: suiviDepuis }, suiviDepuis, {}, s.settings.enfantsACharge, s.settings.amMoins21Jusqu) : undefined;
  const departCalculable = !!depart && !depart.aConfirmer;

  const etapeSuivante = (n: number): number => {
    for (let k = n + 1; k <= 6; k++) if (k <= total && ecransEtape(k, c).length) return k;
    return 7;
  };
  const ecrans = ecransEtape(b.etape, c);
  const ecran = ecrans[Math.min(b.ecran, ecrans.length - 1)];

  function continuer() {
    const x = ecran ? erreursEcran(ecran, c, r, { departementProfil: s.settings.departement, departCalculable, avantComplet }) : {};
    setErrs(x);
    if (Object.keys(x).length) { logErreur('contrat_incomplet'); return; }
    let n: Brouillon = b;
    if (ecran === 'enfant' && !s.settings.departement && c.departement) void saveSettings({ departement: c.departement });
    if (b.ecran + 1 < ecrans.length) n = { ...b, ecran: b.ecran + 1 };
    else {
      let faites = [...new Set([...b.faites, b.etape])];
      // Début, type d'année ou planning modifiés depuis le récapitulatif : les congés de départ se recalculent, l'étape 6
      // est refaite (ses réponses dépendent de ces conditions).
      const refaire6 = versRecap && (b.etape === 2 || b.etape === 3) && total === 6;
      if (refaire6) faites = faites.filter((k) => k !== 6);
      n = { ...b, faites, etape: refaire6 ? 6 : versRecap ? 7 : etapeSuivante(b.etape), ecran: 0, ...(refaire6 ? { r: { ...b.r, soldes: undefined, pris: undefined, absent: undefined } } : {}) };
      if (versRecap && !refaire6) setVersRecap(false);
    }
    if (!lireBrouillon(b.id)) logUsage('brouillon_cree', 'ajout');
    garde(n);
    window.scrollTo(0, 0);
  }
  function precedent() {
    setErrs({});
    if (b.ecran > 0) { setB({ ...b, ecran: b.ecran - 1 }); return; }
    for (let k = b.etape - 1; k >= 1; k--) { const e = ecransEtape(k, c); if (e.length) { setB({ ...b, etape: k, ecran: e.length - 1 }); return; } }
  }
  const modifier = (n: number) => { setVersRecap(true); setErreursFinales([]); setB({ ...b, etape: n, ecran: 0 }); setVue('ecran'); window.scrollTo(0, 0); };

  async function creer() {
    const final = contratFinal({ ...c, planning: c.planningVariable || c.accueilOccasionnel ? c.planning : planningRempli(c.planning) }, total === 6 ? r : { ...r, maladie: undefined });
    // Contrat commencé ce mois-ci (pas d'étape 6) : aucune réponse « avant Arvela » gardée d'une saisie précédente.
    if (total === 5) { final.balances = { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }; delete final.cddCpPrisAvantSuivi; }
    const e = erreursContrat(final, true);
    setErreursFinales(e);
    if (e.length) { logErreur('contrat_incomplet'); window.scrollTo(0, 0); return; }
    const toSave = contratAEnregistrer(final, {
      isNew: true, curMonthStart,
      soldesDepart: !r.cpManuel && departCalculable && r.soldes ? r.soldes : undefined,
      partage: undefined,
    });
    await putContract(toSave);
    supprimerBrouillon(b.id);
    logUsage('contrat_cree', 'contrat');
    toast(`Contrat ${de(toSave.child)} créé`, async () => { await deleteContract(toSave.id); });
    location.hash = `#/contrat-cree/${toSave.id}`;
  }

  const titre = c.child.trim() ? `${c.child.trim()}, son contrat` : 'Nouvel enfant accueilli';
  const etatEtape = (n: number) => (b.faites.includes(n) ? 'Fait' : n === b.etape ? 'En cours' : 'À faire');

  if (vue === 'liste' && b.etape <= 7) {
    return (
      <>
        <Topbar title={titre} back="#/plus" screen="ajout" />
        <main>
          <p class="hint">Chaque étape est enregistrée sur ce téléphone : tu reprends où tu t’es arrêtée.</p>
          <div class="list">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
              <ListLink title={`${n}. ${NOMS_ETAPES[n - 1]}`} sub={resumeEtape(n, c, r)} end={<span class="tag">{etatEtape(n)}</span>} />
            ))}
          </div>
          <p class="hint">Les étapes se font dans l’ordre. Récapitulatif avant la création du contrat.</p>
          <button class="btn btn-primary btn-lg btn-block" onClick={() => setVue('ecran')}>{b.etape >= 7 ? 'Reprendre : le récapitulatif' : `Reprendre : ${NOMS_ETAPES[b.etape - 1].replace(/^L[ae’] ?/, (x) => x.toLowerCase())}`}</button>
          <SupprimerBrouillon b={b} ecran="ajout" bloc apres={() => { location.hash = '#/plus'; }} />
        </main>
      </>
    );
  }

  if (b.etape >= 7) return <Recap c={c} r={r} total={total} erreurs={erreursFinales} modifier={modifier} creer={creer} />;

  const rates = ratesAtRegion(today(), regionDe(c)) ?? ratesConnus(today());
  // Rappel au-dessus de « Continuer » : la même erreur, en court (maquette 08 : « un taux d'au moins 3,28 € net »).
  const rappel = Object.entries(errs).map(([k, m]) => (k === 'rateNet' && m.startsWith('Inférieur') && rates.minConvNet !== undefined ? `un taux d’au moins ${euros(rates.minConvNet)} net` : m));
  return (
    <>
      <Topbar title={titre} back="#/plus" screen="ajout" />
      <main>
        <p class="eyebrow">Étape {b.etape} sur {total} · {NOMS_ETAPES[b.etape - 1]}</p>
        {ecran === 'enfant' && (
          <section class="card stack">
            <h2>L’enfant et son employeur</h2>
            <TextInput label="Prénom de l’enfant" value={c.child} onChange={(v) => set({ child: v })} error={errs.child} />
            {familles().length > 0 && (
              <>
                <Choices label="Employeur" value={r.employeur} onChange={(v) => {
                  setR({ employeur: v });
                  // Changer d'employeur change le contact : celui de la famille choisie, ou vide pour un nouvel employeur.
                  if (v === 'nouveau') set({ family: '', parentEmail: undefined, parentTel: undefined });
                  else {
                    const autre = state.contracts.find((k) => k.family.trim() === v && (k.parentEmail || k.parentTel));
                    set({ family: v, parentEmail: autre?.parentEmail, parentTel: autre?.parentTel });
                  }
                }} options={[...familles().map(([f, enfants]) => ({ v: f, l: `Famille ${f}`, sub: `Employeur ${de(enfants.join(', '))}` })), { v: 'nouveau', l: 'Nouvel employeur' }]} error={errs.employeur} />
              </>
            )}
            {(familles().length === 0 || r.employeur === 'nouveau') && (
              <TextInput label="Nom de famille de l’employeur" hint="Tel qu’il figure sur Pajemploi. Regroupe les enfants d’un même employeur." value={c.family} onChange={(v) => set({ family: v })} error={errs.family} />
            )}
            <TextInput label="E-mail du parent employeur (facultatif)" type="email" inputMode="email" value={c.parentEmail ?? ''} onChange={(v) => set({ parentEmail: v || undefined })} error={errs.parentEmail} />
            <TextInput label="Téléphone du parent employeur (facultatif)" type="tel" inputMode="tel" value={c.parentTel ?? ''} onChange={(v) => set({ parentTel: v || undefined })} error={errs.parentTel}
              hint="Gardés avec le contrat, sur ce téléphone et dans ton compte. Jamais sur la page des parents." />
            {!s.settings.departement && (
              <DepartementSaisie value={c.departement} error={errs.departement} hint="Demandé une fois : il est aussi enregistré dans ton profil (Réglages) et repris par les contrats suivants."
                onChange={(d) => set(d ? { departement: d, ...lieuDuDepartement(d) } : { departement: undefined, alsaceMoselle: undefined, mayotte: undefined })} />
            )}
          </section>
        )}

        {ecran === 'contrat' && (
          <section class="card stack">
            <h2>Le contrat</h2>
            <DateInput label="Date de début du contrat" hint="Premier jour d’accueil, même ancien : ancienneté et congés acquis en dépendent." value={c.start} onChange={(v) => set({ start: v })} error={errs.start} />
            <Choices label="Type de contrat" value={c.cdd === undefined ? undefined : c.cdd ? 'cdd' : 'cdi'} onChange={(v) => set({ cdd: v === 'cdd' })}
              options={[{ v: 'cdi', l: 'CDI' }, { v: 'cdd', l: 'CDD', sub: 'Terme, essai et motif ensuite' }]} error={errs.cdd} />
            <Choices label="Accueil" value={c.accueilOccasionnel === undefined ? undefined : c.accueilOccasionnel ? 'occ' : 'reg'}
              onChange={(v) => set(v === 'occ' ? { accueilOccasionnel: true, yearType: 'complete', weeks: 52, planningVariable: false } : { accueilOccasionnel: false, ...(c.accueilOccasionnel ? { yearType: undefined as unknown as Contract['yearType'], planningVariable: undefined } : {}) })}
              options={[{ v: 'reg', l: 'Régulier' }, { v: 'occ', l: 'Occasionnel', sub: 'Art. 97.2 de la convention' }]} error={errs.accueil} />
          </section>
        )}

        {ecran === 'cdd' && (
          <section class="card stack">
            <h2>Le CDD</h2>
            <Choices label="Le CDD a-t-il une date de fin précise ?" value={c.cddTermeImprecis === undefined ? undefined : c.cddTermeImprecis ? 'non' : 'oui'} onChange={(v) => set({ cddTermeImprecis: v === 'non' })}
              options={[{ v: 'oui', l: 'Oui, une date de fin prévue' }, { v: 'non', l: 'Non, jusqu’au retour de la personne remplacée', sub: 'Le contrat donne une durée minimale' }]} error={errs.cddTermeImprecis} />
            {c.cddTermeImprecis !== undefined && <DateInput label={c.cddTermeImprecis ? 'Fin de la durée minimale' : 'Date de fin prévue'} hint={c.cddTermeImprecis ? 'Le dernier jour de la durée minimale écrite au contrat.' : 'Le dernier jour écrit au contrat. Renouvelé : par un avenant.'} value={c.cddTerme ?? ''} min={c.start} onChange={(v) => set({ cddTerme: v || undefined })} error={errs.cddTerme} />}
            <DateInput label="Fin de la période d’essai (facultatif)" hint="Le dernier jour de l’essai écrit au contrat." value={c.cddEssaiFin ?? ''} min={c.start} onChange={(v) => set({ cddEssaiFin: v || undefined })} />
            <Choices label="Pourquoi ce CDD ?" value={c.cddMotif} onChange={(v) => set({ cddMotif: v })}
              options={[{ v: 'remplacement', l: 'Pour remplacer une assistante maternelle absente ou qui part' }, { v: 'autre', l: 'Autre raison' }]} error={errs.cddMotif} />
            {c.cddMotif === 'remplacement' && !c.cddTermeImprecis && (
              <>
                <Choices label="Quel remplacement ?" value={c.cddCasRemplacement} onChange={(v) => set({ cddCasRemplacement: v })} options={[
                  { v: 'absence', l: 'Elle est absente (congé, maladie…)', sub: '18 mois au plus, renouvellements compris.' },
                  { v: 'attente_cdi', l: 'J’attends l’arrivée d’une assistante maternelle embauchée en CDI', sub: '9 mois au plus.' },
                  { v: 'depart_suppression', l: 'Elle part définitivement et son poste ne sera pas repris', sub: '24 mois au plus.' },
                ]} error={errs.cddCasRemplacement} />
              </>
            )}
            {c.cddTerme && c.cddMotif && messagesCdd(c).map((t) => <Banner tone={t.startsWith('Ton salaire') || t.startsWith('Si tu continues') ? 'info' : 'warn'}>{t}</Banner>)}
          </section>
        )}

        {ecran === 'annee' && (
          <section class="card stack">
            <Choices label="Année complète ou incomplète ?" value={c.yearType} onChange={(v) => set({ yearType: v, weeks: v === 'complete' ? 52 : c.weeks > 0 && c.weeks <= 46 ? c.weeks : 0, ...(v === 'complete' ? { weeksOff: [] } : {}) })}
              options={[{ v: 'complete', l: 'Année complète' }, { v: 'incomplete', l: 'Année incomplète' }]} error={errs.yearType} />
            <p class="hint">Comme écrit au contrat.</p>
          </section>
        )}

        {ecran === 'incomplete' && (
          <section class="card stack">
            <h2>Année incomplète</h2>
            <NumberInput label="Semaines d’accueil programmées" hint={c.cdd ? 'Pendant le CDD, sur 12 mois au plus, hors congés payés.' : 'Hors congés payés, 46 au plus.'} value={c.weeks || undefined} min={1} max={46} onChange={(v) => set({ weeks: v ?? 0 })} error={errs.weeks} />
            {c.weeks > 0 && c.weeks <= 46 && c.start && <WeeksOff c={c} onChange={(w) => set({ weeksOff: w })} />}
            <Choices label="Versement des congés payés" value={c.cpMode} onChange={(v) => set({ cpMode: v })}
              options={[{ v: 'juin', l: 'En juin' }, { v: 'principale', l: 'Avec le congé principal' }, { v: 'fur', l: 'Au fur et à mesure' }]} error={errs.cpMode} />
            <p class="hint">Comme écrit au contrat.</p>
          </section>
        )}

        {ecran === 'accueils' && (
          <>
            <h2>Accueils prévus au contrat {de(c.child)}</h2>
            <p class="hint">Dates et horaires écrits au contrat : ils fixent le salaire de chaque accueil.</p>
            <AccueilsOccasionnels c={c} set={set} />
            <Err m={errs.accueils} />
          </>
        )}

        {ecran === 'planning' && (
          <>
            <section class="card stack">
              <h2>Le planning</h2>
              <Choices label="Les horaires sont-ils les mêmes chaque semaine ?" value={c.planningVariable === undefined ? undefined : c.planningVariable ? 'non' : 'oui'} onChange={(v) => set({ planningVariable: v === 'non' })}
                options={[{ v: 'oui', l: 'Identique chaque semaine' }, { v: 'non', l: 'Variable', sub: 'Cycle écrit au contrat (semaines A et B), ou planning remis par les parents' }]} error={errs.planningVariable} />
              {c.planningVariable === false && <JoursHoraires planning={c.planning} onChange={(p) => set({ planning: p })} errs={errs} />}
              {c.planningVariable === false && wk > 0 && (
                <p class="hint" aria-live="polite">
                  <b>{hoursLabel(wk)}</b> par semaine.{c.yearType ? <> Mensualisation : <b>{hoursLabel(Math.round(mensuelMinutes({ ...c, planning: planningRempli(c.planning) })))}</b> et <b>{joursMensualises({ ...c, planning: planningRempli(c.planning) })} jours</b> par mois.</> : null}
                </p>
              )}
              {c.planningVariable === false && [1, 2, 3, 4, 5, 6, 7].map((d) => {
                const ps = planningRempli(c.planning)[d] ?? [];
                const amp = ps.length ? (Number(ps[ps.length - 1].end.slice(0, 2)) * 60 + Number(ps[ps.length - 1].end.slice(3))) - (Number(ps[0].start.slice(0, 2)) * 60 + Number(ps[0].start.slice(3))) : 0;
                return amp > AMPLITUDE_MAX_MIN ? <Banner tone="warn">{JOUR_NOMS[d - 1].replace(/^./, (x) => x.toUpperCase())} : {messageAmplitude(amp)}</Banner> : null;
              })}
              {c.planningVariable === false && planningAvecDimanche(c) && (
                <>
                  <Choices label="Ton jour de repos de la semaine (écrit au contrat)" value={c.reposHebdo === undefined ? undefined : String(c.reposHebdo)} onChange={(v) => set({ reposHebdo: Number(v) })}
                    options={JOUR_NOMS.slice(0, 6).map((l, i) => ({ v: String(i + 1), l }))} error={errs.reposHebdo} />
                </>
              )}
              {(dureeMoyenneContrat({ ...c, planning: planningRempli(c.planning) }) ?? 0) > SEUIL_ACCORD_MIN && (
                <Switch label="J’ai donné mon accord écrit pour plus de 48 h par semaine" hint="Code de l’action sociale et des familles, article L423-22 : sans ton accord, pas plus de 48 h par semaine en moyenne sur quatre mois ; avec, pas plus de 2 250 h par an, tous contrats confondus." checked={!!c.accord48h} onChange={(v) => set({ accord48h: v })} />
              )}
              <Err m={errs.duree} />
            </section>
            {c.planningVariable && <PlanningVariableSaisie c={c} set={set} />}
            <Err m={errs.pv} />
          </>
        )}

        {ecran === 'salaire' && (
          <section class="card stack">
            <h2>Le salaire</h2>
            <EuroInput label="Taux horaire net" allowEmpty cents={c.rateNet} onChange={(v) => set({ rateNet: v as number })}
              hint={rates.minConvNet !== undefined ? `Minimum conventionnel : ${euros(rates.minConvNet)} net (${euros(rates.minConvBrut)} brut).` : `Minimum conventionnel : ${euros(rates.minConvBrut)} brut.`} error={errs.rateNet} />
            {(c.rateNet ?? 0) > 0 && <BrutSaisie net={c.rateNet} brut={c.rateBrut} date={today()} region={regionDe(c)} set={(v) => set({ rateBrut: v })} debut={c.start} />}
            {rates.minConvNet !== undefined && <p class="hint">{TITRE_AM_AP}</p>}
            <Choices label="Majorations" value={r.majorations} onChange={(v) => { setR({ majorations: v }); set(v === 'convention' ? { majoration: 10, majorationCompl: undefined } : { majoration: undefined as unknown as number, majorationCompl: undefined }); }}
              options={[{ v: 'convention', l: 'Celles de la convention', sub: '10 % au-delà de 45 h, aucune sur les heures complémentaires' }, { v: 'autres', l: 'D’autres, écrites au contrat' }]} error={errs.majorations} />
            {r.majorations === 'autres' && (
              <>
                <NumberInput label="Au-delà de 45 h par semaine (%)" hint="10 % au moins." value={c.majoration} min={10} max={100} onChange={(v) => set({ majoration: v as number })} error={errs.majoration} />
                <NumberInput label="Heures complémentaires (%)" hint="0 si le contrat n’en prévoit pas." value={c.majorationCompl} min={0} max={100} onChange={(v) => set({ majorationCompl: v })} error={errs.majorationCompl} />
              </>
            )}
          </section>
        )}

        {ecran === 'frais' && (
          <section class="card stack">
            <h2>Les frais</h2>
            <EntretienSaisie t={c} set={set} />
            <Err m={errs.entretien} />
            <Choices label="Repas" value={c.repasParents === undefined ? undefined : c.repasParents ? 'parents' : 'am'}
              onChange={(v) => set(v === 'parents' ? { repasParents: true, repasPrix: 0, repasParJour: 0 } : { repasParents: false })}
              options={[{ v: 'am', l: 'Fournis par moi', sub: 'Payés au prix du contrat' }, { v: 'parents', l: 'Fournis par les parents' }]} error={errs.repas} />
            {c.repasParents === false && (
              <div class="grid2">
                <div><EuroInput label="Prix d’un repas" allowEmpty cents={c.repasPrix || undefined} onChange={(v) => set({ repasPrix: v ?? 0 })} error={errs.repasPrix} /></div>
                <div><NumberInput label="Repas par jour" value={c.repasParJour || undefined} min={1} max={4} onChange={(v) => set({ repasParJour: v ?? 0 })} error={errs.repasParJour} /></div>
              </div>
            )}
            <Choices label="Indemnités kilométriques" value={r.km} onChange={(v) => { setR({ km: v }); if (v === 'non') set({ kmTaux: 0, kmCv: undefined, kmElectrique: undefined }); }}
              options={[{ v: 'oui', l: 'Prévues', sub: 'Tarif par kilomètre et puissance fiscale ensuite' }, { v: 'non', l: 'Non prévues' }]} error={errs.km} />
            {r.km === 'oui' && (
              <>
                <EuroInput label="Tarif par kilomètre" allowEmpty cents={c.kmTaux || undefined} onChange={(v) => set({ kmTaux: v ?? 0 })} error={errs.kmTaux} />
                <NumberInput label="Puissance fiscale de ta voiture (CV)" hint="Carte grise, case P.6. Sert au contrôle du tarif (article 57 de la convention)." value={c.kmCv} min={1} max={30} onChange={(v) => set({ kmCv: v || undefined })} />
                <Choices label="Ta voiture est-elle électrique ?" value={c.kmElectrique === undefined ? undefined : c.kmElectrique ? 'oui' : 'non'} onChange={(v) => set({ kmElectrique: v === 'oui' })}
                  options={[{ v: 'non', l: 'Non' }, { v: 'oui', l: 'Oui, électrique', sub: 'Barème fiscal majoré de 20 %.' }]} />
              </>
            )}
            <Choices label="Pajemploi+" value={r.pajemploi} onChange={(v) => setR({ pajemploi: v })}
              options={[{ v: 'oui', l: 'Adhérents' }, { v: 'non', l: 'Non adhérents' }, { v: 'nr', l: 'Non renseigné' }]} />
            <p class="hint">{PAJEMPLOI_PLUS_AIDE}</p>
          </section>
        )}

        {ecran === 'avant1' && (
          <section class="card stack">
            <h2>Congés au début du suivi</h2>
            <p class="hint">Arvela suit le contrat à partir du {shortDate(curMonthStart)}.</p>
            {departCalculable && !r.cpManuel ? (
              <>
                <CongesDepart c={{ ...c, planning: planningRempli(c.planning), trackedFrom: suiviDepuis }} mode="formulaire" reponses={r}
                  onSoldes={(x) => { if (x.cpRestants !== r.soldes?.cpRestants || x.cpEnCours !== r.soldes?.cpEnCours) setR({ soldes: { cpRestants: x.cpRestants, cpEnCours: x.cpEnCours } }); }}
                  onReponses={(x, ok) => { setAvantComplet(ok); if (JSON.stringify([x.pris, x.absent, x.absPrec, x.absCours]) !== JSON.stringify([r.pris, r.absent, r.absPrec, r.absCours])) setR(x); }} />
                <button type="button" class="btn btn-ghost" onClick={() => { if (r.soldes) set({ balances: { ...c.balances, ...r.soldes, cpSaisi: true } }); setR({ cpManuel: true }); }}>Ces chiffres sont faux : les saisir moi-même</button>
              </>
            ) : (
              <>
                {depart?.aConfirmer && <p class="hint">{depart.aConfirmer}</p>}
                <NumberInput label="Congés restants de l’an dernier (jours ouvrables)" hint="Acquis avant le dernier 1er juin et pas encore pris" value={c.balances.cpSaisi ? c.balances.cpRestants : undefined} step={0.5} max={60} onChange={(v) => set({ balances: { ...c.balances, cpRestants: v ?? 0, cpSaisi: true } })} />
                <NumberInput label="Congés en cours d’acquisition (jours ouvrables)" hint="Acquis depuis le 1er juin, avant le suivi par Arvela" value={c.balances.cpSaisi ? c.balances.cpEnCours : undefined} step={0.5} max={30} onChange={(v) => set({ balances: { ...c.balances, cpEnCours: v ?? 0, cpSaisi: true } })} />
                {soldeCongesInconnu(c) && (
                  <>
                    <p class="hint">{MESSAGE_SOLDE_CONGES}</p>
                    <button type="button" class="btn btn-outline" onClick={() => set({ balances: { ...c.balances, cpSaisi: true } })}>Je n’ai aucun congé de départ</button>
                  </>
                )}
                {departCalculable && <button type="button" class="btn btn-ghost" onClick={() => setR({ cpManuel: false })}>Revenir au calcul d’Arvela</button>}
              </>
            )}
            <Err m={errs.depart} />
          </section>
        )}

        {ecran === 'avant2' && (
          <section class="card stack">
            <h2>Absences déjà retenues</h2>
            <NumberInput label={`Jours ${de(c.child)} malade, avec certificat, déjà retenus sur ton salaire`} hint="Depuis le début de l’année de contrat en cours. 0 si aucun." value={r.maladie} max={14} onChange={(v) => { setR({ maladie: v }); set({ balances: { ...c.balances, maladieDeduits: v ?? 0, ...(v ? {} : { maladieDeduitsLongue: undefined }) } }); }} error={errs.maladie} />
            {(r.maladie ?? 0) > 0 && (
              <>
                <Choices label="Ces jours venaient de :" value={c.balances.maladieDeduitsLongue === undefined ? undefined : c.balances.maladieDeduitsLongue ? 'longue' : 'courtes'}
                  onChange={(v) => set({ balances: { ...c.balances, maladieDeduitsLongue: v === 'longue' } })}
                  options={[{ v: 'courtes', l: 'Absences courtes', sub: 'Chacune de moins de 14 jours calendaires (5 jours retenus au plus).' }, { v: 'longue', l: 'Une absence de 14 jours calendaires ou plus', sub: 'Article 105 de la convention : comptée à part des 5 jours.' }]} error={errs.maladieLongue} />
              </>
            )}
            {c.cdd && <NumberInput label="Jours de congés payés pris pendant le CDD avant le suivi" hint="Jours ouvrables. 0 si aucun. Sert au minimum de tes congés de fin de CDD (code du travail, article L1242-16)." value={c.cddCpPrisAvantSuivi} step={1} max={60} onChange={(v) => set({ cddCpPrisAvantSuivi: v })} />}
            <p class="hint">Bulletins d’avant Arvela : facultatifs, plus tard, depuis la fiche de l’enfant.</p>
          </section>
        )}

        {rappel.length > 0 && <p class="err" role="status">Pour continuer : {rappel.map((m) => m.replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase())).join(' ; ')}.</p>}
        <button class="btn btn-primary btn-lg btn-block" onClick={continuer}>{etapeSuivante(b.etape) === 7 && b.ecran + 1 >= ecrans.length ? 'Relire avant de créer' : 'Continuer'}</button>
        {(b.etape > 1 || b.ecran > 0) && <button class="btn btn-ghost btn-block" onClick={precedent}><Icon name="left" />Écran précédent</button>}
      </main>
    </>
  );
}

const nbj = (x: number) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} jour${x > 1 ? 's' : ''}`;

function Bloc({ n, titre, modifier, children }: { n: number; titre: string; modifier: (n: number) => void; children: ComponentChildren }) {
  return (
    <section class="card stack-sm" aria-label={titre}>
      <div class="spread"><h2>{titre}</h2><button type="button" class="btn btn-ghost" aria-label={`Modifier : ${titre}`} onClick={() => modifier(n)}>Modifier</button></div>
      <dl class="kv kv-recap">{children}</dl>
    </section>
  );
}

function libellePlanning(pl: Planning): ComponentChildren[] {
  const fmt = (p: Plage) => `${p.start.replace(':', ' h ').replace(' h 00', ' h')} – ${p.end.replace(':', ' h ').replace(' h 00', ' h')}`;
  return [1, 2, 3, 4, 5, 6, 7].filter((d) => (pl[d] ?? []).length).map((d) => <><dt>{JOUR_NOMS[d - 1].replace(/^./, (x) => x.toUpperCase())}</dt><dd>{pl[d].map(fmt).join(', ')}</dd></>);
}

/** Récapitulatif (maquette 11) : chaque bloc avec « Modifier », mensualisation calculée par le moteur. */
function Recap({ c, r, total, erreurs, modifier, creer }: { c: Contract; r: ReponsesAssistant; total: number; erreurs: string[]; modifier: (n: number) => void; creer: () => void }) {
  const f = contratFinal({ ...c, planning: c.planningVariable || c.accueilOccasionnel ? c.planning : planningRempli(c.planning) }, r);
  const mensualise = !f.accueilOccasionnel && f.yearType;
  return (
    <>
      <Topbar title={`Récapitulatif · ${c.child}`} back="#/plus" screen="ajout" />
      <main>
        {erreurs.length > 0 && <Banner tone="warn"><strong>À compléter avant de créer le contrat</strong><ul>{erreurs.map((e) => <li>{e}</li>)}</ul></Banner>}
        {mensualise && <p>Mensualisation : <b>{hoursLabel(Math.round(mensuelMinutes(f)))}</b>, <b>{joursMensualises(f)} jours</b>, <b>{euros(salaireMensualise(f))}</b> net de salaire de base (hors indemnités et absences).</p>}
        <Bloc n={1} titre={NOMS_ETAPES[0]} modifier={modifier}>
          <dt>Enfant</dt><dd>{c.child}</dd>
          <dt>Employeur</dt><dd>famille {c.family}</dd>
          <dt>Contact</dt><dd>{[c.parentEmail, c.parentTel].filter(Boolean).join(', ') || 'non donné'}</dd>
          <dt>Département</dt><dd>{c.departement ? libelleDepartement(c.departement) : 'à indiquer'}</dd>
        </Bloc>
        <Bloc n={2} titre={NOMS_ETAPES[1]} modifier={modifier}>
          <dt>Début</dt><dd>{c.start ? shortDate(c.start) : 'à indiquer'}</dd>
          <dt>Type</dt><dd>{c.cdd === undefined ? 'à indiquer' : c.cdd ? 'CDD' : 'CDI'}, accueil {c.accueilOccasionnel ? 'occasionnel' : 'régulier'}</dd>
          {c.cdd && c.cddTerme && <><dt>{c.cddTermeImprecis ? 'Durée minimale' : 'Fin prévue'}</dt><dd>{shortDate(c.cddTerme)}</dd></>}
          {!c.accueilOccasionnel && <><dt>Année</dt><dd>{c.yearType === 'complete' ? 'complète' : c.yearType === 'incomplete' ? `incomplète, ${c.weeks} semaines` : 'à indiquer'}</dd></>}
          {c.yearType === 'incomplete' && <><dt>Semaines sans accueil</dt><dd>{c.weeksOff.length} saisie{c.weeksOff.length > 1 ? 's' : ''}</dd></>}
          {c.accueilOccasionnel && <><dt>Accueils</dt><dd>{(c.accueils ?? []).map((a) => `du ${shortDate(a.du)} au ${shortDate(a.au)}`).join(' ; ')}</dd></>}
        </Bloc>
        {!c.accueilOccasionnel && (
          <Bloc n={3} titre={NOMS_ETAPES[2]} modifier={modifier}>
            {c.planningVariable ? <><dt>Horaires</dt><dd>variables</dd></> : libellePlanning(planningRempli(c.planning))}
            {!c.planningVariable && <><dt>Par semaine</dt><dd>{hoursLabel(weeklyMinutes(planningRempli(c.planning)))}</dd></>}
          </Bloc>
        )}
        <Bloc n={4} titre={NOMS_ETAPES[3]} modifier={modifier}>
          <dt>Taux horaire</dt><dd>{c.rateNet ? `${euros(c.rateNet)} net` : 'à indiquer'}</dd>
          <dt>Majorations</dt><dd>{f.majoration} % au-delà de 45 h ; {f.majorationCompl ?? 0} % heures complémentaires</dd>
        </Bloc>
        <Bloc n={5} titre={NOMS_ETAPES[4]} modifier={modifier}>
          <dt>Entretien</dt><dd>{c.entretienMode === 'jour' ? 'par jour' : c.entretienMode === 'heure' ? 'par heure' : 'à indiquer'}, {libelleEntretien(c)}</dd>
          <dt>Repas</dt><dd>{c.repasParents === undefined ? 'à indiquer' : c.repasParents ? 'fournis par les parents' : `fournis par toi, ${euros(c.repasPrix)} × ${c.repasParJour} par jour`}</dd>
          <dt>Kilomètres</dt><dd>{r.km === 'oui' ? `${euros(c.kmTaux)} par km` : 'non prévus'}</dd>
          <dt>Pajemploi+</dt><dd>{r.pajemploi === 'oui' ? 'adhérents' : r.pajemploi === 'non' ? 'non adhérents' : 'non renseigné'}</dd>
        </Bloc>
        {total === 6 && (
          <Bloc n={6} titre={NOMS_ETAPES[5]} modifier={modifier}>
            {r.pris !== undefined && <><dt>Congés pris depuis le 1er juin</dt><dd>{r.pris} jour{r.pris > 1 ? 's' : ''} ouvrable{r.pris > 1 ? 's' : ''}</dd></>}
            {r.soldes && !r.cpManuel && <><dt>Reste à prendre</dt><dd>{nbj(r.soldes.cpRestants)}</dd><dt>En cours d’acquisition</dt><dd>{nbj(r.soldes.cpEnCours)}</dd></>}
            {r.cpManuel !== false && c.balances.cpSaisi && (r.cpManuel || !r.soldes) && <><dt>Congés saisis</dt><dd>{nbj(c.balances.cpRestants)} restants, {nbj(c.balances.cpEnCours)} en cours</dd></>}
            <dt>Absence non rémunérée</dt><dd>{r.absent === 'oui' ? 'oui' : r.absent === 'non' ? 'non' : '—'}</dd>
            <dt>Jours d’enfant malade retenus</dt><dd>{r.maladie ?? 0}</dd>
          </Bloc>
        )}
        <button class="btn btn-primary btn-lg btn-block" onClick={creer}>Créer le contrat {de(c.child)}</button>
        <p class="hint">Jusqu’à sa création, le contrat en cours de saisie reste sur ce téléphone seulement.</p>
      </main>
    </>
  );
}
