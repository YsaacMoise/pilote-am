import { useCallback, useState, type ReactElement } from 'react';
import { addMonthsYM, formatTime, formatYearMonth, monthNameFR, weekday, yearMonth, type ISODate, type YearMonth } from '../engine/dates';
import { formatEuros } from '../engine/money';
import type { MonthResult } from '../engine/month';
import type { ResolvedDay } from '../engine/schedule';
import { SICKNESS_INTERPRETATION } from '../engine/sickness';
import { childOf, contractsInMonth, familyOf, initialsOf, kidClass, ledgerFor } from '../derive';
import { familyRecapText, recapRows } from '../recap';
import { shareText } from '../share';
import { logEvent, update, type AppState } from '../state';
import { DaySheet, reasonLabel } from './day';
import { useAppState, useClock } from './hooks';
import { KidPicker } from './kidpicker';
import { Icon } from './icons';
import { Banner, Empty, Group, Magnet, Row, Screen, toast, useNav } from './kit';

/** Mois et enfant choisis, gardés le temps de la journée (oubliés le lendemain) */
const memo: { ym: YearMonth | null; contractId: string | null; day: ISODate | null } = { ym: null, contractId: null, day: null };

function cap(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

function defaultMonth(s: AppState, today: ISODate): YearMonth {
  const current = yearMonth(today);
  const prev = addMonthsYM(current, -1);
  const day = Number(today.slice(8, 10));
  if (day <= 10) {
    const pending = contractsInMonth(s, prev).some((c) => !s.sent.some((x) => x.contractId === c.id && x.month === prev && !x.provisional));
    if (pending) return prev;
  }
  return current;
}

export function dayClass(d: ResolvedDay, today: ISODate): string {
  const parts = ['cal-day'];
  if (d.status === 'hors_contrat') parts.push('off', 'empty-day');
  else if (d.status === 'repos' || d.status === 'non_accueil') parts.push('off');
  else if (d.status === 'ferie_chome') parts.push('holiday');
  else if (d.status === 'absence') parts.push('absent');
  else if (d.status === 'accueil') parts.push(d.date > today || (d.date === today && d.presumed) ? 'plan' : 'care');
  if (d.entry?.arrival !== undefined) parts.push('edited');
  if (d.date === today) parts.push('today');
  return parts.join(' ');
}

function dayLabel(d: ResolvedDay): string {
  const n = Number(d.date.slice(8, 10));
  const base = `${n === 1 ? '1er' : n}`;
  switch (d.status) {
    case 'absence': return `${base}, ${reasonLabel(d.absence)}`;
    case 'ferie_chome': return `${base}, férié`;
    case 'accueil':
      if (d.entry?.arrival !== undefined) return `${base}, ${formatTime(d.entry.arrival)} à ${d.entry.departure !== undefined ? formatTime(d.entry.departure) : 'en cours'}`;
      return `${base}, ${d.provisional ? 'prévu' : 'accueil comme prévu'}`;
    case 'hors_contrat': return `${base}, hors contrat`;
    default: return `${base}, pas d’accueil`;
  }
}

function summary(m: MonthResult, deducted: Set<ISODate>, today: ISODate): string {
  let care = 0;
  let ahead = 0;
  let sick = 0;
  let sickDeducted = 0;
  let other = 0;
  for (const d of m.days) {
    if (d.status === 'accueil') {
      if (d.date > today || (d.date === today && d.presumed)) ahead += 1;
      else care += 1;
    } else if (d.status === 'absence') {
      if (d.absence === 'enfant_malade') {
        sick += 1;
        if (deducted.has(d.date)) sickDeducted += 1;
      } else if (d.absence !== 'am_conges_payes') other += 1;
    }
  }
  const parts = [`${care} jour${care > 1 ? 's' : ''} d’accueil`];
  if (sick) parts.push(`${sick} jour${sick > 1 ? 's' : ''} malade${sickDeducted ? ` (${sickDeducted} déduit${sickDeducted > 1 ? 's' : ''})` : ''}`);
  if (other) parts.push(`${other} autre${other > 1 ? 's' : ''} absence${other > 1 ? 's' : ''}`);
  if (ahead) parts.push(`${ahead} jour${ahead > 1 ? 's' : ''} à venir`);
  return parts.join(' · ');
}

export function Calendar(props: { m: MonthResult; today: ISODate; color: string; onDay: (date: ISODate) => void }): ReactElement {
  const first = props.m.days[0];
  const blanks = first ? weekday(first.date) : 0;
  return (
    <div className={`cal ${props.color}`} role="group" aria-label={`Journées de ${formatYearMonth(props.m.month)}`}>
      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="cal-head" aria-hidden="true">{d}</div>)}
      {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}
      {props.m.days.map((d) => {
        const n = Number(d.date.slice(8, 10));
        const disabled = d.status === 'hors_contrat';
        return (
          <button key={d.date} className={dayClass(d, props.today)} aria-label={dayLabel(d)} disabled={disabled} onClick={() => props.onDay(d.date)}>
            <span>{d.status === 'accueil' && (d.date > props.today || (d.date === props.today && d.presumed)) ? <b>{n}</b> : n}</span>
            <span className="cal-dot" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function MonthScreen(): ReactElement {
  const s = useAppState();
  const { today, minutes } = useClock();
  const nav = useNav();
  if (memo.day !== today) {
    memo.ym = null;
    memo.contractId = null;
    memo.day = today;
  }
  const [ym, setYmState] = useState<YearMonth>(memo.ym ?? defaultMonth(s, today));
  const [cid, setCidState] = useState<string | null>(memo.contractId);
  const [day, setDay] = useState<ISODate | null>(null);
  const closeDay = useCallback(() => setDay(null), []);
  const setYm = (v: YearMonth): void => {
    memo.ym = v;
    setYmState(v);
  };
  const setCid = (v: string): void => {
    memo.contractId = v;
    setCidState(v);
  };

  const contracts = contractsInMonth(s, ym);
  const contract = contracts.find((c) => c.id === cid) ?? contracts[0];
  const [y, mo] = ym.split('-').map(Number) as [number, number];
  const prevName = monthNameFR(Number(addMonthsYM(ym, -1).slice(5)));
  const nextName = monthNameFR(Number(addMonthsYM(ym, 1).slice(5)));

  const header = (
    <div className="month-nav">
      <button className="bar-action" onClick={() => setYm(addMonthsYM(ym, -1))} aria-label={`Mois précédent, ${prevName}`}>
        <Icon name="back" size={20} stroke={2.4} /> {cap(prevName)}
      </button>
      <button className="bar-action" onClick={() => setYm(addMonthsYM(ym, 1))} aria-label={`Mois suivant, ${nextName}`}>
        {cap(nextName)} <Icon name="chevron" size={20} stroke={2.4} />
      </button>
    </div>
  );

  if (!contract) {
    return (
      <Screen title={cap(`${monthNameFR(mo)} ${y}`)}>
        {header}
        <Empty title="Aucun contrat ce mois-ci">
          {s.contracts.length === 0 && <button className="btn btn-primary" onClick={() => nav.push({ name: 'contract' })}>Ajouter un contrat</button>}
        </Empty>
      </Screen>
    );
  }

  const child = childOf(s, contract);
  const family = familyOf(s, contract);
  const ledger = ledgerFor(s, contract, today, ym, minutes);
  const m = ledger.months.get(ym);
  const familyContracts = contracts.filter((c) => c.familyId === contract.familyId);
  const sent = s.sent.find((x) => x.contractId === contract.id && x.month === ym);
  const control = s.controls.find((x) => x.contractId === contract.id && x.month === ym);

  const send = async (): Promise<void> => {
    const results = familyContracts
      .map((c) => ledgerFor(s, c, today, ym, minutes).months.get(ym))
      .filter((r): r is MonthResult => r !== undefined);
    const outcome = await shareText(familyRecapText(s, results), `Pajemploi ${formatYearMonth(ym)}`);
    if (outcome === 'shared' || outcome === 'copied') {
      const at = new Date().toISOString();
      update((st) => ({
        ...st,
        sent: [
          ...st.sent.filter((x) => !(results.some((r) => r.contractId === x.contractId) && x.month === ym)),
          ...results.map((r) => ({ contractId: r.contractId, month: ym, sentAt: at, totalCents: r.totalCents, ...(r.provisional ? { provisional: true } : {}) })),
        ],
      }));
      logEvent('mois', 'recap-envoye');
      toast(outcome === 'copied' ? 'Texte copié, colle-le dans ton message' : 'Récapitulatif envoyé');
    }
  };

  const missing = m?.days.filter((d) => d.missingDeparture) ?? [];
  const sentDay = sent ? new Date(sent.sentAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const finalSent = sent && !sent.provisional;
  const status = finalSent
    ? <span className="status status-ok">Envoyé le {sentDay}</span>
    : sent && !m?.provisional
      ? <span className="status status-todo">Estimation du {sentDay}, final à envoyer</span>
    : sent
      ? <span className="status status-info">Estimation envoyée le {sentDay}</span>
    : m?.provisional
      ? <span className="status status-info">En cours</span>
      : <span className="status status-todo">À envoyer</span>;
  const changedSinceSent = finalSent && m && sent.totalCents !== m.totalCents;

  return (
    <>
      <Screen title={cap(`${monthNameFR(mo)} ${y}`)}>
        {header}
        <KidPicker s={s} contracts={contracts} value={contract.id} onChange={setCid} />

        {!m ? (
          <Banner>
            <p>Ce mois est antérieur au suivi dans l’app.</p>
            {ledger.history.get(ym) ? (
              <p>Repris du bulletin : salaire net {formatEuros(ledger.history.get(ym)?.netSalaryCents ?? 0)}.</p>
            ) : (
              <p>Il manque dans l’historique : utile pour les congés et la fin de contrat.</p>
            )}
            <div className="banner-actions">
              <button className="btn btn-soft" onClick={() => nav.push({ name: 'history', contractId: contract.id })}>Compléter l’historique</button>
            </div>
          </Banner>
        ) : (
          <>
            {(missing.length > 0 || m.warnings.length > 0 || changedSinceSent) && (
              <Banner tone="warn">
                {missing.map((d) => (
                  <p key={d.date}>
                    <strong>Départ oublié le {Number(d.date.slice(8))}</strong> : compté jusqu’à l’heure prévue.{' '}
                    <button className="btn btn-soft" style={{ marginTop: 6 }} onClick={() => setDay(d.date)}>Corriger</button>
                  </p>
                ))}
                {changedSinceSent && <p>Le total a changé depuis l’envoi ({formatEuros(sent.totalCents)}). Renvoie le récapitulatif.</p>}
                {m.warnings.map((w) => <p key={w}>{w}</p>)}
              </Banner>
            )}

            <Group title={`À déclarer pour ${child?.firstName ?? ''}`}>
              <div className="row row-total">
                <span className="row-main">
                  <span className="row-title">Total versé {m.provisional ? 'prévu' : ''}</span>
                  <span>{status}</span>
                </span>
                <span className="total">{formatEuros(m.totalCents)}</span>
              </div>
              {recapRows(m).map((r) => (
                <Row key={r.label} title={r.label} value={/^(Heures|Jours)/.test(r.label) ? `${r.value} ${r.label.startsWith('Heures') ? 'h' : 'j'}` : r.value} strong />
              ))}
            </Group>
            {m.provisional && <p className="group-note">Mois en cours : les jours à venir sont comptés selon le planning. Les montants s’ajustent chaque jour.</p>}
            <div className="actions">
              <button className={`btn btn-block ${finalSent || m.provisional ? 'btn-soft' : 'btn-primary'}`} onClick={() => void send()}>
                <Icon name="share" size={20} />
                {m.provisional ? 'Envoyer une estimation' : finalSent ? 'Renvoyer' : 'Envoyer'} {family ? `aux ${family.name}` : 'aux parents'}
              </button>
              <button className="btn btn-plain" onClick={() => nav.push({ name: 'detail', contractId: contract.id, month: ym })}>
                Voir le détail du calcul
              </button>
            </div>

            <Group title="Les journées" note={summary(m, ledger.sickness.deductible, today)}>
              <Calendar m={m} today={today} color={kidClass(child)} onDay={setDay} />
              <div className={`cal-legend ${kidClass(child)}`} aria-hidden="true">
                <span><i className="lg-care" />Accueil</span>
                <span><i className="lg-plan" />Prévu</span>
                <span><i className="lg-absent" />Absence</span>
              </div>
            </Group>

            {ym < yearMonth(today) && (
              <Group>
                <Row
                  title="Contrôler le bulletin"
                  sub={control ? 'Déjà relevé, touche pour revoir' : 'Compare avec ce que la famille a déclaré'}
                  onClick={() => nav.push({ name: 'controle', contractId: contract.id, month: ym })}
                />
              </Group>
            )}
          </>
        )}
      </Screen>
      {day && <DaySheet contractId={contract.id} date={day} today={today} open onClose={closeDay} />}
    </>
  );
}

export function DetailScreen(props: { contractId: string; month: YearMonth }): ReactElement {
  const s = useAppState();
  const { today, minutes } = useClock();
  const contract = s.contracts.find((c) => c.id === props.contractId);
  if (!contract) return <Screen title="Détail" back="Mois"><Empty title="Contrat introuvable" /></Screen>;
  const ledger = ledgerFor(s, contract, today, props.month, minutes);
  const m = ledger.months.get(props.month);
  const child = childOf(s, contract);
  if (!m) return <Screen title="Détail" back="Mois"><Empty title="Mois hors suivi" /></Screen>;
  const hours = (min: number): string => `${(Math.round((min / 60) * 100) / 100).toLocaleString('fr-FR')} h`;
  return (
    <Screen title="Détail du calcul" back="Mois" subtitle={`${child?.firstName}, ${formatYearMonth(props.month)}`}>
      <Group title="Salaire net">
        {m.lines.map((l) => <Row key={l.label} title={l.label} value={formatEuros(l.cents)} strong />)}
        <div className="row row-total"><span className="row-main"><span className="row-title">Salaire net</span></span><span className="total">{formatEuros(m.netSalaryCents)}</span></div>
      </Group>
      <p className="group-note">
        Salaire mensualisé : {hours(m.mensualisedMinutes)} par mois en moyenne
        ({contract.yearType === 'complete' ? '52 semaines' : `${contract.programmedWeeks} semaines`} × heures de la semaine ÷ 12).
      </p>
      {m.deductionCents > 0 && (
        <p className="group-note">
          Retenue : {m.deductionMethod === 'heures' ? `${hours(m.deductionNumerator)} d’absence sur ${hours(m.deductionDivisor)} prévues ce mois` : `${m.deductionNumerator} jour(s) d’absence sur ${m.deductionDivisor} jours prévus ce mois`}.
        </p>
      )}
      <Group title="Indemnités">
        <Row title="Entretien" value={formatEuros(m.entretienCents)} strong />
        {m.mealsCents > 0 && <Row title="Repas" value={formatEuros(m.mealsCents)} strong />}
        {m.kmCents > 0 && <Row title="Kilomètres" value={formatEuros(m.kmCents)} strong />}
      </Group>
      <Group title="Heures">
        {m.complementaryMinutes > 0 && <Row title="Complémentaires (jusqu’à 45 h par semaine)" value={hours(m.complementaryMinutes)} />}
        {m.majoredMinutes > 0 && <Row title="Majorées (au-delà de 45 h)" value={hours(m.majoredMinutes)} />}
        <Row title="Heures normales déclarées" value={hours(m.recap.normalHours * 60)} />
      </Group>
      {ledger.sickness.deductible.size > 0 && <p className="group-note">{SICKNESS_INTERPRETATION}</p>}
      {m.warnings.length > 0 && <Banner tone="warn"><ul>{m.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Banner>}
    </Screen>
  );
}
