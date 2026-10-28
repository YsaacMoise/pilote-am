import { useEffect, useState, type ReactElement } from 'react';
import { formatLongDate, formatTime, weekday, type ISODate, type Minutes } from '../engine/dates';
import { holidayOn } from '../engine/holidays';
import type { AbsenceReason, Contract, DayEntry, Slot } from '../engine/types';
import { addLeave, AM_REASONS, contractsScheduledOn, inLeave, removeLeave, saveDay, setAbsence, snapshotSlices } from '../actions';
import { childOf } from '../derive';
import { entryFor, getState, logEvent } from '../state';
import { useAppState } from './hooks';
import { ChoiceList, NumberField, Segmented, Sheet, TimeField, toast, Toggle } from './kit';

export const REASONS: Array<{ value: AbsenceReason; label: string; sub: string }> = [
  { value: 'enfant_malade', label: 'Malade', sub: 'Avec certificat, déduit dans la limite prévue. Sans certificat, payé.' },
  { value: 'famille', label: 'Absence voulue par les parents', sub: 'Payée comme prévu' },
  { value: 'am_conges_payes', label: 'Je suis en congés', sub: 'Congés payés, pour tous les enfants' },
  { value: 'am_malade', label: 'Je suis malade', sub: 'Pas payé par la famille' },
  { value: 'am_enfant_malade', label: 'Mon enfant est malade', sub: 'Pas payé par la famille' },
  { value: 'am_sans_solde', label: 'Congé sans solde', sub: 'Pas payé, accord écrit des parents' },
  { value: 'am_evenement_familial', label: 'Événement familial', sub: 'Mariage, naissance, décès : payé' },
];

export function reasonLabel(r: AbsenceReason | undefined): string {
  return REASONS.find((x) => x.value === r)?.label ?? 'Absent';
}

type Mode = 'plan' | 'times' | 'absent';

export function plannedSlots(c: Contract, date: ISODate): Slot[] {
  return [...(c.pattern[weekday(date)] ?? [])].sort((a, b) => a.start - b.start);
}

export function slotsText(slots: Slot[]): string {
  return slots.map((s) => `${formatTime(s.start)} à ${formatTime(s.end)}`).join(', puis ');
}

interface Times {
  a1: Minutes | null;
  d1: Minutes | null;
  a2: Minutes | null;
  d2: Minutes | null;
}

/** Heures de départ du formulaire : celles saisies, sinon celles du planning. */
function initialTimes(entry: DayEntry | undefined, slots: Slot[]): Times {
  if (entry?.arrival !== undefined) {
    return { a1: entry.arrival, d1: entry.departure ?? null, a2: entry.arrival2 ?? null, d2: entry.departure2 ?? null };
  }
  const first = slots[0];
  const second = slots[1];
  if (!first) return { a1: null, d1: null, a2: null, d2: null };
  return { a1: first.start, d1: first.end, a2: second?.start ?? null, d2: second?.end ?? null };
}

/** Correction d'une journée : comme prévu, autres heures, ou absence. */
export function DaySheet(props: { contractId: string; date: ISODate; today: ISODate; open: boolean; onClose: () => void; initialMode?: Mode }): ReactElement | null {
  const s = useAppState();
  const contract = s.contracts.find((c) => c.id === props.contractId);
  const entry = entryFor(s, props.contractId, props.date);
  const slots = contract ? plannedSlots(contract, props.date) : [];
  const leave = inLeave(s, props.date);
  const modeFrom = (e: DayEntry | undefined, onLeave: boolean): Mode =>
    props.initialMode ?? (e?.absence || (onLeave && e?.arrival === undefined) ? 'absent' : e?.arrival !== undefined ? 'times' : 'plan');

  const [mode, setMode] = useState<Mode>(() => modeFrom(entry, leave));
  const [times, setTimes] = useState<Times>(() => initialTimes(entry, slots));
  const [reason, setReason] = useState<AbsenceReason | null>(entry?.absence ?? (leave ? 'am_conges_payes' : null));
  const [certificate, setCertificate] = useState(entry?.certificate === true);
  const [everyone, setEveryone] = useState(true);
  const [leaveAll, setLeaveAll] = useState(true);
  const [meal, setMeal] = useState<boolean>(entry?.meal ?? (contract ? contract.mealCents > 0 : false));
  const [km, setKm] = useState<number | null>(entry?.km ?? null);
  const [holidayWorked, setHolidayWorked] = useState(entry?.holidayWorked === true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    const st = getState();
    const e = entryFor(st, props.contractId, props.date);
    const c = st.contracts.find((x) => x.id === props.contractId);
    const l = inLeave(st, props.date);
    setMode(modeFrom(e, l));
    setTimes(initialTimes(e, c ? plannedSlots(c, props.date) : []));
    setReason(e?.absence ?? (l ? 'am_conges_payes' : null));
    setCertificate(e?.certificate === true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.contractId, props.date, props.initialMode]);

  if (!contract) return null;
  const child = childOf(s, contract);
  const holiday = holidayOn(props.date);
  const past = props.date < props.today;
  const split = slots.length > 1 || times.a2 !== null;
  const changingLeave = leave && !(mode === 'absent' && reason === 'am_conges_payes');

  const extras = (): Pick<DayEntry, 'meal' | 'km' | 'holidayWorked'> => ({
    ...(meal !== contract.mealCents > 0 ? { meal } : {}),
    ...(km ? { km } : {}),
    ...(holiday && holidayWorked ? { holidayWorked: true } : {}),
  });

  const timesEntry = (): Omit<DayEntry, 'contractId' | 'date'> | null => {
    if (times.a1 === null) return null;
    return {
      arrival: times.a1,
      ...(times.d1 !== null ? { departure: times.d1 } : {}),
      ...(times.a2 !== null ? { arrival2: times.a2 } : {}),
      ...(times.a2 !== null && times.d2 !== null ? { departure2: times.d2 } : {}),
      ...extras(),
    };
  };

  const save = (): void => {
    if (mode === 'times') {
      const { a1, d1, a2, d2 } = times;
      if (a1 === null) return setError('Indique l’heure d’arrivée.');
      if (d1 === null && (past || a2 !== null)) return setError('Indique l’heure de départ.');
      if (d1 !== null && d1 < a1) return setError('Le départ est avant l’arrivée.');
      if (a2 !== null && d1 !== null && a2 < d1) return setError('Le retour est avant le premier départ.');
      if (a2 !== null && d2 === null && past) return setError('Indique l’heure du second départ.');
      if (a2 !== null && d2 !== null && d2 < a2) return setError('Le second départ est avant le retour.');
    }
    if (mode === 'absent' && !reason) return setError('Choisis un motif.');

    const undo = snapshotSlices(['entries', 'amLeave']);
    const date = props.date;

    if (changingLeave && leaveAll) removeLeave({ from: date, to: date });

    if (mode === 'plan') {
      const ex = extras();
      if (changingLeave && !leaveAll && slots[0]) {
        // Congé maintenu pour les autres enfants : on écrit la journée prévue pour celui-ci
        saveDay(contract.id, date, { arrival: slots[0].start, departure: slots[0].end, ...(slots[1] ? { arrival2: slots[1].start, departure2: slots[1].end } : {}), ...ex });
      } else {
        saveDay(contract.id, date, Object.keys(ex).length ? ex : null);
      }
    } else if (mode === 'times') {
      saveDay(contract.id, date, timesEntry());
    } else if (reason === 'am_conges_payes') {
      addLeave({ from: date, to: date });
      if (entryFor(getState(), contract.id, date)) saveDay(contract.id, date, null);
    } else if (reason) {
      const ids = AM_REASONS.includes(reason) && everyone ? contractsScheduledOn(getState(), date) : [contract.id];
      setAbsence(ids.includes(contract.id) ? ids : [...ids, contract.id], date, reason, certificate);
    }
    logEvent('journee', mode);
    props.onClose();
    toast('Journée enregistrée', undo);
  };

  const setT = (k: keyof Times) => (v: Minutes | null): void => setTimes((t) => ({ ...t, [k]: v }));
  const title = formatLongDate(props.date).replace(/^./, (c) => c.toUpperCase());

  return (
    <Sheet open={props.open} onClose={props.onClose} title={title} action={{ label: 'Enregistrer', onClick: save }}>
      <p className="sheet-lead">
        {child?.firstName} · {slots.length ? `prévu de ${slotsText(slots)}` : 'pas d’accueil prévu ce jour'}
        {holiday ? ` · ${holiday.name}` : ''}
        {leave ? ' · tu es en congés' : ''}
      </p>
      <Segmented<Mode>
        label="Cette journée"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          if (m === 'times' && times.a1 === null) setTimes(initialTimes(undefined, slots));
        }}
        options={[
          { value: 'plan', label: 'Comme prévu' },
          { value: 'times', label: 'Autres heures' },
          { value: 'absent', label: 'Absence' },
        ]}
      />
      {error && <p className="group-note" role="alert" style={{ color: 'var(--negative)', fontWeight: 600 }}>{error}</p>}

      {mode === 'plan' && (
        <p className="group-note">
          {slots.length
            ? 'Rien à saisir : la journée compte selon le planning du contrat.'
            : 'Aucun accueil ce jour. Choisis « Autres heures » si l’enfant est venu quand même.'}
        </p>
      )}

      {mode === 'times' && (
        <>
          <div className="group" style={{ marginTop: 16 }}>
            <TimeField label="Arrivée" value={times.a1} onChange={setT('a1')} />
            <TimeField label="Départ" value={times.d1} onChange={setT('d1')} />
            {split && <TimeField label="Retour" value={times.a2} onChange={setT('a2')} />}
            {split && <TimeField label="Second départ" value={times.d2} onChange={setT('d2')} />}
          </div>
          <p className="group-note">
            {split ? 'Laisse le retour vide si l’enfant n’est pas revenu. ' : ''}
            {!past ? 'Laisse le départ vide si l’enfant est encore là.' : ''}
          </p>
        </>
      )}

      {mode === 'absent' && (
        <>
          <div style={{ marginTop: 16 }}>
            <ChoiceList<AbsenceReason> label="Motif" value={reason} onChange={setReason} options={REASONS} />
          </div>
          {reason === 'enfant_malade' && (
            <div className="group" style={{ marginTop: 12 }}>
              <Toggle label="Certificat médical reçu" hint="Tu pourras le cocher plus tard" checked={certificate} onChange={setCertificate} />
            </div>
          )}
          {reason && AM_REASONS.includes(reason) && (
            <div className="group" style={{ marginTop: 12 }}>
              <Toggle label="Pour tous les enfants ce jour-là" checked={everyone} onChange={setEveryone} />
            </div>
          )}
        </>
      )}

      {changingLeave && (
        <div className="group" style={{ marginTop: 12 }}>
          <Toggle
            label="Annuler mes congés ce jour pour tous les enfants"
            hint={leaveAll ? 'Le jour ne compte plus en congés' : `Seule la journée de ${child?.firstName} change`}
            checked={leaveAll}
            onChange={setLeaveAll}
          />
        </div>
      )}

      {mode !== 'absent' && (contract.mealCents > 0 || contract.kmMilli > 0 || holiday) && (
        <div className="group" style={{ marginTop: 16 }}>
          {contract.mealCents > 0 && <Toggle label="Repas fourni par moi" checked={meal} onChange={setMeal} />}
          {contract.kmMilli > 0 && <NumberField label="Kilomètres" value={km} onChange={setKm} unit="km" decimals min={0} />}
          {holiday && <Toggle label="Férié travaillé, d’un commun accord" checked={holidayWorked} onChange={setHolidayWorked} />}
        </div>
      )}
    </Sheet>
  );
}
