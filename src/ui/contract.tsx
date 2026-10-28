import { useState, type ReactElement } from 'react';
import { formatHours, formatLongDate, parseTime, weekdayNameFR, yearMonth, type ISODate, type Minutes, type Weekday } from '../engine/dates';
import { formatEuros, formatRate, type Cents, type Milli } from '../engine/money';
import { mensualisation } from '../engine/month';
import { rateOn } from '../engine/rates';
import { weeklyMinutes } from '../engine/schedule';
import type { Contract, CpPaymentMode, DateRange, EntretienRule, Slot, WeeklyPattern, YearType } from '../engine/types';
import { deleteContract, mergeRanges } from '../actions';
import { KID_COLORS, nextKidColor } from '../derive';
import { logEvent, newId, todayISO, update } from '../state';
import { useAppState } from './hooks';
import { Icon } from './icons';
import {
  Banner, ChoiceList, DateField, Group, MoneyField, NumberField, RateField, Row, Screen, Segmented,
  TextField, toast, Toggle, useNav,
} from './kit';

const DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function hhmm(m: Minutes): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function rangeText(r: DateRange): string {
  return `du ${formatLongDate(r.from)} au ${formatLongDate(r.to)}`;
}

/** Saisie d'un contrat par l'assistante maternelle elle-même, en une page. */
export function ContractScreen({ contractId }: { contractId?: string }): ReactElement {
  const s = useAppState();
  const nav = useNav();
  const existing = s.contracts.find((c) => c.id === contractId);
  const existingChild = existing ? s.children.find((c) => c.id === existing.childId) : undefined;
  const existingFamily = existing ? s.families.find((f) => f.id === existing.familyId) : undefined;

  const [childName, setChildName] = useState(existingChild?.firstName ?? '');
  const [birthDate, setBirthDate] = useState(existingChild?.birthDate ?? '');
  const [color, setColor] = useState(existingChild?.color ?? nextKidColor(s));
  const [familyName, setFamilyName] = useState(existingFamily?.name ?? '');
  const [parents, setParents] = useState(existingFamily?.parentNames ?? '');
  const [phone, setPhone] = useState(existingFamily?.phone ?? '');
  const [startDate, setStartDate] = useState<ISODate>(existing?.startDate ?? todayISO());
  const [yearType, setYearType] = useState<YearType>(existing?.yearType ?? 'complete');
  const [weeks, setWeeks] = useState<number | null>(existing?.programmedWeeks ?? 46);
  const [nonAccueil, setNonAccueil] = useState<DateRange[]>(existing?.nonAccueil ?? []);
  const [naFrom, setNaFrom] = useState('');
  const [naTo, setNaTo] = useState('');
  const [pattern, setPattern] = useState<WeeklyPattern>(existing?.pattern ?? {});
  const [rate, setRate] = useState<Milli | null>(existing?.hourlyNetMilli ?? null);
  const [majoration, setMajoration] = useState<number | null>(existing?.majorationPct ?? 10);
  const [compPct, setCompPct] = useState<number | null>(existing?.complementaryPct ?? 0);
  const [entretienKind, setEntretienKind] = useState<EntretienRule['kind']>(existing?.entretien.kind ?? 'minimum');
  const [entretienHour, setEntretienHour] = useState<Milli | null>(existing?.entretien.kind === 'perHour' ? existing.entretien.milli : null);
  const [entretienDay, setEntretienDay] = useState<Cents | null>(existing?.entretien.kind === 'perDay' ? existing.entretien.cents : null);
  const [meal, setMeal] = useState<Cents | null>(existing?.mealCents ?? null);
  const [km, setKm] = useState<Milli | null>(existing?.kmMilli ?? null);
  const [cpMode, setCpMode] = useState<CpPaymentMode>(existing?.cpPaymentMode ?? 'juin');
  const [adaptation, setAdaptation] = useState(existing?.adaptationEnd ?? '');
  const [childMaj, setChildMaj] = useState(existing?.childMajoration ?? false);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const setDay = (d: Weekday, slots: Slot[] | null): void => {
    setPattern((p) => {
      const next = { ...p };
      if (slots && slots.length) next[d] = slots;
      else delete next[d];
      return next;
    });
  };

  const draft = (): Contract | null => {
    if (rate === null) return null;
    const entretien: EntretienRule =
      entretienKind === 'perHour' ? { kind: 'perHour', milli: entretienHour ?? 0 }
        : entretienKind === 'perDay' ? { kind: 'perDay', cents: entretienDay ?? 0 }
          : { kind: 'minimum' };
    return {
      id: existing?.id ?? 'brouillon',
      childId: existing?.childId ?? '',
      familyId: existing?.familyId ?? '',
      startDate,
      ...(existing?.endDate ? { endDate: existing.endDate } : {}),
      yearType,
      programmedWeeks: yearType === 'complete' ? 52 : weeks ?? 46,
      nonAccueil: yearType === 'complete' ? [] : nonAccueil,
      pattern,
      hourlyNetMilli: rate,
      majorationPct: majoration ?? 10,
      complementaryPct: compPct ?? 0,
      entretien,
      mealCents: meal ?? 0,
      kmMilli: km ?? 0,
      cpPaymentMode: cpMode,
      ...(adaptation ? { adaptationEnd: adaptation } : {}),
      childMajoration: childMaj,
    };
  };

  const weekly = weeklyMinutes(pattern);
  const preview = draft();
  const mens = preview && weekly > 0 ? mensualisation(preview) : null;
  let minRate: Milli | null = null;
  try {
    minRate = rateOn(s.profile?.hasProfessionalTitle ? 'SALAIRE_MIN_NET_TITRE' : 'SALAIRE_MIN_NET', startDate > todayISO() ? startDate : todayISO());
  } catch {
    minRate = null;
  }

  const save = (): void => {
    const errs: string[] = [];
    if (!childName.trim()) errs.push('Le prénom de l’enfant');
    if (!familyName.trim()) errs.push('Le nom de la famille');
    if (!startDate) errs.push('La date de début');
    if (weekly === 0) errs.push('Au moins un jour d’accueil dans le planning');
    if (rate === null || rate <= 0) errs.push('Le salaire horaire net');
    if (yearType === 'incomplete' && (!weeks || weeks < 1 || weeks > 46)) errs.push('Le nombre de semaines d’accueil (46 au plus)');
    if (entretienKind === 'perHour' && !entretienHour) errs.push('Le montant d’entretien par heure');
    if (entretienKind === 'perDay' && !entretienDay) errs.push('Le montant d’entretien par jour');
    for (const d of DAYS) {
      const sl = pattern[d] ?? [];
      const bad = sl.some((x) => x.end <= x.start) || (sl[0] !== undefined && sl[1] !== undefined && sl[1].start < sl[0].end);
      if (bad) errs.push(`Les horaires du ${weekdayNameFR(d)} (la seconde plage doit commencer après la première)`);
    }
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const base = draft();
    if (!base) return;
    const isNew = !existing;
    const familyId = existing?.familyId
      ?? s.families.find((f) => f.name.trim().toLowerCase() === familyName.trim().toLowerCase())?.id
      ?? newId();
    const childId = existing?.childId ?? newId();
    const contract: Contract = { ...base, id: existing?.id ?? newId(), childId, familyId };
    update((st) => {
      const family = { id: familyId, name: familyName.trim(), parentNames: parents.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) };
      const prevChild = st.children.find((c) => c.id === childId);
      const child = { ...(prevChild ?? {}), id: childId, familyId, firstName: childName.trim(), color, ...(birthDate ? { birthDate } : {}) };
      return {
        ...st,
        families: [...st.families.filter((f) => f.id !== familyId), family],
        children: [...st.children.filter((c) => c.id !== childId), child],
        contracts: [...st.contracts.filter((c) => c.id !== contract.id), contract],
      };
    });
    logEvent('contrat', isNew ? 'cree' : 'modifie');
    nav.pop();
    if (isNew && yearMonth(contract.startDate) < yearMonth(todayISO())) {
      nav.push({ name: 'history', contractId: contract.id });
    } else {
      toast(isNew ? 'Contrat enregistré' : 'Contrat mis à jour');
    }
  };

  const [confirmRemove, setConfirmRemove] = useState(false);
  const remove = (): void => {
    if (!existing) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    const undo = deleteContract(existing.id);
    nav.pop();
    toast('Contrat supprimé', undo);
  };

  const firstDay = DAYS.find((d) => pattern[d]?.length);

  return (
    <Screen title={existing ? 'Contrat' : 'Nouveau contrat'} back={existing ? 'Réglages' : 'Retour'}>
      {errors.length > 0 && (
        <Banner tone="bad">
          <p><strong>À compléter :</strong></p>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Banner>
      )}

      <Group title="L’enfant">
        <TextField label="Prénom" value={childName} onChange={setChildName} placeholder="Prénom" />
        <DateField label="Date de naissance" hint="Facultatif" value={birthDate} onChange={setBirthDate} />
        <div className="row">
          <span className="row-main"><span>Couleur</span></span>
          <div className="kid-picker" style={{ padding: 0, gap: 8 }} role="radiogroup" aria-label="Couleur">
            {KID_COLORS.map((k) => (
              <button key={k} role="radio" aria-checked={color === k} aria-label={`Couleur ${k.slice(4)}`} className="swatch" onClick={() => setColor(k)}>
                <span className={`magnet small ${k}`} style={color === k ? { outline: '3px solid var(--tint)', outlineOffset: 2, width: 32, height: 32, fontSize: 14 } : { width: 32, height: 32, fontSize: 14 }} aria-hidden="true">
                  {color === k ? (childName.trim()[0] ?? '').toUpperCase() : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group title="La famille">
        <TextField label="Nom de famille" value={familyName} onChange={setFamilyName} placeholder="Moreau" />
        <TextField label="Prénoms des parents" hint="Facultatif" value={parents} onChange={setParents} placeholder="Julie et Marc" />
        <TextField label="Téléphone" hint="Facultatif" type="tel" value={phone} onChange={setPhone} placeholder="06…" />
      </Group>

      <Group title="Dates" note="La vraie date de début du contrat, même si c’était avant l’app : l’historique se complète juste après.">
        <DateField label="Début du contrat" value={startDate} onChange={setStartDate} />
        <DateField label="Fin de l’adaptation" hint="Facultatif" value={adaptation} onChange={setAdaptation} />
      </Group>

      <h2 className="group-title">L’année</h2>
      <Segmented<YearType>
        label="Type d’année"
        value={yearType}
        onChange={setYearType}
        options={[{ value: 'complete', label: '52 semaines' }, { value: 'incomplete', label: '46 semaines ou moins' }]}
      />
      <p className="group-note">
        {yearType === 'complete'
          ? 'L’enfant vient toute l’année ; tes congés sont pris pendant les siens ou payés.'
          : 'L’enfant ne vient pas certaines semaines (vacances des parents, tes congés).'}
      </p>
      {yearType === 'incomplete' && (
        <>
          <div className="group" style={{ marginTop: 12 }}>
            <NumberField label="Semaines d’accueil par an" value={weeks} onChange={setWeeks} min={1} max={46} />
          </div>
          <Group title="Semaines sans accueil prévues" note="Celles que tu connais déjà. Tu pourras en ajouter plus tard.">
            {nonAccueil.map((r) => (
              <Row
                key={r.from}
                title={rangeText(r)}
                value={<button className="btn btn-plain" style={{ color: 'var(--negative)' }} onClick={() => setNonAccueil(nonAccueil.filter((x) => x !== r))}>Retirer</button>}
              />
            ))}
            <DateField label="Du" value={naFrom} onChange={setNaFrom} />
            <DateField label="Au" value={naTo} onChange={setNaTo} min={naFrom} />
            <div className="row">
              <button
                className="btn btn-soft"
                disabled={!naFrom || !naTo || naTo < naFrom}
                onClick={() => {
                  setNonAccueil(mergeRanges([...nonAccueil, { from: naFrom, to: naTo }]));
                  setNaFrom('');
                  setNaTo('');
                }}
              >
                <Icon name="plus" size={18} stroke={2.4} /> Ajouter ces semaines
              </button>
            </div>
          </Group>
          <h2 className="group-title">Paiement de tes congés</h2>
          <ChoiceList<CpPaymentMode>
            label="Paiement des congés"
            value={cpMode}
            onChange={setCpMode}
            options={[
              { value: 'juin', label: 'En une fois en juin' },
              { value: 'prise_principale', label: 'À la prise des congés principaux' },
              { value: 'au_fur_et_a_mesure', label: 'Au fur et à mesure des congés pris' },
            ]}
          />
          <p className="group-note">Comme écrit dans le contrat. Payer un douzième ou 10 % chaque mois n’est pas autorisé.</p>
        </>
      )}

      <h2 className="group-title">Le planning d’une semaine</h2>
      <div className="group">
        {DAYS.map((d) => {
          const slots = pattern[d] ?? [];
          const on = slots.length > 0;
          return (
            <div className="row" key={d} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div className="day-plan">
                <label className="day-name" htmlFor={`day-${d}`} style={{ textTransform: 'capitalize' }}>{weekdayNameFR(d)}</label>
                <div className="times">
                  {on ? (
                    <>
                      <input type="time" aria-label={`${weekdayNameFR(d)}, arrivée`} value={hhmm(slots[0]?.start ?? 480)} onChange={(e) => { const v = parseTime(e.target.value); if (v !== null) setDay(d, [{ start: v, end: slots[0]?.end ?? 1020 }, ...slots.slice(1)]); }} />
                      à
                      <input type="time" aria-label={`${weekdayNameFR(d)}, départ`} value={hhmm(slots[0]?.end ?? 1020)} onChange={(e) => { const v = parseTime(e.target.value); if (v !== null) setDay(d, [{ start: slots[0]?.start ?? 480, end: v }, ...slots.slice(1)]); }} />
                    </>
                  ) : (
                    <span>pas d’accueil</span>
                  )}
                </div>
                <input
                  id={`day-${d}`}
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={on}
                  aria-label={`Accueil le ${weekdayNameFR(d)}`}
                  onChange={(e) => {
                    const model = firstDay !== undefined ? pattern[firstDay] : undefined;
                    setDay(d, e.target.checked ? (model ? model.map((x) => ({ ...x })) : [{ start: 480, end: 1050 }]) : null);
                  }}
                />
              </div>
              {on && slots[1] && (
                <div className="day-plan">
                  <span className="day-name" style={{ fontWeight: 400, color: 'var(--muted)' }}>puis</span>
                  <div className="times">
                    <input type="time" aria-label={`${weekdayNameFR(d)}, retour`} value={hhmm(slots[1].start)} onChange={(e) => { const v = parseTime(e.target.value); if (v !== null) setDay(d, [slots[0] as Slot, { start: v, end: slots[1]?.end ?? 1080 }]); }} />
                    à
                    <input type="time" aria-label={`${weekdayNameFR(d)}, second départ`} value={hhmm(slots[1].end)} onChange={(e) => { const v = parseTime(e.target.value); if (v !== null) setDay(d, [slots[0] as Slot, { start: slots[1]?.start ?? 960, end: v }]); }} />
                  </div>
                  <button className="btn btn-plain" style={{ color: 'var(--negative)' }} onClick={() => setDay(d, [slots[0] as Slot])}>Retirer</button>
                </div>
              )}
              {on && !slots[1] && (
                <button className="btn btn-plain" style={{ alignSelf: 'flex-end', fontWeight: 500 }} onClick={() => setDay(d, [slots[0] as Slot, { start: Math.min(1439, (slots[0]?.end ?? 720) + 120), end: Math.min(1439, (slots[0]?.end ?? 720) + 240) }])}>
                  Ajouter une 2e plage (école…)
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="group-note">
        {weekly > 0 ? `${formatHours(weekly)} par semaine${weekly > 45 * 60 ? ', dont des heures majorées au-delà de 45 h' : ''}.` : 'Coche les jours où l’enfant vient.'}
      </p>

      <Group title="Salaire">
        <RateField label="Salaire horaire net" milli={rate} onChange={setRate} placeholder="3,80" unit="€ / h" {...(minRate ? { hint: `Minimum actuel : ${formatRate(minRate)} net` } : {})} />
        {weekly > 45 * 60 && <NumberField label="Majoration au-delà de 45 h" value={majoration} onChange={setMajoration} unit="%" min={10} max={100} />}
      </Group>
      {rate !== null && minRate !== null && rate < minRate && (
        <Banner tone="warn"><p>Ce taux est sous le minimum conventionnel net ({formatRate(minRate)} de l’heure). Vérifie le contrat.</p></Banner>
      )}
      {mens && (
        <p className="group-note">
          Salaire de base : {formatEuros(mens.cents)} net par mois, pour {formatHours(Math.round(mens.minutes))} en moyenne.
        </p>
      )}

      <h2 className="group-title">Indemnité d’entretien</h2>
      <ChoiceList<EntretienRule['kind']>
        label="Indemnité d’entretien"
        value={entretienKind}
        onChange={setEntretienKind}
        options={[
          { value: 'minimum', label: 'Le minimum légal', sub: 'Calculé chaque jour selon les heures' },
          { value: 'perHour', label: 'Un montant par heure' },
          { value: 'perDay', label: 'Un montant par jour' },
        ]}
      />
      {entretienKind === 'perHour' && (
        <div className="group" style={{ marginTop: 12 }}><RateField label="Par heure" milli={entretienHour} onChange={setEntretienHour} placeholder="0,435" /></div>
      )}
      {entretienKind === 'perDay' && (
        <div className="group" style={{ marginTop: 12 }}><MoneyField label="Par jour" cents={entretienDay} onChange={setEntretienDay} placeholder="4,00" /></div>
      )}

      <Group title="Repas et trajets" note="Laisse vide si les parents fournissent les repas ou s’il n’y a pas de trajets.">
        <MoneyField label="Repas, par jour" cents={meal} onChange={setMeal} placeholder="0,00" />
        <RateField label="Kilomètres, par km" milli={km} onChange={setKm} placeholder="0,00" />
      </Group>

      {!more ? (
        <div className="actions"><button className="btn btn-plain" onClick={() => setMore(true)}>Plus d’options</button></div>
      ) : (
        <Group title="Plus d’options">
          <NumberField label="Majoration des heures complémentaires" hint="0 sauf si le contrat en prévoit une" value={compPct} onChange={setCompPct} unit="%" min={0} max={100} />
          {weekly <= 45 * 60 && <NumberField label="Majoration au-delà de 45 h" value={majoration} onChange={setMajoration} unit="%" min={10} max={100} />}
          <Toggle label="Enfant en situation de handicap ou longue maladie" hint="Case spéciale de la déclaration Pajemploi" checked={childMaj} onChange={setChildMaj} />
        </Group>
      )}

      <div className="actions">
        <button className="btn btn-primary btn-block" onClick={save}>
          {existing ? 'Enregistrer' : 'Créer le contrat'}
        </button>
        {existing && (
          <>
            <button className="btn btn-plain" onClick={() => nav.push({ name: 'history', contractId: existing.id })}>Historique avant l’app</button>
            <button className="btn btn-plain" onClick={() => nav.push({ name: 'fin', contractId: existing.id })}>Fin de contrat</button>
            <button className="btn btn-plain" style={{ color: 'var(--negative)' }} onClick={remove}>{confirmRemove ? 'Toucher encore pour supprimer définitivement' : 'Supprimer ce contrat'}</button>
          </>
        )}
      </div>
    </Screen>
  );
}
