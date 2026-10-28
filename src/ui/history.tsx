import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { addDays, addMonthsYM, formatLongDate, formatYearMonth, monthStart, yearMonth, type ISODate, type YearMonth } from '../engine/dates';
import { formatEuros, type Cents } from '../engine/money';
import { contractYearStart } from '../engine/sickness';
import type { HistoryMonth } from '../engine/types';
import { childOf } from '../derive';
import { parseBulletin, pdfText } from '../pdf';
import { pickFile } from '../share';
import { logEvent, todayISO, update } from '../state';
import { useAppState } from './hooks';
import { Icon } from './icons';
import { Banner, DateField, Empty, Group, MoneyField, NumberField, Row, Screen, Sheet, toast, useNav } from './kit';

function cap(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

export function HistoryScreen({ contractId }: { contractId: string }): ReactElement {
  const s = useAppState();
  const nav = useNav();
  const contract = s.contracts.find((c) => c.id === contractId);
  const opening = s.openings.find((o) => o.contractId === contractId);
  const today = todayISO();
  const defaultTracking = monthStart(yearMonth(today));
  const [tracking, setTracking] = useState<ISODate>(opening ? addDays(opening.asOf, 1) : defaultTracking);
  const [cpPrev, setCpPrev] = useState<number | null>(opening?.cpPreviousRemaining ?? null);
  const [cpCur, setCpCur] = useState<number | null>(opening?.cpCurrentAcquired ?? null);
  const [sick, setSick] = useState<number | null>(opening?.sickDaysDeducted ?? 0);
  const [editing, setEditing] = useState<YearMonth | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const closeEdit = useCallback(() => setEditing(null), []);

  const persist = useCallback((next: { tracking: ISODate; cpPrev: number | null; cpCur: number | null; sick: number | null }) => {
    update((st) => ({
      ...st,
      openings: [
        ...st.openings.filter((o) => o.contractId !== contractId),
        {
          contractId,
          asOf: addDays(next.tracking, -1),
          cpPreviousRemaining: next.cpPrev ?? 0,
          cpCurrentAcquired: next.cpCur ?? 0,
          sickDaysDeducted: next.sick ?? 0,
        },
      ],
    }));
  }, [contractId]);

  // Le point de départ est enregistré dès l'arrivée sur l'écran, pour que le suivi commence au bon mois
  useEffect(() => {
    if (!opening && contract && yearMonth(contract.startDate) < yearMonth(today)) {
      persist({ tracking: defaultTracking, cpPrev: null, cpCur: null, sick: 0 });
    }
  }, [opening, contract, today, defaultTracking, persist]);

  if (!contract) return <Screen title="Historique" back="Retour"><Empty title="Contrat introuvable" /></Screen>;
  const child = childOf(s, contract);

  if (yearMonth(contract.startDate) >= yearMonth(today)) {
    return (
      <Screen title="Historique" back="Retour">
        <Empty title="Rien à reprendre">
          <p>Le contrat de {child?.firstName} commence ce mois-ci : l’app suit tout depuis le début.</p>
        </Empty>
      </Screen>
    );
  }

  const trackingMonth = yearMonth(tracking < contract.startDate ? contract.startDate : tracking);
  const months: YearMonth[] = [];
  for (let ym = yearMonth(contract.startDate); ym < trackingMonth; ym = addMonthsYM(ym, 1)) months.push(ym);
  const history = new Map(s.history.filter((h) => h.contractId === contractId).map((h) => [h.month, h]));
  const filled = months.filter((m) => history.has(m)).length;
  const juneStart = `${Number(tracking.slice(0, 4)) - (Number(tracking.slice(5, 7)) < 6 ? 1 : 0)}-06-01`;
  const anniversary = contractYearStart(contract.startDate, addDays(tracking, -1));

  const saveOpening = (): void => {
    persist({ tracking, cpPrev, cpCur, sick });
    logEvent('historique', 'soldes');
    toast('Soldes enregistrés');
  };

  const importPdfs = async (): Promise<void> => {
    const files = await pickFile('application/pdf,.pdf', true);
    if (!files.length) return;
    setBusy(true);
    const lines: string[] = [];
    const added: HistoryMonth[] = [];
    for (const file of files) {
      try {
        const parsed = parseBulletin(await pdfText(file));
        if (!parsed.month || parsed.netCents === undefined) {
          lines.push(`${file.name} : pas reconnu, à saisir à la main`);
          continue;
        }
        if (!months.includes(parsed.month)) {
          lines.push(`${file.name} : ${formatYearMonth(parsed.month)}, hors de la période à reprendre`);
          continue;
        }
        added.push({
          contractId,
          month: parsed.month,
          netSalaryCents: parsed.netCents,
          ...(parsed.grossCents !== undefined ? { grossSalaryCents: parsed.grossCents } : {}),
          ...(parsed.hours !== undefined ? { declaredHours: parsed.hours } : {}),
          ...(parsed.days !== undefined ? { declaredDays: parsed.days } : {}),
          entretienCents: parsed.entretienCents ?? 0,
          mealsCents: parsed.mealsCents ?? 0,
          kmCents: parsed.kmCents ?? 0,
          source: 'bulletin',
        });
        lines.push(`${cap(formatYearMonth(parsed.month))} : net ${formatEuros(parsed.netCents)}${parsed.grossCents !== undefined ? `, brut ${formatEuros(parsed.grossCents)}` : ''}`);
      } catch {
        lines.push(`${file.name} : impossible à lire`);
      }
    }
    if (added.length) {
      update((st) => ({
        ...st,
        history: [...st.history.filter((h) => !(h.contractId === contractId && added.some((a) => a.month === h.month))), ...added],
      }));
    }
    logEvent('historique', `import-${added.length}-sur-${files.length}`);
    setReport(lines);
    setBusy(false);
  };

  return (
    <Screen title="Avant l’app" back="Retour" subtitle={`Contrat de ${child?.firstName}, commencé le ${formatLongDate(contract.startDate)}`}>
      <Banner>
        <p>Les congés et la fin de contrat se calculent sur tout le contrat. Pour les mois d’avant l’app, il faut les montants des bulletins et quelques soldes.</p>
      </Banner>

      <Group title="Point de départ" note="Le premier jour suivi par l’app. Avant cette date, ce sont les bulletins qui comptent.">
        <DateField label="Suivi à partir du" value={tracking} onChange={(v) => {
            if (!v) return;
            setTracking(v);
            persist({ tracking: v, cpPrev, cpCur, sick });
          }} min={contract.startDate} max={today} />
      </Group>

      <Group title="Soldes à cette date" note="Sur ton dernier bulletin ou ton propre suivi. Si tu ne sais pas, laisse vide : l’app le signalera.">
        <NumberField label="Congés restants" hint="Acquis avant le 1er juin, pas encore pris" value={cpPrev} onChange={setCpPrev} unit="j" decimals min={0} max={60} />
        <NumberField label="Congés en cours" hint={`Acquis depuis le ${formatLongDate(juneStart)}`} value={cpCur} onChange={setCpCur} unit="j" decimals min={0} max={30} />
        <NumberField label="Jours malade déjà déduits" hint={`Depuis le ${formatLongDate(anniversary)}`} value={sick} onChange={setSick} unit="j" min={0} max={60} />
      </Group>
      <div className="actions"><button className="btn btn-soft btn-block" onClick={saveOpening}>Enregistrer les soldes</button></div>

      <Group title={`Les mois d’avant (${filled} sur ${months.length})`}>
        {months.length === 0 && <Row title="Aucun mois à reprendre" />}
        {[...months].reverse().map((ym) => {
          const h = history.get(ym);
          return (
            <Row
              key={ym}
              title={cap(formatYearMonth(ym))}
              sub={h ? `Net ${formatEuros(h.netSalaryCents)}${h.grossSalaryCents !== undefined ? ` · brut ${formatEuros(h.grossSalaryCents)}` : ''}` : 'À compléter'}
              value={h ? <span className="status status-ok">{h.source === 'bulletin' ? 'Bulletin' : 'Saisi'}</span> : <span className="status status-todo">Manque</span>}
              onClick={() => setEditing(ym)}
            />
          );
        })}
      </Group>
      <div className="actions">
        <button className="btn btn-primary btn-block" onClick={() => void importPdfs()} disabled={busy}>
          <Icon name="doc" size={20} />
          {busy ? 'Lecture en cours…' : 'Importer des bulletins Pajemploi (PDF)'}
        </button>
        <p className="group-note" style={{ textAlign: 'center' }}>Tu peux en choisir plusieurs d’un coup. Ils sont lus sur le téléphone, rien n’est envoyé.</p>
      </div>
      {report && (
        <Banner tone="ok">
          <p><strong>Résultat de la lecture</strong></p>
          <ul>{report.map((l) => <li key={l}>{l}</li>)}</ul>
          <p>Vérifie chaque mois en le touchant.</p>
        </Banner>
      )}
      {filled === months.length && months.length > 0 && (
        <Banner tone="ok"><p>Historique complet. La fin de contrat et les congés seront justes.</p></Banner>
      )}
      <div className="actions"><button className="btn btn-plain" onClick={nav.pop}>Terminer plus tard</button></div>

      {editing && <MonthHistorySheet contractId={contractId} month={editing} onClose={closeEdit} />}
    </Screen>
  );
}

function MonthHistorySheet(props: { contractId: string; month: YearMonth; onClose: () => void }): ReactElement {
  const s = useAppState();
  const h = s.history.find((x) => x.contractId === props.contractId && x.month === props.month);
  const [net, setNet] = useState<Cents | null>(h?.netSalaryCents ?? null);
  const [gross, setGross] = useState<Cents | null>(h?.grossSalaryCents ?? null);
  const [hours, setHours] = useState<number | null>(h?.declaredHours ?? null);
  const [days, setDays] = useState<number | null>(h?.declaredDays ?? null);
  const [ent, setEnt] = useState<Cents | null>(h?.entretienCents ?? null);
  const [meals, setMeals] = useState<Cents | null>(h?.mealsCents ?? null);
  const [km, setKm] = useState<Cents | null>(h?.kmCents ?? null);
  return (
    <Sheet
      open
      onClose={props.onClose}
      title={cap(formatYearMonth(props.month))}
      action={{
        label: 'OK',
        disabled: net === null,
        onClick: () => {
          if (net === null) return;
          const row: HistoryMonth = {
            contractId: props.contractId,
            month: props.month,
            netSalaryCents: net,
            ...(gross !== null ? { grossSalaryCents: gross } : {}),
            ...(hours !== null ? { declaredHours: hours } : {}),
            ...(days !== null ? { declaredDays: days } : {}),
            entretienCents: ent ?? 0,
            mealsCents: meals ?? 0,
            kmCents: km ?? 0,
            source: h?.source === 'bulletin' && h.netSalaryCents === net ? 'bulletin' : 'manuel',
          };
          update((st) => ({ ...st, history: [...st.history.filter((x) => !(x.contractId === props.contractId && x.month === props.month)), row] }));
          props.onClose();
        },
      }}
    >
      <p className="sheet-lead">Recopie le bulletin Pajemploi de ce mois. Seul le salaire net est indispensable.</p>
      <div className="group">
        <MoneyField label="Salaire net" cents={net} onChange={setNet} />
        <MoneyField label="Salaire brut" hint="Pour l’indemnité de fin de contrat" cents={gross} onChange={setGross} />
        <NumberField label="Heures" value={hours} onChange={setHours} unit="h" decimals min={0} />
        <NumberField label="Jours d’activité" value={days} onChange={setDays} unit="j" min={0} max={31} />
        <MoneyField label="Entretien" cents={ent} onChange={setEnt} />
        <MoneyField label="Repas" cents={meals} onChange={setMeals} />
        <MoneyField label="Kilomètres" cents={km} onChange={setKm} />
      </div>
      {h && (
        <div className="actions">
          <button
            className="btn btn-plain"
            style={{ color: 'var(--negative)' }}
            onClick={() => {
              update((st) => ({ ...st, history: st.history.filter((x) => !(x.contractId === props.contractId && x.month === props.month)) }));
              props.onClose();
            }}
          >
            Effacer ce mois
          </button>
        </div>
      )}
    </Sheet>
  );
}
