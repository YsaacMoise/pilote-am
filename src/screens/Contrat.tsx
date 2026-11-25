import { useEffect, useState } from 'preact/hooks';
import { deleteContract, logErreur, logUsage, putContract, state, toast, uid, useStore } from '../store';
import { addMonthsToDate, deMois, firstDay, mondayOf, monthOf, shortDate, today, JOUR_NOMS, type Month } from '../engine/dates';
import { dureeMoyenneContrat, erreursDureeContrat, SEUIL_ACCORD_MIN } from '../engine/durees';
import { daysPerWeek, joursMensualises, mensuelMinutes, salaireMensualise, semainesSansAccueilAnnee, termsAt, weeklyMinutes } from '../engine/payroll';
import { entretienPlancher, minimumSansTitre, ratesAtRegion, ratesConnus, repasAvantageAu } from '../engine/rates';
import { regionDe } from '../engine/regions';
import { soldesDeDepart } from '../engine/conges';
import { euros, eurosTexte, hoursLabel } from '../engine/money';
import type { AccueilOcc, Avenant, Contract, Plage, Planning, Terms } from '../engine/model';
import { manquesOccasionnel } from '../engine/occasionnel';
import { EntretienSaisie, libelleEntretien } from './EntretienSaisie';
import { Banner, CHILD_COLORS, Choices, COLOR_NAMES, couleurLibre, couleursPrises, DateInput, EuroInput, Gommette, NumberInput, Seg, Switch, TextInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { BROUILLON_CONTRAT } from './Simulateur';
import { PartageCard } from './PartageCard';
import { de } from '../engine/texte';
import { PAJEMPLOI_PLUS_AIDE } from '../legal';
import { MESSAGE_REPOS_HEBDO, NON_GERE_47_51, nonGeresContrat, planningAvecDimanche, semaines4751 } from '../engine/nonGeres';
import { DEPARTEMENTS, libelleDepartement, reponseSaisie, trouverDepartement } from '../engine/departements';
import { AIDE_ANNEE, AIDE_COMPLEMENTAIRES, AIDE_SEMAINES } from './textes-contrat';
import { manquesPV } from '../engine/planningVariable';
import { PlanningVariableSaisie } from './PlanningVariableSaisie';
import { CDD_A_COMPLETER, messagesCdd } from '../engine/cdd';

const ouiNon = (b: boolean | undefined): 'oui' | 'non' | undefined => (b === undefined ? undefined : b ? 'oui' : 'non');

/** Contrat qui vient d'être créé : sa page s'ouvre sur la carte du lien parent */
let montrerLienDe: string | undefined;

/** Conditions venues du simulateur (lues une seule fois) : son planning, ou des journées égales à partir de 8 h (anciennes versions). */
function brouillon(): Partial<Contract> | null {
  try {
    const raw = sessionStorage.getItem(BROUILLON_CONTRAT);
    if (!raw) return null;
    sessionStorage.removeItem(BROUILLON_CONTRAT);
    const b = JSON.parse(raw);
    let pl: Planning = {};
    if (b.planning && typeof b.planning === 'object') {
      for (let d = 1; d <= 7; d++) {
        const ps = Array.isArray(b.planning[d]) ? b.planning[d] : [];
        pl[d] = ps.filter((p: any) => typeof p?.start === 'string' && typeof p?.end === 'string').slice(0, 2).map((p: any) => ({ start: p.start, end: p.end }));
      }
    } else {
      const n = Math.max(1, Math.min(6, Math.round(b.jours)));
      const min = Math.round((b.heures * 60) / n);
      const fin = 8 * 60 + min;
      pl = {};
      for (let d = 1; d <= n; d++) pl[d] = [{ start: '08:00', end: `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}` }];
    }
    return { planning: pl, yearType: b.yearType, weeks: b.weeks, majoration: b.majoration, rateNet: b.rateNet, entretienJour: b.entretienJour, entretienHeure: b.entretienHeure ?? 0, ...(b.entretienMode === 'heure' || b.entretienMode === 'jour' ? { entretienMode: b.entretienMode } : {}), repasPrix: b.repasPrix, repasParJour: b.repasParJour, kmTaux: b.kmTaux ?? 0 };
  } catch { return null; }
}

function blank(): Contract {
  const t = today();
  const pl: Planning = {};
  for (let d = 1; d <= 5; d++) pl[d] = [{ start: '08:30', end: '17:30' }];
  return {
    id: uid(), child: '', family: '', color: couleurLibre(couleursPrises(state.contracts, '', t)), start: t, yearType: 'complete', weeks: 52,
    weeksOff: [], planning: pl, rateNet: ratesConnus(t).minConvNet ?? 0, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: t, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
    history: [], createdAt: Date.now(),
    ...(brouillon() ?? {}),
  };
}

export function Contrat({ id }: { id?: string }) {
  useStore();
  const existing = id ? state.contracts.find((c) => c.id === id) : undefined;
  const [c, setC] = useState<Contract>(() => (existing ? structuredClone(existing) : blank()));
  const [errors, setErrors] = useState<string[]>([]);
  const set = (p: Partial<Contract>) => setC({ ...c, ...p });
  // Couleurs des autres enfants en cours de contrat : une couleur = un enfant
  const prises = couleursPrises(state.contracts, c.id, today());
  const isNew = !existing;
  const curMonthStart = firstDay(monthOf(today()));
  const reprise = c.start < curMonthStart;
  const wk = weeklyMinutes(c.planning);
  // T-077 (R2) : repère net du minimum et texte du titre AM-GE de la région choisie.
  const rates = ratesAtRegion(today(), regionDe(c)) ?? ratesConnus(today());
  const MINIMUM_SANS_TITRE = minimumSansTitre(regionDe(c));
  useEffect(() => {
    if (!existing || montrerLienDe !== existing.id) return;
    montrerLienDe = undefined;
    requestAnimationFrame(() => document.getElementById('partage-t')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [existing?.id]);
  // Saisie simplifiée des congés à la reprise : seulement les jours déjà pris depuis le 1er juin (nouveaux contrats).
  const [cpManuel, setCpManuel] = useState(!isNew);
  const [prisDepuisJuin, setPris] = useState(0);
  const suiviDepuis = isNew ? (reprise ? curMonthStart : c.start) : c.trackedFrom;
  const soldes = c.start && suiviDepuis > c.start && wk > 0 ? soldesDeDepart(c, suiviDepuis, prisDepuisJuin, state.settings.enfantsACharge, state.settings.amMoins21Jusqu) : undefined;
  // T-019 : année incomplète, l'app ne propose pas de soldes calculés (méthode d'acquisition non tranchée, SUS-11).
  const soldesProposes = soldes && !soldes.aConfirmer ? soldes : undefined;

  function setDay(d: number, plages: Plage[]) {
    set({ planning: { ...c.planning, [d]: plages } });
  }

  async function save() {
    const errs: string[] = [];
    if (!c.child.trim()) errs.push('Indique le prénom de l’enfant.');
    if (!c.start) errs.push('Indique la date de début du contrat.');
    if (!c.planningVariable && !c.accueilOccasionnel && wk <= 0) errs.push('Le planning est vide : ajoute au moins un jour d’accueil.');
    // T-104 (cas 2) : accueil occasionnel, périodes d'accueil (dates et horaires prévus au contrat, CCN 98.2).
    for (const m of manquesOccasionnel(c)) errs.push(`Accueil occasionnel : indique ${m}.`);
    if (c.accueilOccasionnel) for (const a of c.accueils ?? []) for (let d = 1; d <= 7; d++) for (const p of a.planning[d] ?? []) if (p.end <= p.start) errs.push(`${JOUR_NOMS[d - 1]} (accueil du ${shortDate(a.du)}) : l’heure de fin doit être après le début.`);
    for (let d = 1; d <= 7; d++) for (const p of c.planning[d] ?? []) if (p.end <= p.start) errs.push(`${JOUR_NOMS[d - 1]} : l’heure de fin doit être après le début.`);
    if (semaines4751(c.yearType, c.weeks)) errs.push(NON_GERE_47_51);
    else if (c.yearType === 'incomplete' && (c.weeks < 1 || c.weeks > 46)) errs.push('En année incomplète, le nombre de semaines va de 1 à 46.');
    // Audit C-002 : les semaines sans accueil manquantes sont signalées dans le formulaire (bandeau) sans bloquer,
    // car elles peuvent être communiquées plus tard, par écrit, deux mois à l'avance (art. 98.1.2) ;
    // la régularisation n'est pas calculée tant qu'une année terminée en manque.
    if (c.end && c.end < c.start) errs.push('La date de fin est avant le début.');
    if (c.repasParents === undefined) errs.push('Indique qui fournit les repas de l’enfant.');
    if (c.alsaceMoselle === undefined) errs.push('Indique le département où tu accueilles l’enfant.');
    if (c.planningVariable === undefined) errs.push('Indique si le planning est le même chaque semaine.');
    // T-076 : horaires qui changent, données à compléter (cycle, semaine de départ, heures payées chaque mois).
    for (const m of manquesPV(c)) errs.push(`Horaires qui changent : indique ${m}.`);
    if (c.planningVariable) for (const pl of [...(c.cycle ?? []), ...Object.values(c.planningsSemaines ?? {})]) for (let d = 1; d <= 7; d++) for (const p of pl[d] ?? []) if (p.end <= p.start) errs.push(`${JOUR_NOMS[d - 1]} : l’heure de fin doit être après le début.`);
    if (c.accueilOccasionnel === undefined) errs.push('Indique si l’accueil est régulier ou occasionnel.');
    if (c.cdd === undefined) errs.push('Indique si le contrat est un CDI ou un CDD.');
    // T-076 : le CDD est calculé ; sa date de fin prévue (ou de durée minimale) et son motif sont demandés.
    if (c.cdd && !c.cddTerme) errs.push(c.cddTermeImprecis ? 'Indique la date de fin de la durée minimale du CDD.' : 'Indique la date de fin prévue du CDD.');
    if (c.cdd && c.cddTerme && c.cddTerme < c.start) errs.push('La date de fin prévue du CDD est avant le début.');
    if (c.cdd && !c.cddMotif) errs.push('Indique pourquoi le CDD a été signé.');
    // T-109 (correction 9) : CASF L423-22, plus de 48 h par semaine en moyenne sans l'accord de l'AM, ou plus de 2 250 h par an.
    errs.push(...erreursDureeContrat(c));
    // T-044b : choix explicite du mode de l'indemnité d'entretien sur un nouveau contrat.
    if (isNew && !c.entretienMode) errs.push('Indique si l’indemnité d’entretien est fixée par heure ou par jour.');
    setErrors(errs);
    // C-101 : chaque enregistrement refusé est noté (relecture contradictoire : le deuxième refus passait inaperçu).
    if (errs.length) logErreur('contrat_incomplet');
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const toSave: Contract = {
      ...c,
      balances: !cpManuel && soldesProposes ? { ...c.balances, cpRestants: soldesProposes.cpRestants, cpEnCours: soldesProposes.cpEnCours } : c.balances,
      child: c.child.trim(),
      family: c.family.trim(),
      weeks: c.yearType === 'complete' ? 52 : c.weeks,
      trackedFrom: isNew ? (reprise ? curMonthStart : c.start) : c.trackedFrom < c.start ? c.start : c.trackedFrom,
      // Le lien parent a pu être créé ou coupé pendant que le formulaire était ouvert : on garde l'état enregistré.
      partage: state.contracts.find((x) => x.id === c.id)?.partage,
    };
    if (!toSave.partage) delete toSave.partage;
    const prev = await putContract(toSave);
    logUsage(isNew ? 'contrat_cree' : 'contrat_modifie', 'contrat');
    toast(isNew ? `Contrat ${de(toSave.child)} créé` : 'Contrat enregistré', prev ? async () => { await putContract(prev); } : async () => { await deleteContract(toSave.id); });
    if (isNew && reprise) location.hash = `#/historique/${toSave.id}`;
    else if (isNew) {
      // Juste après la création, la page du contrat s'ouvre sur « Lien pour les parents » : c'est le moment de l'envoyer.
      montrerLienDe = toSave.id;
      location.hash = `#/contrat/${toSave.id}`;
    } else location.hash = '#/plus';
  }

  return (
    <>
      <Topbar title={isNew ? 'Nouvel enfant accueilli' : c.child || 'Contrat'} back="#/plus" screen="contrat" />
      <main>
        {errors.length > 0 && (
          <Banner tone="warn">
            <strong>À compléter</strong>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>{errors.map((e) => <li>{e}</li>)}</ul>
          </Banner>
        )}
        <section class="card">
          <fieldset>
            <legend>L’enfant accueilli</legend>
            <TextInput label="Prénom de l’enfant" value={c.child} onChange={(v) => set({ child: v })} autoComplete="off" />
            <TextInput label="Nom de la famille" hint="Celui du parent qui t’emploie et te déclare sur Pajemploi" value={c.family} onChange={(v) => set({ family: v })} />
            <div class="field">
              <span class="label" id="col-l">Sa couleur</span>
              <div class="couleurs" role="radiogroup" aria-labelledby="col-l">
                {CHILD_COLORS.map((_, i) => {
                  // Toutes prises (plus de 8 enfants en cours) : on laisse choisir librement.
                  const par = prises.size < CHILD_COLORS.length ? prises.get(i) : undefined;
                  return (
                    <button class="couleur" role="radio" aria-checked={c.color === i} disabled={!!par && c.color !== i} onClick={() => set({ color: i })} aria-label={par ? `${COLOR_NAMES[i]}, déjà prise par ${par}` : COLOR_NAMES[i]}>
                      <Gommette name={par ?? (c.child || '?')} color={i} />
                    </button>
                  );
                })}
              </div>
              <span class="hint">
                <b>{COLOR_NAMES[c.color % CHILD_COLORS.length]}</b>
                {prises.size > 0 && prises.size < CHILD_COLORS.length && ` · grisées : déjà prises par ${[...new Set(prises.values())].join(', ')}`}
              </span>
              {prises.get(c.color % CHILD_COLORS.length) && prises.size < CHILD_COLORS.length && (
                <span class="hint warn">Même couleur que {prises.get(c.color % CHILD_COLORS.length)} : choisis-en une libre pour les distinguer d’un coup d’œil.</span>
              )}
            </div>
          </fieldset>
        </section>

        <section class="card">
          <fieldset>
            <legend>Le contrat</legend>
            <DateInput label="Premier jour d’accueil" hint="Le vrai premier jour, même s’il remonte à plusieurs années" value={c.start} onChange={(v) => set({ start: v })} />
            {!isNew && <DateInput label="Date de fin du contrat" hint="Seulement si le contrat est terminé. Mieux : passe par l’écran Fin de contrat, qui note aussi la lettre et le préavis ; sans eux, les derniers mois ne sont pas calculés." value={c.end ?? ''} onChange={(v) => set({ end: v || undefined })} />}
            {/* T-104 (cas 2) : l'accueil occasionnel n'est pas mensualisé (CCN 108.2) : pas d'année complète ou incomplète. */}
            {!c.accueilOccasionnel && <Seg label="Année complète ou incomplète ?" value={c.yearType} onChange={(v) => set({ yearType: v, weeks: v === 'complete' ? 52 : Math.min(c.weeks, 46) || 46 })}
              options={[{ v: 'complete', l: 'Année complète' }, { v: 'incomplete', l: 'Année incomplète' }]} />}
            {!c.accueilOccasionnel && <p class="hint">{AIDE_ANNEE}</p>}
            {!c.accueilOccasionnel && c.yearType === 'incomplete' && (
              <>
                <NumberInput label="Semaines d’accueil prévues au contrat" hint={c.cdd ? 'Pour un CDD : les semaines d’accueil prévues pendant le CDD, sur 12 mois au plus, sans compter tes congés payés' : AIDE_SEMAINES} value={c.weeks} min={1} max={51} onChange={(v) => set({ weeks: v ?? 46 })} />
                {semaines4751(c.yearType, c.weeks) && <><Banner tone="warn">{NON_GERE_47_51}</Banner><button class="btn btn-secondary" onClick={() => set({ yearType: 'complete', weeks: 52, weeksOff: [] })}>Passer en année complète (52 semaines)</button></>}
                <WeeksOff c={c} onChange={(w) => set({ weeksOff: w })} />
              </>
            )}
            {/* T-031 : cas que l'app ne gère pas. Une réponse est demandée : sans elle, l'app ne sait pas si ses montants valent. */}
            <ChoixDepartement c={c} set={set} />
            {!c.accueilOccasionnel && <Choices label="Le planning est-il le même chaque semaine ?" value={ouiNon(c.planningVariable === undefined ? undefined : !c.planningVariable)} onChange={(v) => set({ planningVariable: v === 'non' })}
              options={[{ v: 'oui', l: 'Oui, une semaine type qui se répète', sub: 'Les semaines sans accueil prévues au contrat ne comptent pas.' }, { v: 'non', l: 'Non, il change d’une semaine à l’autre', sub: 'Semaines A et B, ou planning remis par les parents.' }]} />}
            <Choices label="L’accueil est-il régulier ou occasionnel ?" value={ouiNon(c.accueilOccasionnel === undefined ? undefined : !c.accueilOccasionnel)} onChange={(v) => set(v === 'non' ? { accueilOccasionnel: true, yearType: 'complete', weeks: 52, planningVariable: false } : { accueilOccasionnel: false })}
              options={[{ v: 'oui', l: 'Régulier', sub: 'L’enfant vient selon le planning du contrat.' }, { v: 'non', l: 'Occasionnel', sub: 'Accueil court, sans rythme régulier (article 97.2 de la convention). Tu es payée pour tes heures d’accueil, et tes congés à la fin de chaque accueil.' }]} />
            <Choices label="CDI ou CDD ?" value={ouiNon(c.cdd)} onChange={(v) => set({ cdd: v === 'oui' })}
              options={[{ v: 'non', l: 'CDI', sub: 'Contrat à durée indéterminée : aucune date de fin n’est prévue.' }, { v: 'oui', l: 'CDD', sub: 'Contrat à durée déterminée : il finit à une date prévue au contrat, ou au retour de la personne remplacée.' }]} />
            {/* T-076 : le CDD est calculé (regles/t076-cdd.md, partie 5.1 : terme et motif). */}
            {c.cdd && (
              <>
                <Choices label="Le CDD a-t-il une date de fin précise ?" value={c.cddTermeImprecis === undefined ? (c.cddTerme ? 'oui' : undefined) : c.cddTermeImprecis ? 'non' : 'oui'} onChange={(v) => set({ cddTermeImprecis: v === 'non' })}
                  options={[{ v: 'oui', l: 'Oui, une date de fin prévue' }, { v: 'non', l: 'Non, jusqu’au retour de la personne remplacée', sub: 'Le contrat donne alors une durée minimale' }]} />
                <DateInput label={c.cddTermeImprecis ? 'Fin de la durée minimale' : 'Date de fin prévue'} hint={c.cddTermeImprecis ? 'Le dernier jour de la durée minimale écrite dans le contrat.' : 'Le dernier jour prévu dans le contrat. Si le CDD est renouvelé, mets la nouvelle date.'} value={c.cddTerme ?? ''} min={c.start} onChange={(v) => set({ cddTerme: v || undefined })} />
                {/* T-103 (D10) : CCN 41.1, la durée de l'essai est écrite au contrat. */}
                <DateInput label="Fin de la période d’essai" hint="Le dernier jour de l’essai écrit dans le contrat. Laisse vide s’il n’y en a pas." value={c.cddEssaiFin ?? ''} min={c.start} onChange={(v) => set({ cddEssaiFin: v || undefined })} />
                <Choices label="Pourquoi ce CDD ?" value={c.cddMotif} onChange={(v) => set({ cddMotif: v })}
                  options={[{ v: 'remplacement', l: 'Pour remplacer une assistante maternelle absente' }, { v: 'autre', l: 'Autre raison' }]} />
                {messagesCdd(c).map((t) => <Banner tone={t.startsWith('Ton salaire') || t.startsWith('Si tu continues') ? 'info' : 'warn'}>{t}</Banner>)}
              </>
            )}
            {/* T-103 (C8) : CCN 46, le repos hebdomadaire est « prévu par le contrat de travail ». Demandé si le dimanche est travaillé. */}
            {planningAvecDimanche(c) && (
              <Choices label="Ton jour de repos de la semaine (écrit au contrat)" value={c.reposHebdo === undefined ? undefined : String(c.reposHebdo)} onChange={(v) => set({ reposHebdo: Number(v) })}
                options={JOUR_NOMS.slice(0, 6).map((l, i) => ({ v: String(i + 1), l }))} />
            )}
            {nonGeresContrat(c).filter((t) => t !== CDD_A_COMPLETER && t !== MESSAGE_REPOS_HEBDO).map((t) => <Banner tone="warn">{t}</Banner>)}
          </fieldset>
        </section>

        {c.planningVariable && !c.accueilOccasionnel && <PlanningVariableSaisie c={c} set={set} />}

        {c.accueilOccasionnel && <AccueilsOccasionnels c={c} set={set} />}

        {!c.planningVariable && !c.accueilOccasionnel && <section class="card">
          <fieldset>
            <legend>Le planning type</legend>
            <p class="hint">Les journées se remplissent toutes seules avec ce planning. Tu ne noteras que les changements.</p>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <PlanDay d={d} plages={c.planning[d] ?? []} onChange={(p) => setDay(d, p)} onCopy={d === 1 ? () => { const pl: Planning = { ...c.planning }; for (let x = 2; x <= 5; x++) pl[x] = structuredClone(c.planning[1] ?? []); set({ planning: pl }); } : undefined} />)}
            <div class="banner info" style={{ marginTop: '4px' }}>
              <span class="b-ico"><Icon name="clock" /></span>
              <div class="b-body">
                <span><b>{hoursLabel(wk)}</b> par semaine sur {daysPerWeek(c.planning)} jours</span>
                <span>Soit <b>{hoursLabel(Math.round(mensuelMinutes(c)))}</b> et <b>{joursMensualises(c)} jours</b> par mois, pour <b>{euros(salaireMensualise(c))}</b> net.</span>
              </div>
            </div>
          </fieldset>
        </section>}

        {(dureeMoyenneContrat(c) ?? 0) > SEUIL_ACCORD_MIN && <section class="card">
          <Switch label="J’ai donné mon accord écrit pour plus de 48 h par semaine" hint="Code de l’action sociale et des familles, article L423-22 : sans ton accord, pas plus de 48 h par semaine en moyenne sur quatre mois ; avec, pas plus de 2 250 h par an, tous contrats confondus." checked={!!c.accord48h} onChange={(v) => set({ accord48h: v })} />
        </section>}

        <section class="card">
          <fieldset>
            <legend>La rémunération</legend>
            {!!c.avenants?.length && <p class="hint">Ce sont les conditions de départ. Les changements datés sont dans les avenants, plus bas.</p>}
            <EuroInput label="Taux horaire net" hint={rates.minConvNet !== undefined ? `Minimum conventionnel : ${euros(rates.minConvNet)} net (${euros(rates.minConvBrut)} brut)` : `Minimum conventionnel : ${euros(rates.minConvBrut)} brut`} cents={c.rateNet} onChange={(v) => set({ rateNet: v ?? 0 })} />
            {c.rateNet > 0 && rates.minConvNet !== undefined && c.rateNet < rates.minConvNet && <Banner tone="warn">Ce taux est sous le minimum conventionnel. Vérifie le contrat.</Banner>}
            {/* T-103 (D1) : CCN 41.1, le salaire horaire est au contrat ; CCN 107 et 109, le salaire se calcule sur le brut. */}
            <EuroInput label="Taux horaire brut" hint="Écrit dans ton contrat, à côté du net. Il donne ton salaire brut exact (indemnité de rupture, impôts, contrôle du bulletin)." cents={c.rateBrut} allowEmpty onChange={(v) => set({ rateBrut: v ?? undefined })} />
            {c.rateBrut != null && c.rateBrut > 0 && c.rateBrut < c.rateNet && <Banner tone="warn">Le brut ne peut pas être plus bas que le net. Vérifie le contrat.</Banner>}
            {rates.minConvNet !== undefined && <p class="hint">{MINIMUM_SANS_TITRE}</p>}
            {isNew
              ? <EntretienSaisie t={c} set={set} hint={`Si le montant est plus bas, l’app verse le minimum légal (${euros(entretienPlancher(today(), 540)!)} pour 9 h).`} />
              : (
                <div class="field">
                  <span class="label">Indemnité d’entretien</span>
                  <p><b>{libelleEntretien(c)}</b></p>
                  {/* T-044b (relecture V5, C2-1) : changer ici recalculerait en silence les mois passés. Un avenant daté ne change que la suite. */}
                  <p class="hint">Pour la changer, fais un avenant daté (plus bas) : les mois d’avant gardent leur calcul.</p>
                </div>
              )}
            <Choices label="Qui fournit les repas de l’enfant ?" value={c.repasParents === undefined ? undefined : c.repasParents ? 'parents' : 'am'}
              onChange={(v) => set(v === 'parents' ? { repasParents: true, repasPrix: 0, repasParJour: 0 } : { repasParents: false })}
              options={[
                { v: 'am', l: 'Moi', sub: 'Les parents te paient chaque repas, au prix du contrat.' },
                { v: 'parents', l: 'Les parents', sub: `Pour tes impôts, l’app ajoute l’avantage repas à tes revenus (${repasAvantageAu(today()) !== undefined ? `${eurosTexte(repasAvantageAu(today())!)} par jour en ${today().slice(0, 4)}` : `montant de ${today().slice(0, 4)} pas encore connu de l’app`}).` },
              ]} />
            {c.repasParents === false && (
              <div class="grid2">
                <EuroInput label="Prix d’un repas" cents={c.repasPrix} onChange={(v) => set({ repasPrix: v ?? 0 })} />
                <NumberInput label="Repas fournis par jour" value={c.repasParJour} max={4} onChange={(v) => set({ repasParJour: v ?? 0 })} />
              </div>
            )}
            <EuroInput label="Indemnité kilométrique, par km" hint="Laisse 0 si tu ne transportes pas l’enfant en voiture." cents={c.kmTaux} onChange={(v) => set({ kmTaux: v ?? 0 })} />
            {c.kmTaux > 0 && <NumberInput label="Puissance fiscale de ta voiture (CV)" hint="Sur la carte grise (case P.6). L’app vérifie que ton tarif est compris entre le barème de l’administration et le barème fiscal (article 57 de la convention)." value={c.kmCv} min={1} max={30} onChange={(v) => set({ kmCv: v || undefined })} />}
            {/* T-103 (K2) : CGI ann. IV art. 6 B, II, barème fiscal majoré de 20 % pour une voiture électrique. */}
            {c.kmTaux > 0 && (
              <Choices label="Ta voiture est-elle électrique ?" value={c.kmElectrique === undefined ? undefined : c.kmElectrique ? 'oui' : 'non'} onChange={(v) => set({ kmElectrique: v === 'oui' })}
                options={[{ v: 'non', l: 'Non' }, { v: 'oui', l: 'Oui, électrique', sub: 'Le barème fiscal, plafond de ton tarif, est majoré de 20 %.' }]} />
            )}
            <NumberInput label="Majoration des heures au-delà de 45 h par semaine (%)" hint="Le taux de ton contrat : 10 % au moins." value={c.majoration} min={10} max={100} onChange={(v) => set({ majoration: v ?? 10 })} />
            <NumberInput label="Majoration des heures complémentaires (%)" hint={AIDE_COMPLEMENTAIRES} value={c.majorationCompl ?? 0} min={0} max={100} onChange={(v) => set({ majorationCompl: v ?? 0 })} />
            {c.yearType === 'incomplete' && (
              <Seg label="Quand tes congés payés te sont-ils versés ?" value={c.cpMode} onChange={(v) => set({ cpMode: v })}
                options={[{ v: 'juin', l: 'En juin' }, { v: 'principale', l: 'Congé principal' }, { v: 'fur', l: 'Au fur et à mesure' }]} />
            )}
            {c.yearType === 'incomplete' && (
              <p class="hint">Comme écrit au contrat : en une fois en juin, lors de la prise du congé principal, ou au fur et à mesure des congés pris.</p>
            )}
            <Switch label="Enfant en situation de handicap ou de maladie" hint="Pour tes impôts : abattement majoré de 4 SMIC horaires par jour d’accueil, au lieu de 3." checked={c.majoreFiscal} onChange={(v) => set({ majoreFiscal: v })} />
            <Switch label="Les parents ont adhéré à Pajemploi+" hint={PAJEMPLOI_PLUS_AIDE} checked={!!c.pajemploiPlus} onChange={(v) => set({ pajemploiPlus: v })} />
          </fieldset>
        </section>

        {(reprise || c.trackedFrom > c.start) && (
          <section class="card">
            <fieldset>
              <legend>Reprise d’un contrat en cours</legend>
              <p class="hint">Le contrat a commencé avant l’app. L’app calcule à partir du {shortDate(isNew ? curMonthStart : c.trackedFrom)} ; pour le passé, reprends tes compteurs et tes bulletins.</p>
              {!cpManuel && soldesProposes ? (
                <>
                  <NumberInput label={`Jours de congés déjà pris depuis le ${shortDate(soldesProposes.depuis)}`} hint="Compte les jours du lundi au samedi, sans les jours fériés : une semaine de congés = 6 jours. 0 si tu n’en as pas pris." value={prisDepuisJuin} step={1} max={60} onChange={(v) => setPris(v ?? 0)} />
                  <p class="hint">Calculé par l’app à partir du début du contrat : {soldesProposes.droitsAnDernier} jours de droits de l’an dernier, donc <b>{soldesProposes.cpRestants} jours restants</b> ; et {soldesProposes.cpEnCours.toLocaleString('fr-FR')} jours gagnés depuis le {shortDate(soldesProposes.depuis)}.</p>
                  <button type="button" class="btn btn-ghost" onClick={() => { set({ balances: { ...c.balances, cpRestants: soldesProposes.cpRestants, cpEnCours: soldesProposes.cpEnCours } }); setCpManuel(true); }}>Ces chiffres sont faux : les saisir moi-même</button>
                </>
              ) : (
                <>
                  {soldes?.aConfirmer && <p class="hint">{soldes.aConfirmer}</p>}
                  <NumberInput label="Congés restants de l’an dernier (jours)" hint="Acquis avant le dernier 1er juin et pas encore pris" value={c.balances.cpRestants} step={0.5} max={60} onChange={(v) => set({ balances: { ...c.balances, cpRestants: v ?? 0 } })} />
                  <NumberInput label="Congés en cours d’acquisition (jours)" hint="Acquis depuis le 1er juin, avant le suivi par l’app" value={c.balances.cpEnCours} step={0.5} max={30} onChange={(v) => set({ balances: { ...c.balances, cpEnCours: v ?? 0 } })} />
                </>
              )}
              <NumberInput label="Jours d’absence de l’enfant malade déjà déduits" hint="Avec certificat médical, retenus sur ton salaire depuis le début de l’année de contrat en cours" value={c.balances.maladieDeduits} max={14} onChange={(v) => set({ balances: { ...c.balances, maladieDeduits: v ?? 0, ...(v ? {} : { maladieDeduitsLongue: undefined }) } })} />
              {/* T-103 (C5) : CCN 105, les 5 jours d'absences courtes et l'absence de 14 jours calendaires se comptent à part. */}
              {c.balances.maladieDeduits > 0 && (
                <Choices label="Ces jours déjà déduits venaient de :" value={c.balances.maladieDeduitsLongue === undefined ? undefined : c.balances.maladieDeduitsLongue ? 'longue' : 'courtes'}
                  onChange={(v) => set({ balances: { ...c.balances, maladieDeduitsLongue: v === 'longue' } })}
                  options={[{ v: 'courtes', l: 'Absences courtes', sub: 'Chaque absence a duré moins de 14 jours calendaires (5 jours déduits au plus).' }, { v: 'longue', l: 'Une absence de 14 jours calendaires ou plus', sub: 'Article 105 de la convention : elle se compte à part des 5 jours.' }]} />
              )}
              {/* T-103 (plancher L1242-16) : congés déjà payés pendant le CDD avant le suivi par l'app. */}
              {c.cdd && (
                <NumberInput label="Jours de congés payés pris pendant le CDD avant le suivi par l’app" hint="Du lundi au samedi, sans les jours fériés. 0 si tu n’en as pas pris. Sert au minimum du code du travail pour tes congés de fin de CDD (article L1242-16)." value={c.cddCpPrisAvantSuivi} step={1} max={60} onChange={(v) => set({ cddCpPrisAvantSuivi: v })} />
              )}
              {!isNew && <a class="btn btn-outline" href={`#/historique/${c.id}`}><Icon name="file" />Bulletins passés ({c.history.length})</a>}
            </fieldset>
          </section>
        )}

        {!isNew && <AvenantsCard c={c} />}
        {!isNew && <PartageCard cid={c.id} />}

        <button class="btn btn-primary btn-block btn-lg" onClick={save}>{isNew ? (reprise ? 'Enregistrer et reprendre l’historique' : 'Enregistrer le contrat') : 'Enregistrer'}</button>
        {!isNew && (
          <>
            <a class="btn btn-outline btn-block" href={`#/fin/${c.id}`}><Icon name="door" />Fin de contrat</a>
            <button class="btn btn-danger btn-block" onClick={async () => {
              const undo = await deleteContract(c.id);
              location.hash = '#/plus';
              toast(`Contrat ${de(c.child)} supprimé`, undo);
            }}><Icon name="trash" />Supprimer ce contrat</button>
          </>
        )}
      </main>
    </>
  );
}

/**
 * T-079 : « Dans quel département accueilles-tu l'enfant ? » (liste, recherche par saisie). Le département est enregistré ;
 * alsaceMoselle et mayotte en sont déduits, comme le faisaient les trois choix d'avant. Un contrat saisi avant garde sa
 * réponse : l'écran propose de préciser le département sans bloquer le calcul.
 */
function ChoixDepartement({ c, set }: { c: Contract; set: (p: Partial<Contract>) => void }) {
  // Réponse trouvée à l'ouverture : un contrat d'avant la T-079 la retrouve si la saisie ne mène à aucun département.
  const [origine] = useState(() => ({ departement: c.departement, alsaceMoselle: c.alsaceMoselle, mayotte: c.mayotte }));
  const [saisie, setSaisie] = useState(c.departement ? libelleDepartement(c.departement) : '');
  const inconnu = saisie.trim() !== '' && !trouverDepartement(saisie);
  const ancien = !c.departement && c.alsaceMoselle !== undefined;
  return (
    <div class="field">
      <label for="departement">Dans quel département accueilles-tu l’enfant ?</label>
      <input id="departement" class="input" list="departements-liste" value={saisie} autoComplete="off" placeholder="Numéro ou nom : 75 ou Paris"
        aria-invalid={inconnu ? 'true' : undefined} aria-describedby="departement-h"
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setSaisie(v);
          set(reponseSaisie(v, origine));
        }} />
      <datalist id="departements-liste">{DEPARTEMENTS.map((d) => <option value={`${d.code} – ${d.nom}`} />)}</datalist>
      <span class={inconnu ? 'err' : 'hint'} id="departement-h" aria-live="polite">{inconnu ? 'Choisis un département dans la liste.' : ancien ? 'Précise ton département quand tu peux. En attendant, le calcul garde ta réponse d’avant.' : 'Tape le numéro ou le nom, puis choisis dans la liste.'}</span>
    </div>
  );
}

/**
 * T-104 (cas 2) : périodes d'accueil occasionnel (CCN 98.2 : conditions fixées au contrat). Pour chacune : premier et dernier
 * jour, horaires prévus de chaque jour de la semaine (vides si le contrat n'en fixe pas : les heures notées sont alors payées
 * comme heures normales, sans heures complémentaires).
 */
function AccueilsOccasionnels({ c, set }: { c: Contract; set: (p: Partial<Contract>) => void }) {
  const ls = c.accueils ?? [];
  const maj = (i: number, p: Partial<AccueilOcc>) => set({ accueils: ls.map((a, k) => (k === i ? { ...a, ...p } : a)) });
  return (
    <section class="card">
      <fieldset>
        <legend>Les accueils prévus</legend>
        <p class="hint">Ajoute chaque période d’accueil écrite dans le contrat, avec ses horaires. Tu es payée chaque mois pour les heures d’accueil du mois. Tes congés payés : 10 % des salaires de l’accueil, versés à la fin de l’accueil (convention, articles 109.3 et 102.1.2.3).</p>
        {ls.map((a, i) => (
          <div class="stack-sm" key={a.id}>
            <div class="grid2">
              <DateInput label="Premier jour" value={a.du} min={c.start} onChange={(v) => maj(i, { du: v, au: a.au && a.au >= v ? a.au : v })} />
              <DateInput label="Dernier jour" value={a.au} min={a.du || c.start} onChange={(v) => maj(i, { au: v })} />
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <PlanDay d={d} plages={a.planning[d] ?? []} onChange={(p) => maj(i, { planning: { ...a.planning, [d]: p } })} />)}
            <p class="hint">Sans horaires écrits au contrat, laisse les jours vides : les heures que tu noteras chaque jour seront payées.</p>
            <button class="btn btn-outline" type="button" onClick={() => set({ accueils: ls.filter((_, k) => k !== i) })}>Retirer cet accueil</button>
          </div>
        ))}
        <button class="btn btn-outline btn-block" type="button" onClick={() => set({ accueils: [...ls, { id: uid(), du: c.start, au: c.start, planning: {} }] })}><Icon name="plus" />Ajouter un accueil</button>
        <p class="hint">La convention ne fixe pas de durée maximale. Si l’enfant vient de façon régulière, le contrat doit passer en accueil régulier.</p>
      </fieldset>
    </section>
  );
}

export function PlanDay({ d, plages, onChange, onCopy }: { d: number; plages: Plage[]; onChange: (p: Plage[]) => void; onCopy?: () => void }) {
  const on = plages.length > 0;
  const name = JOUR_NOMS[d - 1];
  return (
    <div class="plan-day">
      <Switch label={name.replace(/^./, (x) => x.toUpperCase())} checked={on} onChange={(v) => onChange(v ? [{ start: '08:30', end: '17:30' }] : [])} />
      {plages.map((p, i) => (
        <div class="plan-range">
          <input class="input num" type="time" aria-label={`${name}, début ${i ? 'de la 2e plage' : ''}`} value={p.start} onInput={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, start: (e.target as HTMLInputElement).value } : x)))} />
          <span aria-hidden="true">à</span>
          <input class="input num" type="time" aria-label={`${name}, fin ${i ? 'de la 2e plage' : ''}`} value={p.end} onInput={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, end: (e.target as HTMLInputElement).value } : x)))} />
          {i === 1 ? (
            <button class="icon-btn" aria-label={`Retirer la 2e plage du ${name}`} onClick={() => onChange(plages.slice(0, 1))}><Icon name="x" size={20} /></button>
          ) : <span style={{ width: '48px' }} />}
        </div>
      ))}
      {on && (
        <div class="btn-row">
          {plages.length < 2 && <button class="btn btn-ghost" onClick={() => onChange([...plages, { start: '16:30', end: '18:30' }])}><Icon name="plus" />2e plage</button>}
          {onCopy && <button class="btn btn-ghost" onClick={onCopy}>Copier sur mardi → vendredi</button>}
        </div>
      )}
    </div>
  );
}

function WeeksOff({ c, onChange }: { c: Contract; onChange: (w: string[]) => void }) {
  const [d, setD] = useState('');
  const list = [...c.weeksOff].sort();
  const attendu = Math.max(0, 52 - Math.min(46, c.weeks));
  // Année de contrat en cours (ou première année pour un nouveau contrat)
  let debut = c.start || today();
  while (c.start && addMonthsToDate(debut, 12) <= today()) debut = addMonthsToDate(debut, 12);
  const saisies = c.start ? semainesSansAccueilAnnee({ ...c, yearType: 'incomplete' }, debut).saisies : 0;
  const manque = Math.max(0, attendu - saisies);
  return (
    <div class="stack-sm">
      <span class="label">Semaines sans accueil</span>
      <span class="hint">Les {attendu} semaines où l’enfant ne vient pas (vacances des parents, tes congés), pour chaque année de contrat. Si elles ne sont pas encore connues, ajoute-les dès que les parents te les donnent (au plus tard deux mois avant). Une semaine oubliée compterait comme une semaine accueillie.</span>
      {manque > 0 ? <Banner tone="warn">Année de contrat en cours : il manque {manque} semaine{manque > 1 ? 's' : ''} sans accueil. Tant qu’une année terminée en manque, la régularisation n’est pas calculée.</Banner> : <p class="hint">Les {attendu} semaines de l’année en cours sont saisies.</p>}
      {list.length > 0 && (
        <div class="chips" style={{ flexWrap: 'wrap' }}>
          {list.map((w) => (
            <button class="chip" style={{ paddingLeft: '14px' }} aria-label={`Retirer la semaine du ${shortDate(w)}`} onClick={() => onChange(c.weeksOff.filter((x) => x !== w))}>
              Sem. du {shortDate(w)} <Icon name="x" size={18} />
            </button>
          ))}
        </div>
      )}
      <div class="row">
        <input class="input" type="date" aria-label="Un jour de la semaine sans accueil" value={d} onInput={(e) => setD((e.target as HTMLInputElement).value)} />
        <button class="btn btn-secondary" disabled={!d} onClick={() => { const m = mondayOf(d); if (!c.weeksOff.includes(m)) onChange([...c.weeksOff, m]); setD(''); }}>Ajouter</button>
      </div>
    </div>
  );
}

/** Résumé lisible des changements d'un avenant */
export function avenantSummary(before: Contract, ch: Partial<Terms>): string[] {
  const out: string[] = [];
  if (ch.rateNet != null && ch.rateNet !== before.rateNet) out.push(`Taux : ${euros(before.rateNet)} → ${euros(ch.rateNet)} net de l’heure`);
  if (ch.rateBrut != null && ch.rateBrut !== before.rateBrut) out.push(`Taux brut : ${before.rateBrut ? euros(before.rateBrut) : 'non saisi'} → ${euros(ch.rateBrut)} brut de l’heure`);
  if (ch.planning) out.push(`Planning : ${hoursLabel(weeklyMinutes(before.planning))} → ${hoursLabel(weeklyMinutes(ch.planning))} par semaine`);
  // T-044 : tarif par jour ou par heure.
  if (ch.entretienJour != null || ch.entretienHeure != null || ch.entretienMode != null) {
    const apres = { ...before, ...ch };
    if (libelleEntretien(apres) !== libelleEntretien(before)) out.push(`Entretien : ${libelleEntretien(before)} → ${libelleEntretien(apres)}`);
  }
  if (ch.repasParents != null && ch.repasParents !== before.repasParents) out.push(ch.repasParents ? 'Repas : fournis par les parents' : 'Repas : fournis par toi');
  if (ch.repasPrix != null && ch.repasPrix !== before.repasPrix) out.push(`Prix du repas : ${euros(before.repasPrix)} → ${euros(ch.repasPrix)}`);
  if (ch.repasParJour != null && ch.repasParJour !== before.repasParJour) out.push(`Repas par jour : ${before.repasParJour} → ${ch.repasParJour}`);
  if (ch.kmTaux != null) out.push(`Indemnité kilométrique : ${euros(before.kmTaux)} → ${euros(ch.kmTaux)} par km`);
  if (ch.majoration != null) out.push(`Majoration après 45 h : ${before.majoration} % → ${ch.majoration} %`);
  if (ch.majorationCompl != null && ch.majorationCompl !== (before.majorationCompl ?? 0)) out.push(`Majoration des heures complémentaires : ${before.majorationCompl ?? 0} % → ${ch.majorationCompl} %`);
  if (ch.yearType && ch.yearType !== before.yearType) out.push(ch.yearType === 'complete' ? 'Passage en année complète (52 semaines)' : `Passage en année incomplète (${ch.weeks ?? before.weeks} semaines)`);
  else if (ch.weeks != null && ch.weeks !== before.weeks) out.push(`Semaines d’accueil : ${before.weeks} → ${ch.weeks}`);
  if (ch.weeksOff) out.push('Semaines sans accueil modifiées');
  // T-104 (cas 3) : horaires variables.
  if (ch.planningVariable != null && ch.planningVariable !== !!before.planningVariable) out.push(ch.planningVariable ? 'Passage à des horaires qui changent d’une semaine à l’autre' : 'Retour à un planning qui se répète chaque semaine');
  if (ch.pvForme != null && ch.pvForme !== before.pvForme) out.push(ch.pvForme === 'cycle' ? 'Horaires : cycle écrit au contrat' : 'Horaires : planning remis par les parents');
  if (ch.cycle) out.push(`Cycle : ${ch.cycle.length} semaines (${ch.cycle.map((p) => hoursLabel(weeklyMinutes(p))).join(', ')})`);
  if (ch.cycleAncre && ch.cycleAncre !== before.cycleAncre) out.push(`Semaine A : celle du ${shortDate(ch.cycleAncre)}`);
  if (ch.heuresMensualisees != null && ch.heuresMensualisees !== before.heuresMensualisees) out.push(`Heures payées chaque mois : ${before.heuresMensualisees ?? '—'} → ${ch.heuresMensualisees}`);
  return out;
}

function AvenantsCard({ c }: { c: Contract }) {
  const list: Avenant[] = [...(c.avenants ?? [])].sort((a, b) => (a.from < b.from ? -1 : 1));
  return (
    <section class="card stack" aria-label="Avenants">
      <h2>Avenants</h2>
      <p class="hint">Un avenant change le contrat à partir d’une date : taux, planning, entretien, repas, type d’année. Les jours d’avant gardent les anciennes conditions.</p>
      {list.map((a) => {
        const before = termsAt({ ...c, avenants: list.filter((x) => x.from < a.from) }, a.from);
        return (
          <a class="btn btn-outline btn-block" style={{ justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start' }} href={`#/avenant/${c.id}/${a.id}`}>
            <b>{a.from.slice(8) === '01' ? `À partir ${deMois(a.from.slice(0, 7) as Month)}` : `À partir du ${shortDate(a.from)}`}</b>
            {avenantSummary(before, a.changes).map((l) => <span style={{ fontWeight: 400 }}>{l}</span>)}
          </a>
        );
      })}
      <a class="btn btn-secondary btn-block" href={`#/avenant/${c.id}/nouveau`}><Icon name="plus" />Faire un avenant</a>
    </section>
  );
}
