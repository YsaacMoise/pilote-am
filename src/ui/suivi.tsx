import { useState, type ReactElement, type ReactNode } from 'react';
import {
  addDays, addMonthsYM, formatLongDate, formatYearMonth, monthNameFR, yearMonth, type ISODate, type YearMonth,
} from '../engine/dates';
import { workingDaysTaken } from '../engine/conges';
import { formatEuros, type Cents } from '../engine/money';
import { rateOn } from '../engine/rates';
import { END_KIND_LABELS, endOfContract, notice, type EndKind } from '../engine/rupture';
import type { Contract, ControlEntry } from '../engine/types';
import { addLeave, removeLeave, snapshotSlices } from '../actions';
import { childOf, initialsOf, kidClass, lastClosedMonth, ledgerFor, taxForYear } from '../derive';
import { parseBulletin, pdfText } from '../pdf';
import { pickFile } from '../share';
import { logEvent, update, type AppState } from '../state';
import { useAppState, useClock } from './hooks';
import { KidPicker } from './kidpicker';
import { Icon } from './icons';
import { Banner, ChoiceList, DateField, Empty, Group, Magnet, MoneyField, NumberField, Row, Screen, toast, useNav } from './kit';

function cap(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Accueil de l'onglet Suivi
// ---------------------------------------------------------------------------

export function SuiviScreen(): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const nav = useNav();
  const last = lastClosedMonth(today);
  const year = Number(today.slice(0, 4));

  const toControl = s.contracts.filter((c) => c.startDate <= `${last}-31` && (!c.endDate || c.endDate >= `${last}-01`)
    && !s.controls.some((x) => x.contractId === c.id && x.month === last));
  const gaps = s.contracts.filter((c) => !c.endDate || c.endDate >= today).map((c) => ({ c, l: ledgerFor(s, c, today, yearMonth(today)) }))
    .filter(({ l }) => l.historyGaps.length > 0);
  const cpLeft = s.contracts.filter((c) => !c.endDate || c.endDate >= today).map((c) => {
    const l = ledgerFor(s, c, today, yearMonth(today));
    const closed = l.cpPeriods.filter((p) => p.indemnity);
    return closed[closed.length - 1]?.remaining;
  }).filter((x): x is number => x !== undefined);

  if (s.contracts.length === 0) {
    return <Screen title="Suivi"><Empty title="Rien à suivre pour l’instant"><p>Ajoute un contrat dans Réglages.</p></Empty></Screen>;
  }

  return (
    <Screen title="Suivi">
      {toControl.length > 0 && (
        <Group title="À faire">
          <Row
            title={`Contrôler les bulletins de ${monthNameFR(Number(last.slice(5)))}`}
            sub={toControl.map((c) => childOf(s, c)?.firstName).join(', ')}
            leading={<span className="status status-todo" style={{ marginRight: 4 }}>{toControl.length}</span>}
            onClick={() => nav.push({ name: 'controle', ...(toControl[0] ? { contractId: toControl[0].id } : {}), month: last })}
          />
        </Group>
      )}
      {gaps.length > 0 && (
        <Banner tone="warn">
          <p><strong>Historique incomplet</strong> pour {gaps.map(({ c }) => childOf(s, c)?.firstName).join(', ')} : les congés et la fin de contrat seront sous-estimés.</p>
          <div className="banner-actions">
            {gaps.map(({ c }) => (
              <button key={c.id} className="btn btn-soft" onClick={() => nav.push({ name: 'history', contractId: c.id })}>
                Compléter pour {childOf(s, c)?.firstName}
              </button>
            ))}
          </div>
        </Banner>
      )}
      <Group title="Outils">
        <Row title="Contrôler un bulletin" sub="Comparer avec ce que la famille a déclaré" onClick={() => nav.push({ name: 'controle' })} />
        <Row title="Congés payés" sub={cpLeft.length ? `Jours restants : ${cpLeft.join(', ')}` : 'Tes congés et les jours acquis'} onClick={() => nav.push({ name: 'conges' })} />
        <Row title="Fin de contrat" sub="Préavis et sommes dues, à simuler" onClick={() => nav.push({ name: 'fin' })} />
        <Row title={`Impôts ${year}`} sub="Revenu à déclarer après abattement" onClick={() => nav.push({ name: 'impots' })} />
      </Group>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Contrôle du bulletin
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  expected: string;
  ok: boolean | null;
  diff?: string;
}

function centsCheck(label: string, expected: Cents | undefined, declared: Cents | null): Check {
  if (expected === undefined) return { label, expected: '—', ok: null };
  if (declared === null) return { label, expected: formatEuros(expected), ok: null };
  const d = declared - expected;
  return {
    label,
    expected: formatEuros(expected),
    ok: Math.abs(d) <= 1,
    ...(Math.abs(d) > 1 ? { diff: `Attendu ${formatEuros(expected)} · ${formatEuros(Math.abs(d))} de ${d > 0 ? 'plus' : 'moins'} sur le bulletin` } : {}),
  };
}

function numCheck(label: string, expected: number | undefined, declared: number | null, unit: string, tolerance: number): Check {
  if (expected === undefined) return { label, expected: '—', ok: null };
  const e = Math.round(expected * 100) / 100;
  const shown = `${e.toLocaleString('fr-FR')} ${unit}`;
  if (declared === null) return { label, expected: shown, ok: null };
  const d = Math.round((declared - e) * 100) / 100;
  return { label, expected: shown, ok: Math.abs(d) <= tolerance, ...(Math.abs(d) > tolerance ? { diff: `Attendu ${shown} · ${Math.abs(d).toLocaleString('fr-FR')} ${unit} de ${d > 0 ? 'plus' : 'moins'} sur le bulletin` } : {}) };
}

export function ControleScreen(props: { contractId?: string; month?: YearMonth }): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const [ym, setYm] = useState<YearMonth>(props.month ?? lastClosedMonth(today));
  const [cid, setCid] = useState<string | undefined>(props.contractId);
  const contracts = s.contracts.filter((c) => c.startDate <= `${ym}-31` && (!c.endDate || c.endDate >= `${ym}-01`));
  const contract = contracts.find((c) => c.id === cid) ?? contracts[0];
  const prevName = monthNameFR(Number(addMonthsYM(ym, -1).slice(5)));
  const nextName = monthNameFR(Number(addMonthsYM(ym, 1).slice(5)));
  const canNext = addMonthsYM(ym, 1) < yearMonth(today);
  const header = (
    <>
      <div className="month-nav">
        <button className="bar-action" onClick={() => setYm(addMonthsYM(ym, -1))} aria-label={`Mois précédent, ${prevName}`}>
          <Icon name="back" size={20} stroke={2.4} /> {cap(prevName)}
        </button>
        {canNext && (
          <button className="bar-action" onClick={() => setYm(addMonthsYM(ym, 1))} aria-label={`Mois suivant, ${nextName}`}>
            {cap(nextName)} <Icon name="chevron" size={20} stroke={2.4} />
          </button>
        )}
      </div>
      {contract && <KidPicker s={s} contracts={contracts} value={contract.id} onChange={setCid} />}
    </>
  );
  if (!contract) {
    return <Screen title="Contrôle du bulletin" back="Retour" subtitle={formatYearMonth(ym)}>{header}<Empty title="Aucun contrat ce mois-là" /></Screen>;
  }
  // Le formulaire repart de zéro à chaque changement d'enfant ou de mois
  return <ControleForm key={`${contract.id}-${ym}`} contract={contract} ym={ym} header={header} />;
}

function ControleForm(props: { contract: Contract; ym: YearMonth; header: ReactNode }): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const { contract, ym } = props;
  const existing = s.controls.find((x) => x.contractId === contract.id && x.month === ym);
  const [version, setVersion] = useState(0);
  const [net, setNet] = useState<Cents | null>(existing?.declaredNetCents ?? null);
  const [gross, setGross] = useState<Cents | null>(existing?.declaredGrossCents ?? null);
  const [ent, setEnt] = useState<Cents | null>(existing?.declaredEntretienCents ?? null);
  const [meals, setMeals] = useState<Cents | null>(existing?.declaredMealsCents ?? null);
  const [km, setKm] = useState<Cents | null>(existing?.declaredKmCents ?? null);
  const [hours, setHours] = useState<number | null>(existing?.declaredHours ?? null);
  const [days, setDays] = useState<number | null>(existing?.declaredDays ?? null);
  const [busy, setBusy] = useState(false);
  const [pdfNote, setPdfNote] = useState<string | null>(null);

  const ledger = ledgerFor(s, contract, today, ym);
  const m = ledger.months.get(ym);
  const child = childOf(s, contract);

  let ratio: number | null = null;
  try {
    ratio = rateOn('SALAIRE_MIN_NET', `${ym}-15`) / rateOn('SALAIRE_MIN_BRUT', `${ym}-15`);
  } catch {
    ratio = null;
  }

  const checks: Check[] = m ? [
    numCheck('Heures normales', m.recap.normalHours, hours, 'h', 0.02),
    numCheck('Jours d’activité', m.recap.activityDays, days, 'j', 0),
    centsCheck('Salaire net', m.netSalaryCents, net),
    centsCheck('Entretien', m.entretienCents, ent),
    ...(m.mealsCents > 0 || (meals ?? 0) > 0 ? [centsCheck('Repas', m.mealsCents, meals)] : []),
    ...(m.kmCents > 0 || (km ?? 0) > 0 ? [centsCheck('Kilomètres', m.kmCents, km)] : []),
  ] : [];

  let grossVerdict: { ok: boolean; text: string } | null = null;
  if (net !== null && gross !== null && gross > 0 && ratio) {
    const r = net / gross;
    const gap = r / ratio - 1;
    grossVerdict = Math.abs(gap) <= 0.02
      ? { ok: true, text: `Le brut correspond au net (environ ${Math.round((1 - r) * 100)} % de cotisations).` }
      : { ok: false, text: `Le brut ne colle pas avec le net : on attendrait environ ${formatEuros(Math.round(net / ratio))}. Vérifie avec la famille.` };
  }

  const save = (): void => {
    if (net === null) {
      toast('Indique au moins le salaire net du bulletin');
      return;
    }
    const entry: ControlEntry = {
      contractId: contract.id,
      month: ym,
      declaredNetCents: net,
      ...(gross !== null ? { declaredGrossCents: gross } : {}),
      declaredEntretienCents: ent ?? 0,
      declaredMealsCents: meals ?? 0,
      declaredKmCents: km ?? 0,
      ...(hours !== null ? { declaredHours: hours } : {}),
      ...(days !== null ? { declaredDays: days } : {}),
    };
    update((st) => ({ ...st, controls: [...st.controls.filter((x) => !(x.contractId === contract.id && x.month === ym)), entry] }));
    logEvent('controle', checks.every((c) => c.ok !== false) ? 'conforme' : 'ecart');
    toast('Contrôle enregistré');
  };

  const importPdf = async (): Promise<void> => {
    const [file] = await pickFile('application/pdf,.pdf');
    if (!file) return;
    setBusy(true);
    try {
      const p = parseBulletin(await pdfText(file));
      if (p.netCents !== undefined) setNet(p.netCents);
      if (p.grossCents !== undefined) setGross(p.grossCents);
      if (p.entretienCents !== undefined) setEnt(p.entretienCents);
      if (p.mealsCents !== undefined) setMeals(p.mealsCents);
      if (p.kmCents !== undefined) setKm(p.kmCents);
      if (p.hours !== undefined) setHours(p.hours);
      if (p.days !== undefined) setDays(p.days);
      setVersion((v) => v + 1);
      const monthNote = p.month && p.month !== ym ? ` Attention : ce bulletin semble être celui de ${formatYearMonth(p.month)}.` : '';
      setPdfNote(p.found > 0 ? `${p.found} montant${p.found > 1 ? 's' : ''} repris du PDF. Vérifie-les.${monthNote}` : 'Rien de reconnu dans ce PDF : recopie les montants à la main.');
      logEvent('controle', `pdf-${p.found}`);
    } catch {
      setPdfNote('Ce PDF n’a pas pu être lu. Recopie les montants à la main.');
    }
    setBusy(false);
  };

  return (
    <Screen title="Contrôle du bulletin" back="Retour" subtitle={`${child?.firstName}, ${formatYearMonth(ym)}`}>
      {props.header}
      {!m ? (
        <Banner><p>Ce mois est avant le suivi dans l’app : rien à comparer.</p></Banner>
      ) : (
        <>
          <div className="actions">
            <button className="btn btn-soft btn-block" onClick={() => void importPdf()} disabled={busy}>
              <Icon name="doc" size={20} />
              {busy ? 'Lecture…' : 'Lire le bulletin PDF'}
            </button>
          </div>
          {pdfNote && <p className="group-note" role="status">{pdfNote}</p>}

          <Group title="Ce que dit le bulletin" key={`f${version}`}>
            <NumberField label="Heures normales" value={hours} onChange={setHours} unit="h" decimals min={0} placeholder="—" />
            <NumberField label="Jours d’activité" value={days} onChange={setDays} unit="j" min={0} max={31} placeholder="—" />
            <MoneyField label="Salaire net" cents={net} onChange={setNet} placeholder="—" />
            <MoneyField label="Salaire brut" cents={gross} onChange={setGross} placeholder="—" />
            <MoneyField label="Entretien" cents={ent} onChange={setEnt} placeholder="—" />
            {(m.mealsCents > 0 || meals !== null) && <MoneyField label="Repas" cents={meals} onChange={setMeals} placeholder="—" />}
            {(m.kmCents > 0 || km !== null) && <MoneyField label="Kilomètres" cents={km} onChange={setKm} placeholder="—" />}
          </Group>

          <Group title="Comparaison">
            {checks.map((c) => (
              <Row
                key={c.label}
                title={c.label}
                sub={c.ok === false ? c.diff : `Attendu : ${c.expected}`}
                value={c.ok === null ? <span className="row-value">À saisir</span> : c.ok ? <span className="diff-ok">Juste</span> : <span className="diff-bad">Écart</span>}
              />
            ))}
            {grossVerdict && <Row title="Brut" sub={grossVerdict.text} value={grossVerdict.ok ? <span className="diff-ok">Cohérent</span> : <span className="diff-bad">À vérifier</span>} />}
          </Group>
          {checks.some((c) => c.ok === false) && (
            <p className="group-note">Un écart ? Regarde d’abord le détail du mois (absences, heures en plus), puis parles-en avec la famille.</p>
          )}
          <div className="actions">
            <button className="btn btn-primary btn-block" onClick={save}>Enregistrer le contrôle</button>
          </div>
          <p className="group-note">Le brut saisi sert au calcul exact de l’indemnité de fin de contrat.</p>
        </>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Congés payés
// ---------------------------------------------------------------------------

export function CongesScreen(): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const active = s.contracts.filter((c) => !c.endDate || c.endDate >= addDays(today, -365));
  const leave = [...s.amLeave].sort((a, b) => (a.from < b.from ? 1 : -1));

  return (
    <Screen title="Congés payés" back="Suivi">
      <Group title="Tes congés" note="Ils comptent pour tous les enfants à la fois. Les jours comptés sont les jours ouvrables (lundi au samedi, hors fériés).">
        {leave.length === 0 && <Row title="Aucun congé saisi" />}
        {leave.map((r) => (
          <Row
            key={`${r.from}-${r.to}`}
            title={r.from === r.to ? cap(formatLongDate(r.from)) : `Du ${formatLongDate(r.from)} au ${formatLongDate(r.to)}`}
            sub={`${workingDaysTaken([r], r.from, r.to).length} jours ouvrables`}
            value={
              <button
                className="btn btn-plain"
                style={{ color: 'var(--negative)' }}
                onClick={() => {
                  const undo = removeLeave(r);
                  toast('Congés retirés', undo);
                }}
              >
                Retirer
              </button>
            }
          />
        ))}
        <DateField label="Du" value={from} onChange={setFrom} />
        <DateField label="Au" value={to} onChange={setTo} min={from} />
        <div className="row">
          <button
            className="btn btn-soft"
            disabled={!from || !to || to < from}
            onClick={() => {
              const undo = addLeave({ from, to });
              logEvent('conges', 'ajout');
              setFrom('');
              setTo('');
              toast('Congés ajoutés', undo);
            }}
          >
            <Icon name="plus" size={18} stroke={2.4} /> Ajouter ces congés
          </button>
        </div>
      </Group>

      {active.map((c) => {
        const l = ledgerFor(s, c, today, yearMonth(today));
        const child = childOf(s, c);
        return (
          <Group key={c.id} title={`Chez les ${s.families.find((f) => f.id === c.familyId)?.name ?? ''} (${child?.firstName})`}>
            {[...l.cpPeriods].reverse().map((p) => {
              const closed = !!p.indemnity;
              return (
                <Row
                  key={p.period.start}
                  title={closed ? `Acquis jusqu’au 31 mai ${p.period.closingYear}` : `En cours depuis le ${formatLongDate(p.period.start)}`}
                  sub={
                    closed
                      ? `${p.acquisition.totalDays} j acquis · ${p.taken} pris · ${c.yearType === 'complete'
                        ? ((p.indemnity?.dueCents ?? 0) > 0 ? `complément de juin ${formatEuros(p.indemnity?.dueCents ?? 0)} (règle du dixième)` : 'pas de complément en juin')
                        : `indemnité ${formatEuros(p.indemnity?.dueCents ?? 0)}${p.indemnity?.method === 'dixieme' ? ' (règle du dixième)' : ' (maintien de salaire)'}`}${p.fromOpening ? ' · soldes de départ' : ''}`
                      : `${p.acquisition.totalDays} j acquis à la fin du mois${p.fromOpening ? ' · avec les soldes de départ' : ''}`
                  }
                  value={closed ? <span className="row-value strong">{p.remaining} j restants</span> : undefined}
                />
              );
            })}
            {l.cpUnpaid.size > 0 && <Row title="Congés pris sans droits" sub={`${l.cpUnpaid.size} jour(s) déduit(s) du salaire`} />}
          </Group>
        );
      })}
      <p className="group-note">
        2,5 jours par mois d’accueil, 30 au plus, arrondis au jour supérieur. L’indemnité retient le plus favorable entre le maintien de salaire et le dixième des salaires de la période.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Fin de contrat
// ---------------------------------------------------------------------------

export function FinScreen(props: { contractId?: string }): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const contracts = s.contracts.filter((c) => !c.endDate || c.endDate >= addDays(today, -60) || c.id === props.contractId);
  const [cid, setCid] = useState<string | undefined>(props.contractId);
  const contract = contracts.find((c) => c.id === cid) ?? contracts[0];
  if (!contract) return <Screen title="Fin de contrat" back="Retour"><Empty title="Aucun contrat en cours" /></Screen>;
  return <FinForm key={contract.id} contract={contract} picker={<KidPicker s={s} contracts={contracts} value={contract.id} onChange={setCid} />} />;
}

function FinForm(props: { contract: Contract; picker: ReactNode }): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const nav = useNav();
  const contract = props.contract;
  const ending = s.endings.find((e) => e.contractId === contract.id);
  const [kind, setKind] = useState<EndKind>(ending?.kind ?? 'retrait');
  const [notif, setNotif] = useState<ISODate>(ending?.notificationDate ?? today);
  const [endDate, setEndDate] = useState<ISODate>(ending?.endDate ?? '');

  const child = childOf(s, contract);
  const n = notice(contract.startDate, notif, kind);
  const end = (endDate && endDate >= notif ? endDate : '') || n.endDate || notif;
  const simulated: Contract = { ...contract, endDate: end };
  const ledger = ledgerFor({ ...s, contracts: s.contracts.map((c) => (c.id === contract.id ? simulated : c)) }, simulated, today, yearMonth(end));
  const r = endOfContract(ledger, kind, notif, end);
  const saved = !!ending && contract.endDate === end && ending.endDate === end && ending.kind === kind && ending.notificationDate === notif;

  const cancelEnding = (): void => {
    const undo = snapshotSlices(['contracts', 'endings']);
    update((st) => ({
      ...st,
      contracts: st.contracts.map((c) => {
        if (c.id !== contract.id) return c;
        const { endDate: _e, ...rest } = c;
        return rest;
      }),
      endings: st.endings.filter((e) => e.contractId !== contract.id),
    }));
    toast('Fin de contrat annulée', undo);
  };

  const confirm = (): void => {
    const undo = snapshotSlices(['contracts', 'endings']);
    update((st) => ({
      ...st,
      contracts: st.contracts.map((c) => (c.id === contract.id ? { ...c, endDate: end } : c)),
      endings: [...st.endings.filter((e) => e.contractId !== contract.id), { contractId: contract.id, kind, notificationDate: notif, endDate: end }],
    }));
    logEvent('fin', kind);
    toast('Fin de contrat enregistrée', undo);
  };

  return (
    <Screen title="Fin de contrat" back="Retour" subtitle={`${child?.firstName}, depuis le ${formatLongDate(contract.startDate)}`}>
      {props.picker}
      <h2 className="group-title">Motif</h2>
      <ChoiceList<EndKind>
        label="Motif de fin"
        value={kind}
        onChange={setKind}
        options={(Object.keys(END_KIND_LABELS) as EndKind[]).map((k) => ({ value: k, label: END_KIND_LABELS[k] }))}
      />
      <Group title="Dates">
        <DateField label="Date de la lettre" hint="Remise en main propre ou première présentation" value={notif} onChange={(v) => v && setNotif(v)} min={contract.startDate} />
        <DateField label="Dernier jour" hint={n.endDate ? `Fin du préavis : ${formatLongDate(n.endDate)}` : 'Sans préavis'} value={endDate || end} onChange={setEndDate} min={notif} />
      </Group>

      {ledger.historyGaps.length > 0 && (
        <Banner tone="bad">
          <p><strong>Historique incomplet :</strong> {ledger.historyGaps.length} mois sans bulletin. Les montants ci-dessous sont trop bas.</p>
          <div className="banner-actions"><button className="btn btn-soft" onClick={() => nav.push({ name: 'history', contractId: contract.id })}>Compléter</button></div>
        </Banner>
      )}

      <Group title="Résultat">
        <Row title="Préavis" sub={n.note ?? `Ancienneté : ${n.seniorityMonths} mois`} value={n.label} />
        <Row title="Indemnité de rupture" sub={r.ruptureRule} value={formatEuros(r.ruptureIndemnity)} strong />
        {contract.yearType === 'incomplete' && <Row title="Régularisation" sub={r.regularisationPartial ? 'Sur les mois suivis par l’app' : 'Heures faites et non payées'} value={formatEuros(r.regularisation)} strong />}
        <Row title="Congés non pris" sub={r.paidLeaveDetail || 'Aucun'} value={formatEuros(r.paidLeaveIndemnity)} strong />
        <div className="row row-total">
          <span className="row-main"><span className="row-title">Total en plus du dernier salaire</span></span>
          <span className="total">{formatEuros(r.total)}</span>
        </div>
      </Group>
      <p className="group-note">
        Base de l’indemnité : {formatEuros(r.grossTotal)} de salaires bruts{r.grossEstimated ? ' (en partie estimés)' : ''}. Montants en net sauf l’indemnité de rupture, exonérée.
      </p>
      {r.warnings.length > 0 && <Banner tone="warn"><ul>{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Banner>}
      <Banner>
        <p>Les documents de fin de contrat (attestation France Travail, certificat de travail, reçu pour solde de tout compte) restent à faire par la famille. Ce calcul aide à vérifier les montants.</p>
      </Banner>
      <div className="actions">
        <button className="btn btn-primary btn-block" onClick={confirm} disabled={saved}>
          {saved ? 'Fin de contrat enregistrée' : ending ? 'Enregistrer les changements' : 'Enregistrer cette fin de contrat'}
        </button>
        {ending && <button className="btn btn-plain" style={{ color: 'var(--negative)' }} onClick={cancelEnding}>Annuler cette fin de contrat</button>}
        <p className="group-note" style={{ textAlign: 'center' }}>Sans enregistrer, rien ne change : c’est une simulation.</p>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Impôts : abattement spécifique
// ---------------------------------------------------------------------------

export function ImpotsScreen(): ReactElement {
  const s = useAppState();
  const { today } = useClock();
  const current = Number(today.slice(0, 4));
  const [year, setYear] = useState(Number(today.slice(5, 7)) <= 5 ? current - 1 : current);
  const t = taxForYear(s, year, today);
  const inProgress = year === current;
  return (
    <Screen title={`Impôts ${year}`} back="Suivi" subtitle="Régime de l’abattement des assistantes maternelles">
      <div className="month-nav">
        <button className="bar-action" onClick={() => setYear(year - 1)}><Icon name="back" size={20} stroke={2.4} /> {year - 1}</button>
        {year < current && <button className="bar-action" onClick={() => setYear(year + 1)}>{year + 1} <Icon name="chevron" size={20} stroke={2.4} /></button>}
      </div>
      <div className="figures" style={{ marginTop: 12 }}>
        <div className="figure"><div className="figure-value">{formatEuros(t.income)}</div><div className="figure-label">Sommes reçues (salaires et indemnités)</div></div>
        <div className="figure"><div className="figure-value">{formatEuros(t.abattement)}</div><div className="figure-label">Abattement</div></div>
      </div>
      <Group title="Revenu imposable estimé">
        <div className="row row-total">
          <span className="row-main"><span className="row-title">À déclarer</span><span className="row-sub">{inProgress ? 'Année en cours : la fin d’année suit les plannings' : 'Année complète'}</span></span>
          <span className="total">{formatEuros(t.taxable)}</span>
        </div>
      </Group>
      {t.partial && (
        <Banner tone="warn"><p>Des mois viennent de bulletins repris : leurs jours d’accueil ne sont pas connus un par un, l’abattement de ces mois manque. Le revenu imposable réel sera plus bas.</p></Banner>
      )}
      <p className="group-note">
        Abattement : 3 SMIC horaires par jour d’accueil et par enfant (au prorata sous 8 h), 4 pour un enfant ouvrant droit à majoration. Il ne peut pas dépasser les sommes reçues. Le montant à déclarer est une estimation à confronter au relevé Pajemploi.
      </p>
    </Screen>
  );
}
