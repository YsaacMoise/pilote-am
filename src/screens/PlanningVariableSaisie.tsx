// T-076 : saisie d'un contrat aux horaires qui changent d'une semaine à l'autre (regles/t076-decisions-direction.md,
// section 1 ; textes de l'écran : regles/t076-planning-variable.md, section 5).
import { useState } from 'preact/hooks';
import { mondayOf, shortDate, today } from '../engine/dates';
import { hoursLabel } from '../engine/money';
import type { Contract, Plage, Planning } from '../engine/model';
import { formePV, minutesPlanning, rangCycle } from '../engine/planningVariable';
import { Choices, DateInput, NumberInput, Seg } from '../ui/kit';
import { Icon } from '../ui/icons';
import { PlanDay } from './Contrat';

const NOMS_SEMAINES = ['A', 'B', 'C', 'D'];

/** Saisie du planning d'une semaine (7 jours), avec le composant du planning type */
function SemaineSaisie({ pl, onChange }: { pl: Planning; onChange: (p: Planning) => void }) {
  const setDay = (d: number, p: Plage[]) => onChange({ ...pl, [d]: p });
  return (
    <>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => <PlanDay d={d} plages={pl[d] ?? []} onChange={(p) => setDay(d, p)}
        onCopy={d === 1 ? () => { const x: Planning = { ...pl }; for (let k = 2; k <= 5; k++) x[k] = structuredClone(pl[1] ?? []); onChange(x); } : undefined} />)}
      <p class="hint"><b>{hoursLabel(minutesPlanning(pl))}</b> cette semaine</p>
    </>
  );
}

export function PlanningVariableSaisie({ c, set }: { c: Contract; set: (p: Partial<Contract>) => void }) {
  const forme = formePV(c);
  return (
    <section class="card">
      <fieldset>
        <legend>Tes horaires qui changent</legend>
        <p class="hint">Ton salaire est mensualisé même si tes horaires changent chaque semaine. Une semaine plus courte ne réduit pas ton salaire, sauf absence non payée.</p>
        <Choices label="Comment changent tes horaires ?" value={forme} onChange={(v) => set({ pvForme: v as 'cycle' | 'remis', ...(v === 'cycle' && !c.cycle?.length ? { cycle: [structuredClone(c.planning), {}] } : {}), ...(v === 'remis' && !c.planningsSemaines ? { planningsSemaines: {} } : {}) })}
          options={[
            { v: 'cycle', l: 'Mes semaines suivent un cycle écrit au contrat (semaine A, semaine B…)' },
            { v: 'remis', l: 'Les parents me donnent un planning écrit', sub: 'Remis à l’avance, dans le délai prévu au contrat (article 98.1.2)' },
          ]} />
        {forme === 'cycle' && <CycleSaisie c={c} set={set} />}
        {forme === 'remis' && <PlanningsRemis c={c} set={set} />}
        <NumberInput label="Heures payées chaque mois, écrites dans ton contrat" hint="Le nombre d’heures mensualisées de ton contrat, par exemple 130 ou 151,67. C’est lui qui fixe ton salaire de chaque mois." value={c.heuresMensualisees} step={0.01} max={300} onChange={(v) => set({ heuresMensualisees: v })} />
        <p class="hint">Les heures complémentaires se comptent semaine par semaine. Une semaine longue ne compense pas une semaine courte. Au-delà de 45 h dans une semaine, les heures sont majorées d’au moins 10 %.</p>
        {c.yearType === 'complete'
          ? <p class="hint">Toute l’année : à la fin du contrat, il n’y a pas de régularisation. Si tu as fait plus d’heures que le salaire lissé n’en paie, la différence n’est pas rattrapée.</p>
          : <p class="hint">Année incomplète : garde tes plannings et tes heures réelles. Ils servent à la régularisation de chaque date anniversaire et de fin de contrat.</p>}
        <p class="hint">Congés payés avec des horaires variables : le maintien de salaire se calcule sur tes heures prévues habituelles de la période (Cour de cassation, 9 mai 2019).</p>
      </fieldset>
    </section>
  );
}

function CycleSaisie({ c, set }: { c: Contract; set: (p: Partial<Contract>) => void }) {
  const cycle = c.cycle?.length ? c.cycle : [structuredClone(c.planning), {}];
  const [ouverte, setOuverte] = useState(0);
  const n = cycle.length;
  const k = Math.min(ouverte, n - 1);
  const setLongueur = (v: string) => {
    const m = Number(v);
    const next = cycle.slice(0, m);
    while (next.length < m) next.push({});
    set({ cycle: next, planning: structuredClone(next[0]) });
  };
  const setSemaine = (i: number, p: Planning) => {
    const next = cycle.map((x, j) => (j === i ? p : x));
    set({ cycle: next, ...(i === 0 ? { planning: structuredClone(p) } : {}) });
  };
  return (
    <div class="stack-sm">
      <Seg label="Nombre de semaines dans le cycle" value={String(n)} onChange={setLongueur}
        options={[{ v: '2', l: '2 semaines' }, { v: '3', l: '3 semaines' }, { v: '4', l: '4 semaines' }]} />
      <Seg label="Semaine à remplir" value={String(k)} onChange={(v) => setOuverte(Number(v))}
        options={cycle.map((p, i) => ({ v: String(i), l: `${NOMS_SEMAINES[i]} · ${hoursLabel(minutesPlanning(p))}` }))} />
      <span class="label">Semaine {NOMS_SEMAINES[k]}</span>
      <span class="hint">Laisse tous les jours éteints pour une semaine sans accueil.</span>
      <SemaineSaisie pl={cycle[k]} onChange={(p) => setSemaine(k, p)} />
      <DateInput label="Un jour d’une semaine A" hint="Une semaine où tu fais les horaires de la semaine A. Le cycle suit ensuite le calendrier, même pendant tes congés et les semaines sans accueil." value={c.cycleAncre ?? ''} onChange={(v) => set({ cycleAncre: v ? mondayOf(v) : undefined })} />
      {c.cycleAncre && <p class="hint">Cette semaine (lundi {shortDate(mondayOf(today()))}) est une semaine {NOMS_SEMAINES[rangCycle({ ...c, cycle }, today())]}.</p>}
    </div>
  );
}

function PlanningsRemis({ c, set }: { c: Contract; set: (p: Partial<Contract>) => void }) {
  const semaines = c.planningsSemaines ?? {};
  const [jour, setJour] = useState('');
  const lundi = jour ? mondayOf(jour) : '';
  const pl = lundi ? semaines[lundi] : undefined;
  const ecrire = (p: Planning | undefined) => {
    const next = { ...semaines };
    if (p === undefined) delete next[lundi]; else next[lundi] = p;
    // Le planning type affiché ailleurs : la première semaine saisie qui a des horaires (indicatif, non utilisé par le calcul).
    const indicatif = Object.keys(next).sort().map((l) => next[l]).find((x) => minutesPlanning(x) > 0);
    set({ planningsSemaines: next, ...(indicatif ? { planning: structuredClone(indicatif) } : {}) });
  };
  const liste = Object.keys(semaines).sort();
  return (
    <div class="stack-sm">
      <p class="hint">Sans planning, l’app ne peut pas calculer un mois, une absence ni un jour de congé. Saisis chaque semaine, même une semaine de congé ou d’absence : celle que tu aurais faite.</p>
      <DateInput label="Choisis un jour de la semaine" hint="L’app prend le lundi de cette semaine." value={jour} onChange={setJour} />
      {lundi && (
        <>
          <span class="label">Semaine du lundi {shortDate(lundi)}</span>
          {pl === undefined ? (
            <div class="btn-row">
              <button type="button" class="btn btn-secondary" onClick={() => ecrire(structuredClone(c.planning))}><Icon name="plus" />Saisir le planning</button>
              <button type="button" class="btn btn-ghost" onClick={() => ecrire({})}>Sans accueil</button>
            </div>
          ) : (
            <>
              {minutesPlanning(pl) === 0 && <p class="hint">Semaine sans accueil (0 h).</p>}
              <SemaineSaisie pl={pl} onChange={ecrire} />
              <div class="btn-row">
                <button type="button" class="btn btn-ghost" onClick={() => ecrire({})}>Sans accueil</button>
                <button type="button" class="btn btn-ghost" onClick={() => ecrire(undefined)}><Icon name="trash" />Retirer cette semaine</button>
              </div>
            </>
          )}
        </>
      )}
      {liste.length > 0 && (
        <div class="chips" style={{ flexWrap: 'wrap' }}>
          {liste.map((l) => (
            <button type="button" class="chip" aria-label={`Ouvrir la semaine du ${shortDate(l)}`} onClick={() => setJour(l)}>
              {shortDate(l)} · {minutesPlanning(semaines[l]) ? hoursLabel(minutesPlanning(semaines[l])) : 'sans accueil'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
