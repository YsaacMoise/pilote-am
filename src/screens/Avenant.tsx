// Avenant : nouvelles conditions du contrat à partir d'une date. T-122 (maquettes 19 et 27) : date d'effet, puis les parties
// cochées seulement (salaire, planning avec semaines sans accueil, frais ; date de fin d'un CDD).
import { NON_GERE_47_51, semaines4751 } from '../engine/nonGeres';
import { useState } from 'preact/hooks';
import { logErreur, logUsage, putContract, state, toast, uid, useStore } from '../store';
import { firstDay, monthLabel, monthOf, shortDate, today, type Month } from '../engine/dates';
import { daysPerWeek, joursMensualises, mensuelMinutes, salaireMensualise, termsAt, weeklyMinutes } from '../engine/payroll';
import { libelleMinimumBrut, MESSAGE_PERIODE_NON_GEREE, minimumBrut, ratesAtRegion } from '../engine/rates';
import { regionDe } from '../engine/regions';
import { euros, hoursLabel } from '../engine/money';
import { TERM_KEYS, type Avenant as Av, type Contract, type Planning, type Terms } from '../engine/model';
import { EntretienSaisie } from './EntretienSaisie';
import { BrutSaisie } from './BrutSaisie';
import { Banner, Choices, DateInput, EuroInput, NumberInput, Seg, Switch, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { PlanDay, WeeksOff, avenantSummary } from './Contrat';
import { AIDE_COMPLEMENTAIRES, AIDE_SEMAINES, TITRE_AM_AP } from './textes-contrat';
import { PlanningVariableSaisie } from './PlanningVariableSaisie';
import { manquesPV } from '../engine/planningVariable';

function pickTerms(c: Contract): Terms {
  const t = {} as Terms;
  for (const k of TERM_KEYS) (t as any)[k] = structuredClone((c as any)[k]);
  return t;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** T-122 : les parties d'un avenant (maquette 19) et les conditions de chacune */
type Partie = 'salaire' | 'planning' | 'frais' | 'fin';
const CLES: Record<Exclude<Partie, 'fin'>, (keyof Terms)[]> = {
  salaire: ['rateNet', 'rateBrut', 'majoration', 'majorationCompl'],
  planning: ['planning', 'yearType', 'weeks', 'weeksOff', 'planningVariable', 'pvForme', 'cycle', 'cycleAncre', 'heuresMensualisees'],
  frais: ['entretienJour', 'entretienHeure', 'entretienMode', 'repasPrix', 'repasParJour', 'repasParents', 'kmTaux'],
};

export function Avenant({ cid, aid }: { cid: string; aid?: string }) {
  useStore();
  const c = state.contracts.find((x) => x.id === cid);
  const existing = c?.avenants?.find((a) => a.id === aid);
  // T-122 (décision 1 du DG) : aucune date d'effet proposée pour un nouvel avenant.
  const [date, setDate] = useState<string>(() => existing?.from ?? '');
  const jour = date || today();
  const month = jour.slice(0, 7) as Month;
  const others = (c?.avenants ?? []).filter((a) => a.id !== existing?.id);
  const base = (d: string) => (c ? termsAt({ ...c, avenants: others }, d) : undefined);
  const [t, setT] = useState<Terms | undefined>(() => {
    const b = base(existing?.from ?? today());
    return b ? { ...pickTerms(b), ...(existing ? structuredClone(existing.changes) : {}) } : undefined;
  });
  const [parties, setParties] = useState<Partie[]>(() => (existing ? (Object.keys(CLES) as Exclude<Partie, 'fin'>[]).filter((k) => CLES[k].some((x) => x in existing.changes)) : []));
  const [etape, setEtape] = useState<1 | 2>(1);
  const [cddTerme, setCddTerme] = useState(c?.cddTerme ?? '');
  const [signe, setSigne] = useState(existing?.signe ?? '');
  // T-104 (cas 3) : plannings remis semaine par semaine : gardés au contrat (datés par leur lundi), modifiables ici.
  const [plans, setPlans] = useState(c?.planningsSemaines);
  const [errors, setErrors] = useState<string[]>([]);
  const retour = c ? `#/enfant/${c.id}` : '#/plus';
  if (!c || !t) return (<><Topbar title="Avenant" back="#/plus" screen="avenant" /><main><Banner tone="warn">Contrat introuvable.</Banner></main></>);

  const before = base(jour)!;
  const set = (p: Partial<Terms>) => { setT({ ...t, ...p }); setErrors([]); };
  const avec = (p: Partie) => parties.includes(p);
  // Seules les parties cochées changent : les autres gardent les conditions en vigueur à la date d'effet.
  const tRetenu: Terms = { ...t };
  for (const [k, cles] of Object.entries(CLES) as [Exclude<Partie, 'fin'>, (keyof Terms)[]][]) if (!avec(k)) for (const x of cles) (tRetenu as any)[x] = structuredClone((before as any)[x]);
  const preview: Contract = { ...c, ...tRetenu, planningsSemaines: avec('planning') ? plans : c.planningsSemaines };
  // T-104 (cas 3) : saisie des horaires variables de l'avenant (mêmes écrans que le contrat).
  const setPV = (p: Partial<Contract>) => {
    const { planningsSemaines, ...reste } = p;
    if ('planningsSemaines' in p) setPlans(planningsSemaines);
    const termes: Partial<Terms> = {};
    for (const k of TERM_KEYS) if (k in reste) (termes as any)[k] = (reste as any)[k];
    set(termes);
  };
  const wk = weeklyMinutes(tRetenu.planning);
  // T-077 (R2) : repère net, minimum légal et texte du titre AM-GE de la région du contrat.
  const rates = ratesAtRegion(jour, regionDe(c));
  const changes: Partial<Terms> = {};
  for (const k of TERM_KEYS) if (!same(tRetenu[k], (before as any)[k])) (changes as any)[k] = structuredClone(tRetenu[k]);
  const summary = avenantSummary(before, changes);
  const finChange = !!c.cdd && avec('fin') && !!cddTerme && cddTerme !== c.cddTerme;
  if (finChange) summary.push(`Date de fin du CDD : ${c.cddTerme ? shortDate(c.cddTerme) : 'non indiquée'} → ${shortDate(cddTerme)}`);

  function erreursDate(): string[] {
    const errs: string[] = [];
    if (!date) errs.push('Indique la date d’effet de l’avenant.');
    else if (date <= c!.start) errs.push('L’avenant doit commencer après le début du contrat.');
    if (date && others.some((a) => a.from === date)) errs.push('Un autre avenant commence déjà ce jour-là : modifie-le plutôt.');
    if (!parties.length) errs.push('Coche ce qui change.');
    return errs;
  }

  async function save() {
    const errs = erreursDate();
    if (!summary.length) errs.push('Rien n’a changé par rapport au contrat en vigueur à cette date.');
    if (semaines4751(tRetenu.yearType, tRetenu.weeks)) errs.push(NON_GERE_47_51);
    else if (tRetenu.yearType === 'incomplete' && (tRetenu.weeks < 1 || tRetenu.weeks > 46)) errs.push('En année incomplète, le nombre de semaines va de 1 à 46.');
    if (!tRetenu.planningVariable && wk <= 0) errs.push('Le planning est vide.');
    for (const m of tRetenu.planningVariable ? manquesPV(preview) : []) errs.push(`Horaires qui changent : indique ${m}.`);
    for (let d = 1; d <= 7; d++) for (const p of tRetenu.planning[d] ?? []) if (p.end <= p.start) errs.push('Une heure de fin est avant le début.');
    if (avec('fin') && cddTerme && cddTerme < c!.start) errs.push('La date de fin du CDD est avant le début du contrat.');
    setErrors(errs);
    // C-101 : chaque enregistrement refusé est noté (relecture contradictoire : le deuxième refus passait inaperçu).
    if (errs.length) logErreur('avenant_incomplet');
    if (errs.length) return;
    const avecTermes = Object.keys(changes).length > 0;
    const av: Av = { id: existing?.id ?? uid(), from: date, ...(signe ? { signe } : {}), changes };
    const next: Contract = {
      ...c!,
      ...(avec('planning') && plans ? { planningsSemaines: plans } : {}),
      // T-122 : CDD renouvelé : nouvelle date de fin prévue (champ du contrat, comme dans l'écran Contrat).
      ...(finChange ? { cddTerme } : {}),
      avenants: avecTermes ? [...others, av].sort((a, b) => (a.from < b.from ? -1 : 1)) : (c!.avenants ?? []),
    };
    const prev = await putContract(next);
    logUsage(existing ? 'avenant_modifie' : 'avenant_cree', 'avenant');
    toast(`Avenant à partir du ${date.split('-').reverse().join('/')} enregistré`, prev ? async () => { await putContract(prev); } : undefined);
    location.hash = retour;
  }

  async function remove() {
    const prev = await putContract({ ...c!, avenants: others });
    logUsage('avenant_supprime', 'avenant');
    toast('Avenant supprimé', prev ? async () => { await putContract(prev); } : undefined);
    location.hash = retour;
  }

  const cocher = (p: Partie, v: boolean) => { setErrors([]); setParties(v ? [...parties, p] : parties.filter((x) => x !== p)); };

  if (etape === 1) return (
    <>
      <Topbar title={`Avenant · ${c.child}`} back={retour} screen="avenant" />
      <main>
        <section class="card stack">
          <DateInput label="Date d’effet" hint="En cours de mois, Arvela calcule au prorata. Les jours d’avant gardent les anciennes conditions." value={date} min={c.start}
            onChange={(v) => { setDate(v); setErrors([]); if (!existing && v) { const b = base(v); if (b) setT(pickTerms(b)); } }} />
          <DateInput label="Signé le (facultatif)" value={signe} onChange={setSigne} />
        </section>
        <section class="card stack-sm" aria-labelledby="av-ce">
          <h2 id="av-ce">Ce qui change</h2>
          <Switch label="Le salaire" hint="Taux horaire, majorations" checked={avec('salaire')} onChange={(v) => cocher('salaire', v)} />
          <Switch label="Le planning" hint="Jours, horaires, semaines sans accueil, type d’année" checked={avec('planning')} onChange={(v) => cocher('planning', v)} />
          <Switch label="Les frais" hint="Entretien, repas, kilomètres" checked={avec('frais')} onChange={(v) => cocher('frais', v)} />
          {c.cdd && <Switch label="La date de fin du CDD" hint="Renouvellement du CDD" checked={avec('fin')} onChange={(v) => cocher('fin', v)} />}
          <p class="hint">Seules les parties cochées s’ouvrent, remplies avec le contrat en vigueur.</p>
        </section>
        {errors.length > 0 && <p class="err" role="alert">Pour continuer : {errors.map((e) => e.replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase())).join(' ; ')}.</p>}
        <button class="btn btn-primary btn-block btn-lg" onClick={() => { const e = erreursDate(); setErrors(e); if (e.length) { logErreur('avenant_incomplet'); return; } setEtape(2); window.scrollTo(0, 0); }}>Continuer</button>
        {existing && <button class="btn btn-danger btn-block" onClick={remove}><Icon name="trash" />Supprimer cet avenant</button>}
      </main>
    </>
  );

  return (
    <>
      <Topbar title={`Avenant · ${c.child}`} sub={`À partir du ${shortDate(date)}`} back={retour} screen="avenant" />
      <main>
        {avec('salaire') && (
          <section class="card">
            <fieldset>
              <legend>Le salaire</legend>
              <EuroInput label="Taux horaire net" hint={!rates ? MESSAGE_PERIODE_NON_GEREE : rates.minConvNet === undefined ? `Minimum en ${monthLabel(month)} : ${libelleMinimumBrut(minimumBrut(jour, regionDe(c))!)} (pas de repère net dans l’app)` : `Actuel : ${euros(before.rateNet)} net. Minimum conventionnel en ${monthLabel(month)} : ${euros(rates.minConvNet)} net.`} cents={t.rateNet} onChange={(v) => set({ rateNet: v ?? 0 })} />
              {t.rateNet > 0 && rates?.minConvNet !== undefined && t.rateNet < rates.minConvNet && <Banner tone="warn">Ce taux est sous le minimum conventionnel.</Banner>}
              {/* T-115 (R3) : brut calculé depuis le net, à la date de l'avenant ; l'AM peut écrire celui de l'avenant. */}
              <BrutSaisie net={t.rateNet} brut={t.rateBrut} date={jour} region={regionDe(c)} set={(v) => set({ rateBrut: v })} ecrit="l’avenant" debut={date} />
              {rates?.minConvNet !== undefined && <p class="hint">{TITRE_AM_AP}</p>}
              <NumberInput label="Majoration des heures au-delà de 45 h par semaine (%)" hint="10 % au moins." value={t.majoration} min={10} max={100} onChange={(v) => set({ majoration: v ?? 10 })} />
              <NumberInput label="Majoration des heures complémentaires (%)" hint={AIDE_COMPLEMENTAIRES} value={t.majorationCompl ?? 0} min={0} max={100} onChange={(v) => set({ majorationCompl: v ?? 0 })} />
            </fieldset>
          </section>
        )}

        {avec('planning') && (
          <section class="card">
            <fieldset>
              <legend>Le planning</legend>
              <Seg label="Année complète ou incomplète ?" value={t.yearType} onChange={(v) => set({ yearType: v, weeks: v === 'complete' ? 52 : Math.min(t.weeks, 46) || 46 })}
                options={[{ v: 'complete', l: 'Année complète' }, { v: 'incomplete', l: 'Année incomplète' }]} />
              <p class="hint">Comme écrit à l’avenant.</p>
              {t.yearType === 'incomplete' && <NumberInput label="Semaines d’accueil programmées" hint={AIDE_SEMAINES} value={t.weeks} min={1} max={51} onChange={(v) => set({ weeks: v ?? 46 })} />}
              {/* T-122 : semaines sans accueil de l'avenant (lues par payroll.ts, toutesSemainesSansAccueil). */}
              {t.yearType === 'incomplete' && <WeeksOff c={preview} onChange={(w) => set({ weeksOff: w })} />}
              {/* T-104 (cas 3) : l'avenant peut changer les horaires variables, ou passer d'un planning fixe à des horaires variables et inversement. */}
              <Choices label="Avec cet avenant, le planning est-il le même chaque semaine ?" value={t.planningVariable ? 'non' : 'oui'} onChange={(v) => set({ planningVariable: v === 'non' })}
                options={[{ v: 'oui', l: 'Oui, une semaine type qui se répète' }, { v: 'non', l: 'Non, il change d’une semaine à l’autre', sub: 'Semaines A et B, ou planning remis par les parents.' }]} />
              {semaines4751(t.yearType, t.weeks) && <><Banner tone="warn">{NON_GERE_47_51}</Banner><button class="btn btn-secondary" onClick={() => set({ yearType: 'complete', weeks: 52 })}>Passer en année complète (52 semaines)</button></>}
              {before.yearType === 'incomplete' && t.yearType === 'complete' && <p class="hint">Le contrat passe de l’année incomplète à l’année complète : l’app calcule une régularisation à la date de l’avenant (heures accueillies et pas encore payées), versée avec le salaire de ce mois.</p>}
              {before.yearType === 'incomplete' && t.yearType === 'incomplete' && <p class="hint">Année incomplète : la régularisation se fait en fin de contrat, pas à l’avenant.</p>}
              {!t.planningVariable && [1, 2, 3, 4, 5, 6, 7].map((d) => <PlanDay d={d} plages={t.planning[d] ?? []} onChange={(p) => set({ planning: { ...t.planning, [d]: p } as Planning })} />)}
              {!t.planningVariable && <div class="banner info">
                <span class="b-ico"><Icon name="clock" /></span>
                <div class="b-body">
                  <span><b>{hoursLabel(wk)}</b> par semaine sur {daysPerWeek(tRetenu.planning)} jours</span>
                  <span>Soit <b>{hoursLabel(Math.round(mensuelMinutes(preview)))}</b> et <b>{joursMensualises(preview)} jours</b> par mois, pour <b>{euros(salaireMensualise(preview))}</b> net.</span>
                </div>
              </div>}
            </fieldset>
          </section>
        )}

        {avec('planning') && t.planningVariable && <PlanningVariableSaisie c={preview} set={setPV} />}

        {avec('frais') && (
          <section class="card">
            <fieldset>
              <legend>Les frais</legend>
              {/* T-044b (C2-1) : un avenant daté dans le passé recalcule les mois depuis sa date : le dire. */}
              <EntretienSaisie t={t} set={set} passe={jour < firstDay(monthOf(today())) && (changes.entretienJour != null || changes.entretienHeure != null || changes.entretienMode != null)} />
              <Choices label="Qui fournit les repas de l’enfant ?" value={t.repasParents === undefined ? undefined : t.repasParents ? 'parents' : 'am'}
                onChange={(v) => set(v === 'parents' ? { repasParents: true, repasPrix: 0, repasParJour: 0 } : { repasParents: false })}
                options={[{ v: 'am', l: 'Moi' }, { v: 'parents', l: 'Les parents' }]} />
              {t.repasParents === false && (
                <div class="grid2">
                  <EuroInput label="Prix d’un repas" cents={t.repasPrix} onChange={(v) => set({ repasPrix: v ?? 0 })} />
                  <NumberInput label="Repas fournis par jour" value={t.repasParJour} max={4} onChange={(v) => set({ repasParJour: v ?? 0 })} />
                </div>
              )}
              <EuroInput label="Indemnité kilométrique, par km" hint="0 si les kilomètres ne sont pas prévus." cents={t.kmTaux} onChange={(v) => set({ kmTaux: v ?? 0 })} />
            </fieldset>
          </section>
        )}

        {avec('fin') && c.cdd && (
          <section class="card">
            <fieldset>
              <legend>La date de fin du CDD</legend>
              <DateInput label={c.cddTermeImprecis ? 'Nouvelle fin de la durée minimale' : 'Nouvelle date de fin prévue'} hint={c.cddTerme ? `Actuelle : ${shortDate(c.cddTerme)}.` : undefined} value={cddTerme} min={c.start} onChange={setCddTerme} />
            </fieldset>
          </section>
        )}

        <section class="card stack" aria-label="Ce qui change">
          <h2>Ce qui change</h2>
          {summary.length ? summary.map((l) => <p>{l}</p>) : <p class="muted">Rien pour l’instant.</p>}
          <p class="hint">À partir du {shortDate(date)}.</p>
        </section>

        {errors.length > 0 && <Banner tone="warn"><strong>À corriger avant d’enregistrer</strong><ul>{errors.map((e) => <li>{e}</li>)}</ul></Banner>}
        <button class="btn btn-primary btn-block btn-lg" onClick={save}>Enregistrer l’avenant</button>
        <button class="btn btn-ghost btn-block" onClick={() => { setErrors([]); setEtape(1); }}><Icon name="left" />Date et parties</button>
      </main>
    </>
  );
}
