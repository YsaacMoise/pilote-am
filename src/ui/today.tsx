import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { addDays, formatLongDate, formatTime, weekday, type ISODate, type Minutes } from '../engine/dates';
import { resolveDay, type ResolvedDay } from '../engine/schedule';
import type { Contract, DayEntry } from '../engine/types';
import { arrive, daySummary, depart, inLeave, isDaySent, markDaySent, napSince, timeline } from '../actions';
import { initialsOf, kidClass } from '../derive';
import { shareText } from '../share';
import { activeContract, entryFor, logEvent, update, type AppState, type Child } from '../state';
import { backupDue, backupNow } from './settings';
import { NotePanel } from './carnet';
import { DaySheet, reasonLabel } from './day';
import { useAppState, useClock } from './hooks';
import { Icon } from './icons';
import { Banner, Empty, Group, Magnet, Row, Screen, Sheet, toast, useNav } from './kit';

type KidState = 'here' | 'expected' | 'left' | 'done' | 'absent' | 'off';

export interface KidToday {
  child: Child;
  contract: Contract;
  entry: DayEntry | undefined;
  day: ResolvedDay;
  state: KidState;
  start: Minutes | null;
  end: Minutes | null;
  /** Attendu pour le retour d'une journée coupée (après l'école) */
  returning: boolean;
}

export function kidsToday(s: AppState, today: ISODate, now: Minutes): KidToday[] {
  const out: KidToday[] = [];
  for (const child of s.children) {
    const contract = activeContract(s, child.id, today);
    if (!contract) continue;
    const raw = entryFor(s, contract.id, today);
    // Tes congés comptent comme une absence, sauf si des heures ont été saisies
    const entry: DayEntry | undefined = raw?.arrival === undefined && inLeave(s, today)
      ? { contractId: contract.id, date: today, absence: 'am_conges_payes' }
      : raw;
    const day = resolveDay(contract, today, entry, { today, nowMinutes: now });
    const slots = [...(contract.pattern[weekday(today)] ?? [])].sort((a, b) => a.start - b.start);
    const plannedToday = day.scheduled > 0;
    let start = plannedToday && slots[0] ? slots[0].start : null;
    const end = plannedToday && slots.length ? Math.max(...slots.map((x) => x.end)) : null;
    let state: KidState;
    let returning = false;
    if (day.status === 'absence') state = 'absent';
    else if (entry?.arrival2 !== undefined) state = entry.departure2 === undefined ? 'here' : 'left';
    else if (entry?.arrival !== undefined && entry.departure === undefined) state = 'here';
    else if (entry?.arrival !== undefined) {
      const second = slots[1];
      if (second && entry.departure !== undefined && entry.departure <= second.start && now < second.end) {
        state = 'expected';
        returning = true;
        start = second.start;
      } else state = 'left';
    } else if (plannedToday && day.status === 'accueil') state = end !== null && now >= end ? 'done' : 'expected';
    else state = 'off';
    out.push({ child, contract, entry, day, state, start, end, returning });
  }
  return out;
}

interface Scale {
  from: Minutes;
  to: Minutes;
  ticks: Minutes[];
}

function scaleFor(kids: KidToday[], now: Minutes): Scale {
  let from = Infinity;
  let to = -Infinity;
  for (const k of kids) {
    for (const s of k.contract.pattern[weekday(k.day.date)] ?? []) {
      from = Math.min(from, s.start);
      to = Math.max(to, s.end);
    }
    if (k.entry?.arrival !== undefined) from = Math.min(from, k.entry.arrival);
    if (k.entry?.departure !== undefined) to = Math.max(to, k.entry.departure);
    if (k.state === 'here') to = Math.max(to, now);
  }
  if (!Number.isFinite(from)) {
    from = 7 * 60;
    to = 19 * 60;
  }
  from = Math.floor(from / 60) * 60;
  to = Math.ceil(to / 60) * 60;
  if (to - from < 8 * 60) to = from + 8 * 60;
  const ticks: Minutes[] = [];
  const span = to - from;
  const step = span > 12 * 60 ? 240 : 180;
  for (let t = from + step; t < to - 60; t += step) ticks.push(t);
  return { from, to, ticks };
}

function pct(scale: Scale, t: Minutes): string {
  const v = ((t - scale.from) / (scale.to - scale.from)) * 100;
  return `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;
}

function Thread({ k, scale, now }: { k: KidToday; scale: Scale; now: Minutes }): ReactElement {
  const slots = k.day.scheduled > 0 ? k.contract.pattern[weekday(k.day.date)] ?? [] : [];
  const e = k.entry;
  const periods: Array<{ from: Minutes; to: Minutes }> = [];
  if (e?.arrival !== undefined) {
    const open1 = e.departure === undefined && e.arrival2 === undefined;
    const to1 = e.departure ?? (open1 && k.state === 'here' ? now : undefined);
    if (to1 !== undefined) periods.push({ from: e.arrival, to: to1 });
  }
  if (e?.arrival2 !== undefined) {
    const to2 = e.departure2 ?? (k.state === 'here' ? now : undefined);
    if (to2 !== undefined) periods.push({ from: e.arrival2, to: to2 });
  }
  const last = periods[periods.length - 1];
  const over = k.end !== null && last && last.to > k.end ? { from: Math.max(k.end, last.from), to: last.to } : null;
  const w = (from: Minutes, to: Minutes): string => `calc(${pct(scale, to)} - ${pct(scale, from)})`;
  return (
    <div className={`thread ${kidClass(k.child)}`} aria-hidden="true">
      <div className="thread-track" />
      {scale.ticks.map((t) => <div key={t} className="thread-tick" style={{ left: pct(scale, t) }} />)}
      {slots.map((sl) => <div key={sl.start} className="thread-plan" style={{ left: pct(scale, sl.start), width: w(sl.start, sl.end) }} />)}
      {periods.map((p) => {
        const to = over && p === last ? over.from : p.to;
        return <div key={p.from} className="thread-done" style={{ left: pct(scale, p.from), width: w(p.from, to) }} />;
      })}
      {over && <div className="thread-over" style={{ left: pct(scale, over.from), width: w(over.from, over.to) }} />}
      {k.state === 'here' && <div className="thread-live" style={{ left: pct(scale, now) }} />}
      <div className="thread-now" style={{ left: pct(scale, now) }} />
    </div>
  );
}

function ScaleRow({ scale }: { scale: Scale }): ReactElement {
  const marks = [scale.from, ...scale.ticks, scale.to];
  return (
    <div className="thread-scale" aria-hidden="true">
      {marks.map((t) => (
        <span key={t} style={{ left: pct(scale, t) }}>{formatTime(t)}</span>
      ))}
    </div>
  );
}

function dur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')}`;
}

function subtitle(k: KidToday, now: Minutes, s: AppState): string {
  const nap = napSince(s, k.child.id, k.day.date);
  switch (k.state) {
    case 'here': {
      const arr = formatTime(k.entry?.arrival2 ?? k.entry?.arrival ?? 0);
      if (nap !== null) return `Sieste depuis ${formatTime(nap)}`;
      if (k.end === null) return `Là depuis ${arr}`;
      if (now > k.end) return `+${dur(now - k.end)} après ${formatTime(k.end)}`;
      return `${arr} → ${formatTime(k.end)}`;
    }
    case 'expected':
      if (k.returning) return `Retour ${formatTime(k.start ?? 0)} → ${formatTime(k.end ?? 0)}`;
      return k.start !== null && k.end !== null ? `${formatTime(k.start)} → ${formatTime(k.end)}` : 'Prévu aujourd’hui';
    case 'left':
      return `${formatTime(k.entry?.arrival ?? 0)} → ${formatTime(k.entry?.departure2 ?? k.entry?.departure ?? 0)}`;
    case 'done':
      return k.start !== null && k.end !== null ? `${formatTime(k.start)} → ${formatTime(k.end)}` : 'Comme prévu';
    case 'absent':
      return k.entry?.absence === 'enfant_malade' && !k.entry.certificate ? 'Malade · certificat à recevoir' : reasonLabel(k.day.absence);
    default:
      return k.day.status === 'ferie_chome' ? 'Férié' : k.day.status === 'non_accueil' ? 'Semaine sans accueil' : 'Pas prévu aujourd’hui';
  }
}

/** Phrase complète pour les lecteurs d'écran. */
function spoken(k: KidToday, now: Minutes, s: AppState): string {
  const short = subtitle(k, now, s);
  const text = short.replace(/→/g, k.state === 'here' ? ', départ prévu à' : k.state === 'expected' ? 'à' : '→').replace(/^\+(.*) après/, '$1 de plus que prévu, départ prévu à');
  const lead = k.state === 'here' && !short.startsWith('+') ? 'arrivée à ' : k.state === 'expected' ? 'prévu de ' : k.state === 'left' || k.state === 'done' ? 'parti, de ' : '';
  return `${k.child.firstName}, ${lead}${text}. Ouvrir la fiche.`;
}

export function TodayScreen(): ReactElement {
  const s = useAppState();
  const { today, minutes: now } = useClock();
  const nav = useNav();
  const kids = useMemo(() => kidsToday(s, today, now), [s, today, now]);
  const [open, setOpen] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);
  const [fix, setFix] = useState<{ contractId: string; date: ISODate } | null>(null);
  const closeFix = useCallback(() => setFix(null), []);
  const forgotten = s.entries
    .filter((e) => !e.absence && e.date < today && e.date >= addDays(today, -14)
      && ((e.arrival !== undefined && e.departure === undefined && e.arrival2 === undefined) || (e.arrival2 !== undefined && e.departure2 === undefined)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const closeKid = useCallback(() => setOpen(null), []);
  const closeNote = useCallback(() => setNoting(false), []);

  const by = (st: KidState): KidToday[] => kids.filter((k) => k.state === st);
  const here = by('here');
  const expected = by('expected').sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const left = [...by('left'), ...by('done')];
  const absent = by('absent');
  const off = by('off');
  const timed = [...here, ...expected, ...left];
  const scale = scaleFor(timed, now);

  const doArrive = (k: KidToday): void => {
    const undo = arrive(k.contract.id, today, now);
    logEvent('today', 'arrivee');
    toast(`${k.returning ? 'Retour' : 'Arrivée'} de ${k.child.firstName} à ${formatTime(now)}`, undo);
  };
  const doDepart = (k: KidToday): void => {
    const undo = depart(k.contract.id, today, now);
    logEvent('today', 'depart');
    toast(`Départ de ${k.child.firstName} à ${formatTime(now)}`, undo);
  };

  const sendDay = async (k: KidToday): Promise<void> => {
    const outcome = await shareText(daySummary(s, k.child.id, k.contract.id, today));
    if (outcome === 'shared' || outcome === 'copied') {
      markDaySent(k.child.id, today);
      logEvent('today', 'journee-envoyee');
      if (outcome === 'copied') toast('Texte copié, colle-le dans ton message');
    }
  };

  if (s.contracts.length === 0) {
    return (
      <Screen title="Aujourd’hui" subtitle={formatLongDate(today).replace(/^./, (c) => c.toUpperCase())}>
        <Empty title="Aucun enfant pour l’instant">
          <p>Ajoute un premier contrat : le planning se remplira tout seul ensuite.</p>
          <button className="btn btn-primary" onClick={() => nav.push({ name: 'contract' })}>Ajouter un contrat</button>
        </Empty>
      </Screen>
    );
  }

  const kidRow = (k: KidToday, action: ReactElement | null, showThread = true): ReactElement => (
    <div className={`row with-avatar kid-row ${kidClass(k.child)}`} key={k.child.id}>
      <Magnet
        name={k.child.firstName}
        initials={initialsOf(s, k.child)}
        color={kidClass(k.child)}
        state={k.state === 'expected' || k.state === 'off' ? 'waiting' : k.state === 'here' ? 'here' : 'gone'}
        onClick={() => setOpen(k.child.id)}
        label={`Ouvrir la fiche de ${k.child.firstName}`}
        decorative
      />
      <div className="kid-body">
        <div className="kid-head">
          <button className="kid-open" onClick={() => setOpen(k.child.id)} aria-label={spoken(k, now, s)}>
            <span className="row-title">{k.child.firstName}</span>
            <span className="row-sub one-line">{subtitle(k, now, s)}</span>
          </button>
          {action}
        </div>
        {showThread && <Thread k={k} scale={scale} now={now} />}
      </div>
    </div>
  );

  const next = expected[0] ?? [...here].sort((a, b) => (a.end ?? 1e9) - (b.end ?? 1e9))[0];
  const present = here.map((k) => k.child.id);
  const showDock = kids.some((k) => k.state !== 'off' || k.entry?.arrival !== undefined);
  const openKid = kids.find((k) => k.child.id === open);

  return (
    <>
      <Screen title="Aujourd’hui" subtitle={`${formatLongDate(today).replace(/^./, (c) => c.toUpperCase())}, ${formatTime(now)}`}>
        {backupDue(s, today) && s.settings.lastBackupPromptDay !== today && (s.journal[0]?.at.slice(0, 10) ?? today) <= addDays(today, -3) && (
          <Banner tone="warn">
            <p><strong>Sauvegarde de la semaine.</strong> Tes données ne sont que sur ce téléphone : mets-en une copie dans Fichiers.</p>
            <div className="banner-actions">
              <button className="btn btn-primary" onClick={() => void backupNow().then((ok) => ok && toast('Sauvegarde enregistrée'))}>Sauvegarder</button>
              <button className="btn btn-plain" onClick={() => update((st) => ({ ...st, settings: { ...st.settings, lastBackupPromptDay: today } }))}>Plus tard</button>
            </div>
          </Banner>
        )}
        {forgotten.map((e) => {
          const c = s.contracts.find((x) => x.id === e.contractId);
          const child = c ? s.children.find((x) => x.id === c.childId) : undefined;
          return (
            <Banner tone="warn" key={`${e.contractId}-${e.date}`}>
              <p><strong>Départ de {child?.firstName} non noté</strong> {formatLongDate(e.date)} : compté jusqu’à l’heure prévue.</p>
              <div className="banner-actions">
                <button className="btn btn-soft" onClick={() => setFix({ contractId: e.contractId, date: e.date })}>Corriger</button>
              </div>
            </Banner>
          );
        })}
        {here.length > 0 && (
          <Group title="Chez toi" header={<ScaleRow scale={scale} />}>
            {here.map((k) => kidRow(k, <button className="btn btn-soft" onClick={() => doDepart(k)}>Départ</button>))}
          </Group>
        )}
        {expected.length > 0 && (
          <Group title="Attendus" {...(here.length === 0 ? { header: <ScaleRow scale={scale} /> } : {})}>
            {expected.map((k) => kidRow(k, <button className="btn btn-primary" onClick={() => doArrive(k)}>{k.returning ? 'Retour' : 'Arrivée'}</button>))}
          </Group>
        )}
        {left.length > 0 && (
          <Group title="Partis">
            {left.map((k) =>
              kidRow(
                k,
                isDaySent(s, k.child.id, today) ? (
                  <span className="status status-ok">Envoyée</span>
                ) : timeline(s, k.child.id, k.contract.id, today).length === 0 ? null : (
                  <button className="btn btn-soft" onClick={() => void sendDay(k)}>
                    Envoyer
                  </button>
                ),
                false,
              ),
            )}
          </Group>
        )}
        {absent.length > 0 && (
          <Group title="Absents">
            {absent.map((k) => kidRow(k, null, false))}
          </Group>
        )}
        {off.length > 0 && (
          <Group title="Pas prévus aujourd’hui" note="Un enfant est là quand même ? Touche « Arrivée » : les heures comptent en plus.">
            {off.map((k) => kidRow(k, <button className="btn btn-soft" onClick={() => doArrive(k)}>Arrivée</button>, false))}
          </Group>
        )}
        {kids.length === 0 && (
          <Banner>
            <p>Aucun contrat en cours aujourd’hui.</p>
          </Banner>
        )}
      </Screen>

      {showDock && (
        <div className="dock" role="region" aria-label="Actions rapides">
          <div className="dock-next">
            {next ? (
              <>
                <Magnet name={next.child.firstName} initials={initialsOf(s, next.child)} color={kidClass(next.child)} small state={next.state === 'here' ? 'here' : 'waiting'} />
                <span className="row-main">
                  <span className="dock-label">{next.child.firstName}</span>
                  <span className="dock-sub">
                    {next.state === 'here'
                      ? next.end !== null ? (now > next.end ? `+${dur(now - next.end)}` : `part à ${formatTime(next.end)}`) : 'présent'
                      : next.start !== null ? `arrive à ${formatTime(next.start)}` : 'attendu'}
                  </span>
                </span>
                {next.state === 'here' ? (
                  <button className="btn btn-soft" onClick={() => doDepart(next)}>Départ</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => doArrive(next)}>{next.returning ? 'Retour' : 'Arrivée'}</button>
                )}
              </>
            ) : (
              <span className="dock-sub">Tout le monde est passé</span>
            )}
          </div>
          <button className="btn btn-soft" onClick={() => setNoting(true)} disabled={present.length === 0} aria-label="Noter pour les enfants présents">
            <Icon name="plus" size={18} stroke={2.4} />
            Noter
          </button>
        </div>
      )}

      {fix && <DaySheet contractId={fix.contractId} date={fix.date} today={today} open onClose={closeFix} initialMode="times" />}
      {openKid && <ChildSheet k={openKid} today={today} now={now} onClose={closeKid} onSend={() => void sendDay(openKid)} />}
      <Sheet open={noting} onClose={closeNote} title="Noter pour…">
        <p className="sheet-lead">{present.length > 1 ? 'Tous les enfants présents sont cochés. Touche une pastille pour l’enlever.' : `Pour ${here[0]?.child.firstName ?? ''}.`}</p>
        {noting && <NotePanel childIds={present} date={today} now={now} multi />}
      </Sheet>
    </>
  );
}

function ChildSheet(props: { k: KidToday; today: ISODate; now: Minutes; onClose: () => void; onSend: () => void }): ReactElement {
  const s = useAppState();
  const { k } = props;
  const [dayOpen, setDayOpen] = useState<null | 'times' | 'absent' | 'plan'>(null);
  const items = timeline(s, k.child.id, k.contract.id, props.today);
  const sent = isDaySent(s, k.child.id, props.today);
  const closeDay = useCallback(() => setDayOpen(null), []);

  return (
    <>
      <Sheet open onClose={props.onClose} title={k.child.firstName} hideTitle>
        <div className="sheet-head">
          <Magnet name={k.child.firstName} initials={initialsOf(s, k.child)} color={kidClass(k.child)} state={k.state === 'here' ? 'here' : k.state === 'expected' || k.state === 'off' ? 'waiting' : 'gone'} />
          <div>
            <h2 aria-hidden="true">{k.child.firstName}</h2>
            <div className="row-sub">{subtitle(k, props.now, s)}</div>
          </div>
        </div>

        {(k.state === 'here' || k.state === 'left') && (
          <>
            <h3 className="group-title">Noter</h3>
            <NotePanel childIds={[k.child.id]} date={props.today} now={props.now} />
          </>
        )}

        {items.length > 0 && (
          <Group title="Sa journée">
            {items.map((it, i) => (
              <Row
                key={`${it.time}-${i}`}
                leading={<span className="row-time">{formatTime(it.time)}</span>}
                title={it.title}
                {...(it.detail ? { sub: it.detail } : {})}
                {...(it.kind === 'arrivee' || it.kind === 'depart' ? { onClick: () => setDayOpen('times') } : {})}
              />
            ))}
          </Group>
        )}

        <Group title="Autre chose">
          {k.state === 'expected' && <Row title="Absence aujourd’hui" onClick={() => setDayOpen('absent')} />}
          {k.state === 'expected' && <Row title="Heure d’arrivée différente" onClick={() => setDayOpen('times')} />}
          {(k.state === 'here' || k.state === 'left' || k.state === 'done') && <Row title="Corriger les heures" onClick={() => setDayOpen('times')} />}
          {k.state === 'absent' && <Row title="Changer le motif" onClick={() => setDayOpen('absent')} />}
          {k.state === 'absent' && <Row title="Là finalement" onClick={() => setDayOpen('plan')} />}
          {k.state === 'off' && <Row title="Là quand même aujourd’hui" onClick={() => setDayOpen('times')} />}
        </Group>

        {(k.state === 'here' || k.state === 'left' || k.state === 'done') && (
          <div className="actions">
            <button className="btn btn-primary btn-block" onClick={props.onSend} disabled={items.length === 0}>
              <Icon name="share" size={20} />
              {sent ? 'Renvoyer la journée' : 'Envoyer la journée aux parents'}
            </button>
          </div>
        )}
      </Sheet>
      {dayOpen && (
        <DaySheet contractId={k.contract.id} date={props.today} today={props.today} open onClose={closeDay} initialMode={dayOpen} />
      )}
    </>
  );
}
