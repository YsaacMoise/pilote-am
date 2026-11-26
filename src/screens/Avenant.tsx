// Avenant : nouvelles conditions du contrat à partir du 1er d'un mois.
import { NON_GERE_47_51, semaines4751 } from '../engine/nonGeres';
import { useState } from 'preact/hooks';
import { logErreur, logUsage, putContract, state, toast, uid, useStore } from '../store';
import { addMonths, firstDay, monthLabel, monthOf, today, type Month } from '../engine/dates';
import { daysPerWeek, joursMensualises, mensuelMinutes, salaireMensualise, termsAt, weeklyMinutes } from '../engine/payroll';
import { libelleMinimumBrut, MESSAGE_PERIODE_NON_GEREE, minimumBrut, minimumSansTitre, ratesAtRegion } from '../engine/rates';
import { regionDe } from '../engine/regions';
import { euros, hoursLabel } from '../engine/money';
import { TERM_KEYS, type Avenant as Av, type Contract, type Planning, type Terms } from '../engine/model';
import { EntretienSaisie } from './EntretienSaisie';
import { BrutSaisie } from './BrutSaisie';
import { Banner, Choices, DateInput, EuroInput, NumberInput, Seg, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { PlanDay, avenantSummary } from './Contrat';
import { AIDE_ANNEE, AIDE_COMPLEMENTAIRES, AIDE_SEMAINES } from './textes-contrat';
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

export function Avenant({ cid, aid }: { cid: string; aid?: string }) {
  useStore();
  const c = state.contracts.find((x) => x.id === cid);
  const existing = c?.avenants?.find((a) => a.id === aid);
  const [date, setDate] = useState<string>(() => existing?.from ?? firstDay(addMonths(monthOf(today()), 1)));
  const month = date.slice(0, 7) as Month;
  const others = (c?.avenants ?? []).filter((a) => a.id !== existing?.id);
  const base = (d: string) => (c ? termsAt({ ...c, avenants: others }, d) : undefined);
  const [t, setT] = useState<Terms | undefined>(() => {
    const b = base(date);
    return b ? { ...pickTerms(b), ...(existing ? structuredClone(existing.changes) : {}) } : undefined;
  });
  const [signe, setSigne] = useState(existing?.signe ?? '');
  // T-104 (cas 3) : plannings remis semaine par semaine : gardés au contrat (datés par leur lundi), modifiables ici.
  const [plans, setPlans] = useState(c?.planningsSemaines);
  const [errors, setErrors] = useState<string[]>([]);
  if (!c || !t) return (<><Topbar title="Avenant" back="#/plus" screen="avenant" /><main><Banner tone="warn">Contrat introuvable.</Banner></main></>);

  const before = base(date)!;
  const set = (p: Partial<Terms>) => { setT({ ...t, ...p }); setErrors([]); };
  const preview: Contract = { ...c, ...t, planningsSemaines: plans };
  // T-104 (cas 3) : saisie des horaires variables de l'avenant (mêmes écrans que le contrat).
  const setPV = (p: Partial<Contract>) => {
    const { planningsSemaines, ...reste } = p;
    if ('planningsSemaines' in p) setPlans(planningsSemaines);
    const termes: Partial<Terms> = {};
    for (const k of TERM_KEYS) if (k in reste) (termes as any)[k] = (reste as any)[k];
    set(termes);
  };
  const wk = weeklyMinutes(t.planning);
  // T-077 (R2) : repère net, minimum légal et texte du titre AM-GE de la région du contrat.
  const rates = ratesAtRegion(date, regionDe(c));
  const MINIMUM_SANS_TITRE = minimumSansTitre(regionDe(c));
  const changes: Partial<Terms> = {};
  for (const k of TERM_KEYS) if (!same(t[k], (before as any)[k])) (changes as any)[k] = structuredClone(t[k]);
  const summary = avenantSummary(before, changes);

  async function save() {
    const errs: string[] = [];
    if (!summary.length) errs.push('Rien n’a changé par rapport au contrat en vigueur ce mois-là.');
    if (!date) errs.push('Indique la date de début de l’avenant.');
    if (date <= c!.start) errs.push('L’avenant doit commencer après le début du contrat.');
    if (semaines4751(t!.yearType, t!.weeks)) errs.push(NON_GERE_47_51);
    else if (t!.yearType === 'incomplete' && (t!.weeks < 1 || t!.weeks > 46)) errs.push('En année incomplète, le nombre de semaines va de 1 à 46.');
    if (others.some((a) => a.from === date)) errs.push('Un autre avenant commence déjà ce jour-là : modifie-le plutôt.');
    if (!t!.planningVariable && wk <= 0) errs.push('Le planning est vide.');
    for (const m of t!.planningVariable ? manquesPV(preview) : []) errs.push(`Horaires qui changent : indique ${m}.`);
    for (let d = 1; d <= 7; d++) for (const p of t!.planning[d] ?? []) if (p.end <= p.start) errs.push('Une heure de fin est avant le début.');
    setErrors(errs);
    // C-101 : chaque enregistrement refusé est noté (relecture contradictoire : le deuxième refus passait inaperçu).
    if (errs.length) logErreur('avenant_incomplet');
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const av: Av = { id: existing?.id ?? uid(), from: date, ...(signe ? { signe } : {}), changes };
    const next: Contract = { ...c!, ...(plans ? { planningsSemaines: plans } : {}), avenants: [...others, av].sort((a, b) => (a.from < b.from ? -1 : 1)) };
    const prev = await putContract(next);
    logUsage(existing ? 'avenant_modifie' : 'avenant_cree', 'avenant');
    toast(`Avenant à partir du ${date.split('-').reverse().join('/')} enregistré`, prev ? async () => { await putContract(prev); } : undefined);
    location.hash = `#/contrat/${c!.id}`;
  }

  async function remove() {
    const prev = await putContract({ ...c!, avenants: others });
    logUsage('avenant_supprime', 'avenant');
    toast('Avenant supprimé', prev ? async () => { await putContract(prev); } : undefined);
    location.hash = `#/contrat/${c!.id}`;
  }

  return (
    <>
      <Topbar title={existing ? 'Avenant' : 'Nouvel avenant'} sub={c.child} back={`#/contrat/${c.id}`} screen="avenant" />
      <main>
        {errors.length > 0 && (
          <Banner tone="warn">
            <strong>À corriger avant d’enregistrer</strong>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>{errors.map((e) => <li>{e}</li>)}</ul>
          </Banner>
        )}
        <section class="card">
          <fieldset>
            <legend>Quand</legend>
            <DateInput label="À partir du" hint="Premier jour avec les nouvelles conditions. Les jours d’avant gardent les anciennes. Un avenant en cours de mois est calculé au prorata." value={date} min={c.start}
              onChange={(v) => { setDate(v); setErrors([]); if (!existing && v) { const b = base(v); if (b) setT(pickTerms(b)); } }} />
            <DateInput label="Signé le (facultatif)" value={signe} onChange={setSigne} />
          </fieldset>
        </section>

        <section class="card">
          <fieldset>
            <legend>La rémunération</legend>
            <EuroInput label="Taux horaire net" hint={!rates ? MESSAGE_PERIODE_NON_GEREE : rates.minConvNet === undefined ? `Minimum en ${monthLabel(month)} : ${libelleMinimumBrut(minimumBrut(date, regionDe(c))!)} (pas de repère net dans l’app)` : `Minimum conventionnel en ${monthLabel(month)} : ${euros(rates.minConvNet)} net`} cents={t.rateNet} onChange={(v) => set({ rateNet: v ?? 0 })} />
            {t.rateNet > 0 && rates?.minConvNet !== undefined && t.rateNet < rates.minConvNet && <Banner tone="warn">Ce taux est sous le minimum conventionnel.</Banner>}
            {/* T-115 (R3) : brut calculé depuis le net, à la date de l'avenant ; l'AM peut écrire celui de l'avenant. */}
            <BrutSaisie net={t.rateNet} brut={t.rateBrut} date={date || today()} region={regionDe(c)} set={(v) => set({ rateBrut: v })} ecrit="l’avenant" debut={date} />
            {rates?.minConvNet !== undefined && <p class="hint">{MINIMUM_SANS_TITRE}</p>}
            {/* T-044b (C2-1) : un avenant daté dans le passé recalcule les mois depuis sa date : le dire. */}
            <EntretienSaisie t={t} set={set} passe={date < firstDay(monthOf(today())) && (changes.entretienJour != null || changes.entretienHeure != null || changes.entretienMode != null)} />
            <Choices label="Qui fournit les repas de l’enfant ?" value={t.repasParents === undefined ? undefined : t.repasParents ? 'parents' : 'am'}
              onChange={(v) => set(v === 'parents' ? { repasParents: true, repasPrix: 0, repasParJour: 0 } : { repasParents: false })}
              options={[{ v: 'am', l: 'Moi' }, { v: 'parents', l: 'Les parents' }]} />
            {t.repasParents === false && (
              <div class="grid2">
                <EuroInput label="Prix d’un repas" cents={t.repasPrix} onChange={(v) => set({ repasPrix: v ?? 0 })} />
                <NumberInput label="Repas fournis par jour" value={t.repasParJour} max={4} onChange={(v) => set({ repasParJour: v ?? 0 })} />
              </div>
            )}
            <EuroInput label="Indemnité kilométrique, par km" cents={t.kmTaux} onChange={(v) => set({ kmTaux: v ?? 0 })} />
            <NumberInput label="Majoration des heures au-delà de 45 h par semaine (%)" hint="Le taux de ton contrat : 10 % au moins." value={t.majoration} min={10} max={100} onChange={(v) => set({ majoration: v ?? 10 })} />
            <NumberInput label="Majoration des heures complémentaires (%)" hint={AIDE_COMPLEMENTAIRES} value={t.majorationCompl ?? 0} min={0} max={100} onChange={(v) => set({ majorationCompl: v ?? 0 })} />
          </fieldset>
        </section>

        <section class="card">
          <fieldset>
            <legend>Le planning</legend>
            <Seg label="Année complète ou incomplète ?" value={t.yearType} onChange={(v) => set({ yearType: v, weeks: v === 'complete' ? 52 : Math.min(t.weeks, 46) || 46 })}
              options={[{ v: 'complete', l: 'Année complète' }, { v: 'incomplete', l: 'Année incomplète' }]} />
            <p class="hint">{AIDE_ANNEE}</p>
            {t.yearType === 'incomplete' && <NumberInput label="Semaines d’accueil prévues au contrat" hint={AIDE_SEMAINES} value={t.weeks} min={1} max={51} onChange={(v) => set({ weeks: v ?? 46 })} />}
            {/* T-104 (cas 3) : l'avenant peut changer les horaires variables, ou passer d'un planning fixe à des horaires variables et inversement. */}
            <Choices label="Avec cet avenant, le planning est-il le même chaque semaine ?" value={t.planningVariable ? 'non' : 'oui'} onChange={(v) => set({ planningVariable: v === 'non' })}
              options={[{ v: 'oui', l: 'Oui, une semaine type qui se répète' }, { v: 'non', l: 'Non, il change d’une semaine à l’autre', sub: 'Semaines A et B, ou planning remis par les parents.' }]} />
            {semaines4751(t.yearType, t.weeks) && <><Banner tone="warn">{NON_GERE_47_51}</Banner><button class="btn btn-secondary" onClick={() => set({ yearType: 'complete', weeks: 52 })}>Passer en année complète (52 semaines)</button></>}
            {before.yearType === 'incomplete' && t.yearType === 'complete' && <p class="hint">Le contrat passe de l’année incomplète à l’année complète : l’app calcule une régularisation à la date de l’avenant (heures accueillies et pas encore payées), versée avec le salaire de ce mois.</p>}
            {before.yearType === 'incomplete' && t.yearType === 'incomplete' && <p class="hint">Année incomplète : la régularisation se fait en fin de contrat, pas à l’avenant.</p>}
            {!t.planningVariable && [1, 2, 3, 4, 5, 6, 7].map((d) => <PlanDay d={d} plages={t.planning[d] ?? []} onChange={(p) => set({ planning: { ...t.planning, [d]: p } as Planning })} />)}
            {!t.planningVariable && <div class="banner info" style={{ marginTop: '4px' }}>
              <span class="b-ico"><Icon name="clock" /></span>
              <div class="b-body">
                <span><b>{hoursLabel(wk)}</b> par semaine sur {daysPerWeek(t.planning)} jours</span>
                <span>Soit <b>{hoursLabel(Math.round(mensuelMinutes(preview)))}</b> et <b>{joursMensualises(preview)} jours</b> par mois, pour <b>{euros(salaireMensualise(preview))}</b> net.</span>
              </div>
            </div>}
          </fieldset>
        </section>

        {t.planningVariable && <PlanningVariableSaisie c={preview} set={setPV} />}

        <section class="card stack" aria-label="Ce qui change">
          <h2>Ce qui change</h2>
          {summary.length ? summary.map((l) => <p>{l}</p>) : <p class="muted">Rien pour l’instant.</p>}
        </section>

        <button class="btn btn-primary btn-block btn-lg" onClick={save}>Enregistrer l’avenant</button>
        {existing && <button class="btn btn-danger btn-block" onClick={remove}><Icon name="trash" />Supprimer cet avenant</button>}
      </main>
    </>
  );
}
