import { useState } from 'preact/hooks';
import { activeContracts, ctxFor, logUsage, putLeave, saveSettings, state, toast, uid, updateDay, useStore } from '../store';
import { addDays, dayLabel, minutes, nowHHMM, today, weekday, JOUR_NOMS, MOIS_NOMS, daysBetween } from '../engine/dates';
import { dayInfo, type DayInfo } from '../engine/payroll';
import { AM_ABS_LABEL, CHILD_ABS_LABEL, type AmAbs, type ChildAbs, type Contract, type DayRec, type Presence } from '../engine/model';
import { hoursLabel } from '../engine/money';
import { Banner, CHILD_COLORS, Choices, DateInput, Gommette, Sheet, Stepper, Switch, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

const fmtH = (t: string) => t.replace(/^0(\d)/, '$1').replace(':', ' h ');

function planText(di: DayInfo): string {
  if (!di.planned.length) return 'Pas d’accueil prévu';
  return 'Prévu ' + di.planned.map((p) => `${fmtH(p.start)} – ${fmtH(p.end)}`).join(' et ');
}

export function Today() {
  const s = useStore();
  const t = today();
  const [day, setDay] = useState(t);
  const [edit, setEdit] = useState<Contract | null>(null);
  const [amSheet, setAmSheet] = useState(false);
  const kids = s.contracts.filter((c) => c.start <= day && (!c.end || c.end >= day));
  const base = day < addDays(t, -5) ? addDays(day, 5) : t;
  const days = Array.from({ length: 7 }, (_, i) => addDays(base, i - 5));

  // Départs oubliés sur les 14 derniers jours
  const forgotten: { c: Contract; d: string }[] = [];
  for (const c of activeContracts()) {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(t, -i);
      if (dayInfo(ctxFor(c), d).departOublie) forgotten.push({ c, d });
    }
  }
  const lastBackup = s.settings.lastBackup;
  const backupDue = s.contracts.length > 0 && (!lastBackup || Date.now() - lastBackup > 7 * 86400000);
  const amToday = s.leaves.find((l) => day >= l.from && day <= l.to);

  return (
    <>
      <Topbar title={day === t ? 'Aujourd’hui' : dayLabel(day).replace(/^./, (x) => x.toUpperCase())} sub={day === t ? dayLabel(day) : day < t ? `il y a ${daysBetween(day, t)} jour${daysBetween(day, t) > 1 ? 's' : ''}` : 'à venir'} screen="aujourdhui" />
      <main>
        <nav aria-label="Choisir le jour" class="daystrip">
          {days.map((d) => {
            const flag = s.contracts.some((c) => dayInfo(ctxFor(c), d).departOublie);
            return (
              <button aria-pressed={d === day} onClick={() => setDay(d)}>
                <span class="d-name">{d === t ? 'auj.' : JOUR_NOMS[weekday(d) - 1].slice(0, 3)}</span>{' '}
                <span class="d-num">{Number(d.slice(8))}</span>
                <span class="sr-only"> {MOIS_NOMS[Number(d.slice(5, 7)) - 1]}{flag ? ', départ non pointé' : ''}</span>
                <span class={`d-dot ${flag ? 'on' : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        {amToday && (
          <Banner tone="info" icon="sun">
            <strong>{AM_ABS_LABEL[amToday.type]}</strong>
            <span>Du {dayLabel(amToday.from)} au {dayLabel(amToday.to)}, pour tous les enfants.</span>
          </Banner>
        )}

        {kids.length === 0 && (
          <div class="card empty">
            <h2>{s.contracts.length ? 'Aucun contrat ce jour-là' : 'Ajoute ton premier enfant'}</h2>
            <p class="muted">Le planning du contrat remplit les journées tout seul. Tu n’auras qu’à noter ce qui change.</p>
            {!s.contracts.length && <a class="btn btn-primary btn-lg" href="#/contrat/nouveau"><Icon name="plus" />Ajouter un enfant</a>}
          </div>
        )}

        {kids.length > 1 && (
          <div class="seg view-switch" role="radiogroup" aria-label="Affichage des enfants">
            <button role="radio" aria-checked={!s.settings.compact} onClick={() => { saveSettings({ compact: false }); logUsage('vue_cartes', 'aujourdhui'); }}>Cartes</button>
            <button role="radio" aria-checked={!!s.settings.compact} onClick={() => { saveSettings({ compact: true }); logUsage('vue_liste', 'aujourdhui'); }}>Liste</button>
          </div>
        )}
        {s.settings.compact && kids.length > 1 ? (
          <div class="kid-list">
            {kids.map((c) => <KidCard c={c} day={day} compact onEdit={() => setEdit(c)} />)}
          </div>
        ) : (
          kids.map((c) => <KidCard c={c} day={day} onEdit={() => setEdit(c)} />)
        )}
        {day === t && forgotten.length > 0 && (
          <Banner tone="warn">
            <strong>{forgotten.length === 1 ? 'Un départ n’a pas été pointé' : `${forgotten.length} départs n’ont pas été pointés`}</strong>
            <span>
              {forgotten.slice(0, 3).map((f) => `${f.c.child} le ${dayLabel(f.d)}`).join(', ')}. L’heure prévue est retenue en attendant.
            </span>
            <div class="btn-row">
              <button class="btn btn-outline" onClick={() => setDay(forgotten[0].d)}>Corriger</button>
            </div>
          </Banner>
        )}

        {day === t && backupDue && (
          <Banner tone="info" icon="shield">
            <strong>Pense à ta sauvegarde de la semaine</strong>
            <span>Une copie dans Fichiers protège tes données si le téléphone est perdu.</span>
            <div class="btn-row"><a class="btn btn-outline" href="#/sauvegarde">Sauvegarder</a></div>
          </Banner>
        )}


        {s.contracts.length > 0 && (
          <button class="btn btn-outline btn-block" onClick={() => setAmSheet(true)}>
            <Icon name="calendar" />Je serai absente
          </button>
        )}
      </main>
      {edit && <DaySheet c={edit} day={day} onClose={() => setEdit(null)} />}
      {amSheet && <AmAbsenceSheet start={day} onClose={() => setAmSheet(false)} />}
    </>
  );
}

function nextAction(di: DayInfo, rec: DayRec | undefined): { idx: number; kind: 'a' | 'd' } | null {
  const pres = rec?.pres ?? [];
  const n = Math.max(di.planned.length, 1);
  for (let i = 0; i < n; i++) {
    const p = pres[i];
    if (!p?.a) return { idx: i, kind: 'a' };
    if (!p.d) return { idx: i, kind: 'd' };
  }
  return null;
}

function KidCard({ c, day, onEdit, compact }: { c: Contract; day: string; onEdit: () => void; compact?: boolean }) {
  const t = today();
  const di = dayInfo(ctxFor(c), day);
  const rec = di.rec;
  const color = CHILD_COLORS[c.color % CHILD_COLORS.length];
  const tags: { tone: string; text: string }[] = [];
  let action: { label: string; icon: 'in' | 'out'; run: () => void; quiet?: boolean } | null = null;

  const pres = (rec?.pres ?? []).filter((p) => p.a);
  for (const p of pres) {
    tags.push({ tone: 'ok', text: `Arrivée ${fmtH(p.a!)}` });
    if (p.d) tags.push({ tone: 'ok', text: `Départ ${fmtH(p.d)}` });
  }
  if (di.extraMin > 0 && !di.enCours) tags.push({ tone: 'info', text: `+${hoursLabel(di.extraMin)} en plus` });
  if (di.departOublie) tags.push({ tone: 'warn', text: 'Départ non pointé' });
  if (di.kind === 'absent' && rec?.abs) {
    tags.push({ tone: 'info', text: CHILD_ABS_LABEL[rec.abs] });
    tags.push({ tone: di.deducted ? 'warn' : 'ok', text: di.deducted ? 'Retenu sur le salaire' : 'Payé' });
  }
  if (di.kind === 'ferie') tags.push({ tone: 'info', text: `Férié : ${di.ferie} (payé)` });
  if (di.kind === 'am' && di.amLeave) tags.push({ tone: 'info', text: AM_ABS_LABEL[di.amLeave] });
  if (di.kind === 'prevu' && day < t) tags.push({ tone: 'ok', text: 'Comme prévu' });

  const canPoint = day === t && (di.kind === 'prevu' || di.kind === 'present' || (di.kind === 'hors' && !di.planned.length));
  if (canPoint) {
    const na = nextAction(di, rec);
    if (na) {
      const isArr = na.kind === 'a';
      action = {
        label: isArr ? (di.planned.length || pres.length ? 'Arrivée' : 'Imprévu') : 'Départ',
        quiet: !di.planned.length && !pres.length,
        icon: isArr ? 'in' : 'out',
        run: async () => {
          const now = nowHHMM();
          const undo = await updateDay(c.id, day, (r) => {
            const p: Presence[] = [...(r.pres ?? [])];
            while (p.length <= na.idx) p.push({});
            p[na.idx] = isArr ? { a: now } : { ...p[na.idx], d: now };
            return { ...r, pres: p, extra: di.planned.length ? r.extra : true };
          });
          logUsage(isArr ? 'arrivee' : 'depart', 'aujourdhui');
          let extra = '';
          if (!isArr) {
            const plage = di.planned[na.idx];
            if (plage && minutes(now) > minutes(plage.end)) extra = ` (+${hoursLabel(minutes(now) - minutes(plage.end))})`;
          }
          toast(`${isArr ? 'Arrivée' : 'Départ'} de ${c.child} à ${fmtH(now)}${extra}`, undo);
        },
      };
    }
  }

  if (compact) {
    // Une ligne par enfant : pastille, prénom, l'état le plus utile, et le bouton du moment
    const status = tags.length ? tags[tags.length - 1].text : planText(di);
    return (
      <article class="kid-row" style={{ '--g': color } as any} aria-label={c.child}>
        <button class="kid-row-main" onClick={onEdit} aria-label={`${c.child} : ${planText(di)}${tags.length ? ', ' + tags.map((x) => x.text).join(', ') : ''}. Modifier la journée`}>
          <Gommette name={c.child} color={c.color} size="sm" />
          <span class="kid-row-text">
            <span class="kid-row-name">{c.child}</span>
            <span class="kid-row-status">{status}</span>
          </span>
        </button>
        {action && (
          <button class={action.quiet ? 'btn btn-outline' : 'btn btn-primary'} onClick={action.run} aria-label={`${action.label} de ${c.child}`}>
            <Icon name={action.icon} />{action.label}
          </button>
        )}
      </article>
    );
  }

  return (
    <article class="kid" style={{ '--g': color } as any} aria-label={c.child}>
      <div class="kid-head">
        <Gommette name={c.child} color={c.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div class="kid-name">{c.child}</div>
          <div class="kid-plan">{planText(di)}</div>
        </div>
      </div>
      {tags.length > 0 && (
        <div class="kid-status">
          {tags.map((x) => <span class={`tag ${x.tone}`}>{x.text}</span>)}
        </div>
      )}
      <div class="kid-actions" style={!action ? { gridTemplateColumns: '1fr' } : undefined}>
        {action && (
          <button class={action.quiet ? 'btn btn-outline' : 'btn btn-primary btn-lg'} onClick={action.run} aria-label={action.quiet ? `Accueil imprévu : arrivée de ${c.child}` : undefined}>
            <Icon name={action.icon} />{action.label}
          </button>
        )}
        <button class={`btn btn-edit ${action && !action.quiet ? 'btn-secondary btn-lg' : 'btn-secondary'}`} onClick={onEdit} aria-label={`${action ? 'Modifier' : day > t ? 'Prévoir une absence' : 'Modifier la journée'} (${c.child})`}>
          <Icon name="edit" />{action ? 'Modifier' : day > t ? 'Prévoir une absence' : 'Modifier la journée'}
        </button>
      </div>
    </article>
  );
}

const CHILD_ABS_OPTIONS: { v: ChildAbs | 'none'; l: string; sub?: string }[] = [
  { v: 'none', l: 'Présent', sub: 'Accueilli normalement' },
  { v: 'malade_certif', l: CHILD_ABS_LABEL.malade_certif, sub: 'Retenu sur le salaire dans la limite de 5 jours par an (ou 14 jours d’affilée)' },
  { v: 'malade', l: CHILD_ABS_LABEL.malade, sub: 'Payé' },
  { v: 'parents', l: CHILD_ABS_LABEL.parents, sub: 'Payé' },
  { v: 'sans_solde_enfant', l: CHILD_ABS_LABEL.sans_solde_enfant, sub: 'Retenu sur le salaire' },
];

export function DaySheet({ c, day, onClose }: { c: Contract; day: string; onClose: () => void }) {
  const di = dayInfo(ctxFor(c), day);
  const rec = di.rec;
  const slots = Math.max(di.planned.length, rec?.pres?.length ?? 0, 1);
  const init: Presence[] = Array.from({ length: slots }, (_, i) => ({
    a: rec?.pres?.[i]?.a ?? di.planned[i]?.start ?? '',
    d: rec?.pres?.[i]?.d ?? di.planned[i]?.end ?? '',
  }));
  const [pres, setPres] = useState<Presence[]>(init);
  const [abs, setAbs] = useState<ChildAbs | 'none'>(rec?.abs ?? 'none');
  const [repas, setRepas] = useState<number>(rec?.repas ?? c.repasParJour);
  const [km, setKm] = useState<number>(rec?.km ?? 0);
  const [ferieT, setFerieT] = useState<boolean>(!!rec?.ferieTravaille);
  const [err, setErr] = useState('');
  const future = day > today();

  async function save() {
    for (const p of pres) {
      if (p.a && p.d && p.d <= p.a) { setErr('L’heure de départ doit être après l’arrivée.'); return; }
    }
    const samePlan = pres.every((p, i) => di.planned[i] && p.a === di.planned[i].start && p.d === di.planned[i].end) && pres.length === di.planned.length;
    const undo = await updateDay(c.id, day, (r) => {
      const next: DayRec = { ...r };
      if (abs !== 'none') { next.abs = abs; delete next.pres; }
      else {
        delete next.abs;
        if (samePlan || future) delete next.pres;
        else next.pres = pres.filter((p) => p.a).map((p) => ({ a: p.a, d: p.d || undefined }));
        if (!di.planned.length && next.pres?.length) next.extra = true;
      }
      if (repas !== c.repasParJour) next.repas = repas; else delete next.repas;
      if (km) next.km = km; else delete next.km;
      if (ferieT) next.ferieTravaille = true; else delete next.ferieTravaille;
      return next;
    });
    logUsage('journee_modifiee', 'aujourdhui');
    onClose();
    toast(`Journée de ${c.child} enregistrée`, undo);
  }

  return (
    <Sheet title={`${c.child}, ${dayLabel(day)}`} onClose={onClose}>
      <p class="muted">{planText(di)}</p>
      {di.ferie && <Switch label={`Jour férié (${di.ferie}) travaillé`} hint={day.endsWith('05-01') ? '1er mai : payé double' : 'Majoré de 10 %'} checked={ferieT} onChange={setFerieT} />}
      <Choices label="Ce jour-là" value={abs} options={CHILD_ABS_OPTIONS} onChange={setAbs} />
      {abs === 'none' && !future && (
        <fieldset>
          <legend>Heures réelles</legend>
          {pres.map((p, i) => (
            <div class="grid2">
              <div class="field">
                <label for={`a${i}`}>Arrivée{pres.length > 1 ? ` (${i + 1})` : ''}</label>
                <input id={`a${i}`} class="input num" type="time" value={p.a} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setPres(pres.map((x, j) => (j === i ? { ...x, a: v } : x))); setErr(''); }} />
              </div>
              <div class="field">
                <label for={`d${i}`}>Départ{pres.length > 1 ? ` (${i + 1})` : ''}</label>
                <input id={`d${i}`} class="input num" type="time" value={p.d} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setPres(pres.map((x, j) => (j === i ? { ...x, d: v } : x))); setErr(''); }} />
              </div>
            </div>
          ))}
          {err && <p class="err" role="alert">{err}</p>}
          {pres.length < 2 && <button class="btn btn-ghost" onClick={() => setPres([...pres, { a: '', d: '' }])}><Icon name="plus" />Ajouter une plage</button>}
          {di.planned.length > 0 && (
            <button class="btn btn-ghost" onClick={() => setPres(di.planned.map((p) => ({ a: p.start, d: p.end })))}><Icon name="undo" />Revenir au planning</button>
          )}
        </fieldset>
      )}
      {abs === 'none' && !future && (
        <>
          {c.repasPrix > 0 && <Stepper label="Repas fournis" value={repas} onChange={setRepas} max={4} />}
          {c.kmTaux > 0 && <Stepper label="Kilomètres" value={km} onChange={setKm} max={500} unit="km" />}
        </>
      )}
      <button class="btn btn-primary btn-block btn-lg" onClick={save}>Enregistrer</button>
    </Sheet>
  );
}

const AM_OPTIONS: { v: AmAbs; l: string; sub: string }[] = [
  { v: 'cp', l: AM_ABS_LABEL.cp, sub: 'Décomptés de ton compteur de congés' },
  { v: 'am_malade', l: AM_ABS_LABEL.am_malade, sub: 'Non payé par les parents (indemnités de la Sécurité sociale)' },
  { v: 'am_enfant_malade', l: AM_ABS_LABEL.am_enfant_malade, sub: 'Non payé (3 jours par an, 5 dans certains cas)' },
  { v: 'evenement', l: AM_ABS_LABEL.evenement, sub: 'Mariage, naissance, décès… : payé sur justificatif' },
  { v: 'sans_solde', l: AM_ABS_LABEL.sans_solde, sub: 'Non payé, avec l’accord des parents' },
];

export function AmAbsenceSheet({ start, onClose }: { start: string; onClose: () => void }) {
  const [type, setType] = useState<AmAbs>('cp');
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(start);
  const err = to < from ? 'La date de fin doit être après le début.' : '';
  return (
    <Sheet title="Je serai absente" onClose={onClose}>
      <p class="muted">Pour tous les enfants. Les parents ne te paient pas les jours non payés : l’app fait la retenue toute seule.</p>
      <Choices label="Raison" value={type} options={AM_OPTIONS} onChange={setType} />
      <div class="grid2">
        <DateInput label="Du" value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} />
        <DateInput label="Au (inclus)" value={to} min={from} onChange={setTo} />
      </div>
      {err && <p class="err" role="alert">{err}</p>}
      <button
        class="btn btn-primary btn-block btn-lg"
        disabled={!!err || !from || !to}
        onClick={async () => {
          const undo = await putLeave({ id: uid(), type, from, to });
          logUsage('absence_am', 'aujourdhui');
          onClose();
          toast(`${AM_ABS_LABEL[type]} enregistré${type === 'cp' ? 's' : ''}`, undo);
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}

export { state };
