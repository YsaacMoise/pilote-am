import { useState } from 'preact/hooks';
import { deleteContract, logUsage, putContract, state, toast, uid, useStore } from '../store';
import { firstDay, mondayOf, monthOf, shortDate, today, JOUR_NOMS } from '../engine/dates';
import { daysPerWeek, joursMensualises, mensuelMinutes, salaireMensualise, weeklyMinutes } from '../engine/payroll';
import { entretienPlancher, ratesAt } from '../engine/rates';
import { euros, hoursLabel } from '../engine/money';
import type { Contract, Plage, Planning } from '../engine/model';
import { Banner, CHILD_COLORS, COLOR_NAMES, DateInput, EuroInput, Gommette, NumberInput, Seg, Switch, TextInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

function blank(): Contract {
  const t = today();
  const pl: Planning = {};
  for (let d = 1; d <= 5; d++) pl[d] = [{ start: '08:30', end: '17:30' }];
  return {
    id: uid(), child: '', family: '', color: state.contracts.length % CHILD_COLORS.length, start: t, yearType: 'complete', weeks: 52,
    weeksOff: [], planning: pl, rateNet: ratesAt(t).minConvNet, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: t, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
    history: [], createdAt: Date.now(),
  };
}

export function Contrat({ id }: { id?: string }) {
  useStore();
  const existing = id ? state.contracts.find((c) => c.id === id) : undefined;
  const [c, setC] = useState<Contract>(() => (existing ? structuredClone(existing) : blank()));
  const [errors, setErrors] = useState<string[]>([]);
  const set = (p: Partial<Contract>) => setC({ ...c, ...p });
  const isNew = !existing;
  const curMonthStart = firstDay(monthOf(today()));
  const reprise = c.start < curMonthStart;
  const wk = weeklyMinutes(c.planning);
  const rates = ratesAt(today());

  function setDay(d: number, plages: Plage[]) {
    set({ planning: { ...c.planning, [d]: plages } });
  }

  async function save() {
    const errs: string[] = [];
    if (!c.child.trim()) errs.push('Indique le prénom de l’enfant.');
    if (!c.start) errs.push('Indique la date de début du contrat.');
    if (wk <= 0) errs.push('Le planning est vide : ajoute au moins un jour d’accueil.');
    for (let d = 1; d <= 7; d++) for (const p of c.planning[d] ?? []) if (p.end <= p.start) errs.push(`${JOUR_NOMS[d - 1]} : l’heure de fin doit être après le début.`);
    if (c.yearType === 'incomplete' && (c.weeks < 1 || c.weeks > 46)) errs.push('En année incomplète, le nombre de semaines va de 1 à 46.');
    if (c.end && c.end < c.start) errs.push('La date de fin est avant le début.');
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const toSave: Contract = {
      ...c,
      child: c.child.trim(),
      family: c.family.trim(),
      weeks: c.yearType === 'complete' ? 52 : c.weeks,
      trackedFrom: isNew ? (reprise ? curMonthStart : c.start) : c.trackedFrom < c.start ? c.start : c.trackedFrom,
    };
    const prev = await putContract(toSave);
    logUsage(isNew ? 'contrat_cree' : 'contrat_modifie', 'contrat');
    toast(isNew ? `Contrat de ${toSave.child} créé` : 'Contrat enregistré', prev ? async () => { await putContract(prev); } : async () => { await deleteContract(toSave.id); });
    location.hash = isNew && reprise ? `#/historique/${toSave.id}` : '#/plus';
  }

  return (
    <>
      <Topbar title={isNew ? 'Nouvel enfant' : c.child || 'Contrat'} back="#/plus" screen="contrat" />
      <main>
        {errors.length > 0 && (
          <Banner tone="warn">
            <strong>À compléter</strong>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>{errors.map((e) => <li>{e}</li>)}</ul>
          </Banner>
        )}
        <section class="card">
          <fieldset>
            <legend>L’enfant</legend>
            <TextInput label="Prénom de l’enfant" value={c.child} onChange={(v) => set({ child: v })} autoComplete="off" />
            <TextInput label="Nom de la famille" hint="Le parent qui t’emploie et déclare sur Pajemploi" value={c.family} onChange={(v) => set({ family: v })} />
            <div class="field">
              <span class="label" id="col-l">Sa couleur</span>
              <div class="chips" role="radiogroup" aria-labelledby="col-l">
                {CHILD_COLORS.map((_, i) => (
                  <button class="chip" role="radio" aria-checked={c.color === i} aria-pressed={c.color === i} onClick={() => set({ color: i })} aria-label={COLOR_NAMES[i]}>
                    <Gommette name={c.child || '?'} color={i} size="sm" />
                    <span style={{ fontSize: '15px' }}>{COLOR_NAMES[i]}</span>
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
        </section>

        <section class="card">
          <fieldset>
            <legend>Le contrat</legend>
            <DateInput label="Date de début réelle" hint="Le premier jour d’accueil, même si c’était il y a longtemps" value={c.start} onChange={(v) => set({ start: v })} />
            {!isNew && <DateInput label="Date de fin (si le contrat est terminé)" value={c.end ?? ''} onChange={(v) => set({ end: v || undefined })} />}
            <Seg label="Accueil sur l’année" value={c.yearType} onChange={(v) => set({ yearType: v, weeks: v === 'complete' ? 52 : Math.min(c.weeks, 46) || 46 })}
              options={[{ v: 'complete', l: 'Toute l’année (52 sem.)' }, { v: 'incomplete', l: 'Année incomplète' }]} />
            {c.yearType === 'incomplete' && (
              <>
                <NumberInput label="Semaines d’accueil par an" hint="46 au plus, sans compter tes congés payés" value={c.weeks} min={1} max={46} onChange={(v) => set({ weeks: v ?? 46 })} />
                <WeeksOff c={c} onChange={(w) => set({ weeksOff: w })} />
              </>
            )}
          </fieldset>
        </section>

        <section class="card">
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
        </section>

        <section class="card">
          <fieldset>
            <legend>La rémunération</legend>
            <EuroInput label="Taux horaire net" hint={`Minimum conventionnel : ${euros(rates.minConvNet)} net (${euros(rates.minConvBrut)} brut)`} cents={c.rateNet} onChange={(v) => set({ rateNet: v ?? 0 })} />
            {c.rateNet > 0 && c.rateNet < rates.minConvNet && <Banner tone="warn">Ce taux est sous le minimum conventionnel. Vérifie le contrat.</Banner>}
            <EuroInput label="Indemnité d’entretien par jour" hint={`Si elle est plus basse, l’app applique le minimum légal (${euros(entretienPlancher(today(), 540))} pour 9 h)`} cents={c.entretienJour} onChange={(v) => set({ entretienJour: v ?? 0 })} />
            <div class="grid2">
              <EuroInput label="Prix d’un repas" hint="0 si les parents le fournissent" cents={c.repasPrix} onChange={(v) => set({ repasPrix: v ?? 0 })} />
              <NumberInput label="Repas par jour" value={c.repasParJour} max={4} onChange={(v) => set({ repasParJour: v ?? 0 })} />
            </div>
            <EuroInput label="Indemnité kilométrique (par km)" hint="0 si tu ne transportes pas l’enfant" cents={c.kmTaux} onChange={(v) => set({ kmTaux: v ?? 0 })} />
            <NumberInput label="Majoration après 45 h par semaine (%)" hint="10 % au minimum" value={c.majoration} min={10} max={100} onChange={(v) => set({ majoration: v ?? 10 })} />
            {c.yearType === 'incomplete' && (
              <Seg label="Paiement des congés payés" value={c.cpMode} onChange={(v) => set({ cpMode: v })}
                options={[{ v: 'juin', l: 'En juin' }, { v: 'principale', l: 'À la prise principale' }, { v: 'fur', l: 'Au fur et à mesure' }]} />
            )}
            <Switch label="Enfant en situation de handicap ou de maladie" hint="Abattement fiscal majoré (4 SMIC par jour au lieu de 3)" checked={c.majoreFiscal} onChange={(v) => set({ majoreFiscal: v })} />
          </fieldset>
        </section>

        {(reprise || c.trackedFrom > c.start) && (
          <section class="card">
            <fieldset>
              <legend>Reprise d’un contrat en cours</legend>
              <p class="hint">Le contrat a commencé avant l’app. L’app calcule à partir du {shortDate(isNew ? curMonthStart : c.trackedFrom)} ; pour le passé, reprends tes compteurs et tes bulletins.</p>
              <NumberInput label="Congés restants de l’an dernier (jours)" hint="Acquis avant le dernier 1er juin et pas encore pris" value={c.balances.cpRestants} step={0.5} max={60} onChange={(v) => set({ balances: { ...c.balances, cpRestants: v ?? 0 } })} />
              <NumberInput label="Congés en cours d’acquisition (jours)" hint="Acquis depuis le 1er juin, avant le suivi par l’app" value={c.balances.cpEnCours} step={0.5} max={30} onChange={(v) => set({ balances: { ...c.balances, cpEnCours: v ?? 0 } })} />
              <NumberInput label="Jours d’enfant malade déjà déduits" hint="Sur l’année de contrat en cours (5 au plus)" value={c.balances.maladieDeduits} max={14} onChange={(v) => set({ balances: { ...c.balances, maladieDeduits: v ?? 0 } })} />
              {!isNew && <a class="btn btn-outline" href={`#/historique/${c.id}`}><Icon name="file" />Bulletins passés ({c.history.length})</a>}
            </fieldset>
          </section>
        )}

        <button class="btn btn-primary btn-block btn-lg" onClick={save}>{isNew ? (reprise ? 'Enregistrer et reprendre l’historique' : 'Enregistrer le contrat') : 'Enregistrer'}</button>
        {!isNew && (
          <>
            <a class="btn btn-outline btn-block" href={`#/fin/${c.id}`}><Icon name="door" />Fin de contrat</a>
            <button class="btn btn-danger btn-block" onClick={async () => {
              const undo = await deleteContract(c.id);
              location.hash = '#/plus';
              toast(`Contrat de ${c.child} supprimé`, undo);
            }}><Icon name="trash" />Supprimer ce contrat</button>
          </>
        )}
      </main>
    </>
  );
}

function PlanDay({ d, plages, onChange, onCopy }: { d: number; plages: Plage[]; onChange: (p: Plage[]) => void; onCopy?: () => void }) {
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
  return (
    <div class="stack-sm">
      <span class="label">Semaines sans accueil connues</span>
      <span class="hint">Vacances des parents ou tes congés : ces semaines ne comptent pas dans le planning. Facultatif mais plus précis.</span>
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
