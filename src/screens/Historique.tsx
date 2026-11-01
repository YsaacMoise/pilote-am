import { useState } from 'preact/hooks';
import { logUsage, putContract, state, toast, useStore } from '../store';
import { monthLabel, monthOf, monthsBetween, addMonths, type Month } from '../engine/dates';
import { euros } from '../engine/money';
import type { HistoryMonth } from '../engine/model';
import { Banner, EuroInput, NumberInput, Sheet, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { ScanError, parseBulletin, pdfText, type Extracted } from '../pdf';

export function Historique({ id }: { id: string }) {
  useStore();
  const c = state.contracts.find((x) => x.id === id);
  const [editing, setEditing] = useState<{ month: Month; draft: Partial<HistoryMonth>; source: 'pdf' | 'manuel' } | null>(null);
  const [queue, setQueue] = useState<Extracted[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!c) return <><Topbar title="Historique" back="#/plus" screen="historique" /><main><p>Contrat introuvable.</p></main></>;
  const last = addMonths(monthOf(c.trackedFrom), -1);
  const months = c.trackedFrom > c.start ? monthsBetween(monthOf(c.start), last) : [];
  const missing = months.filter((m) => !c.history.some((h) => h.month === m));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr('');
    const out: Extracted[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push(parseBulletin(await pdfText(f)));
      } catch (e) {
        if (e instanceof ScanError) { setErr(`« ${f.name} » : ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}`); logUsage('pdf_scan', 'historique'); }
        else setErr(`Impossible de lire « ${f.name} ». Saisis ce bulletin à la main.`);
      }
    }
    setBusy(false);
    logUsage('pdf_import', 'historique');
    if (out.length) {
      setQueue(out.slice(1));
      openExtract(out[0]);
    }
  }

  function openExtract(x: Extracted) {
    const m = (x.month && months.includes(x.month) ? x.month : missing[0] ?? months[0]) as Month;
    setEditing({ month: m, draft: { net: x.net, brut: x.brut, heures: x.heures, jours: x.jours, entretien: x.entretien, cpJours: x.cpJours }, source: 'pdf' });
  }

  async function saveMonth(h: HistoryMonth) {
    const prev = structuredClone(c!);
    const history = [...c!.history.filter((x) => x.month !== h.month), h].sort((a, b) => a.month.localeCompare(b.month));
    await putContract({ ...c!, history });
    toast(`Bulletin de ${monthLabel(h.month)} enregistré`, async () => { await putContract(prev); });
    setEditing(null);
    if (queue.length) { const [n, ...rest] = queue; setQueue(rest); setTimeout(() => openExtract(n), 50); }
  }

  return (
    <>
      <Topbar title="Historique" sub={c.child} back={`#/contrat/${c.id}`} screen="historique" />
      <main>
        {months.length === 0 ? (
          <Banner tone="ok">Ce contrat est suivi par l’app depuis son début : pas d’historique à reprendre.</Banner>
        ) : (
          <>
            <p>Le contrat a commencé avant l’app. Ajoute les bulletins Pajemploi des mois passés : ils servent au calcul des congés et de la fin de contrat.</p>
            {missing.length > 0 ? (
              <Banner tone="warn"><strong>{missing.length} mois sans bulletin</strong><span>Tu peux les ajouter plus tard. L’app te le rappellera à la fin du contrat.</span></Banner>
            ) : (
              <Banner tone="ok">Historique complet.</Banner>
            )}
            <label class={`btn btn-primary btn-lg btn-block ${busy ? 'is-busy' : ''}`} style={{ position: 'relative' }}>
              <Icon name="upload" />{busy ? 'Lecture en cours…' : 'Importer des bulletins PDF'}
              <input type="file" accept="application/pdf,.pdf" multiple class="sr-only" onChange={(e) => onFiles((e.target as HTMLInputElement).files)} />
            </label>
            <p class="hint">Les PDF sont lus sur ton téléphone, rien n’est envoyé. Tu vérifies chaque montant avant d’enregistrer.</p>
            {err && <Banner tone="warn">{err}</Banner>}
            <div class="list">
              {months.map((m) => {
                const h = c.history.find((x) => x.month === m);
                return (
                  <button class="li" onClick={() => setEditing({ month: m, draft: h ? { ...h } : {}, source: h?.source ?? 'manuel' })}>
                    <span class="li-main">
                      <span class="li-title">{monthLabel(m).replace(/^./, (x) => x.toUpperCase())}</span>
                      <span class="li-sub">{h ? `${euros(h.net)} net${h.source === 'pdf' ? ', importé du PDF' : ''}` : 'Manquant : touche pour saisir'}</span>
                    </span>
                    <span class="li-end">{h ? <span class="tag ok">OK</span> : <span class="tag warn">À saisir</span>}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>
      {editing && (
        <MonthSheet
          months={months}
          init={editing}
          onClose={() => { setEditing(null); setQueue([]); }}
          onSave={saveMonth}
        />
      )}
    </>
  );
}

function MonthSheet({ months, init, onClose, onSave }: { months: Month[]; init: { month: Month; draft: Partial<HistoryMonth>; source: 'pdf' | 'manuel' }; onClose: () => void; onSave: (h: HistoryMonth) => void }) {
  const [month, setMonth] = useState<Month>(init.month);
  const [d, setD] = useState<Partial<HistoryMonth>>(init.draft);
  return (
    <Sheet title={init.source === 'pdf' ? 'Vérifie le bulletin lu' : 'Bulletin du mois'} onClose={onClose}>
      {init.source === 'pdf' && <Banner tone="info">Voici ce que l’app a lu dans le PDF. Corrige si besoin : la saisie manuelle prime.</Banner>}
      <div class="field">
        <label for="hm-month">Mois</label>
        <select id="hm-month" class="input" value={month} onChange={(e) => setMonth((e.target as HTMLSelectElement).value as Month)}>
          {months.map((m) => <option value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      <EuroInput label="Salaire net" cents={d.net} allowEmpty onChange={(v) => setD({ ...d, net: v })} />
      <EuroInput label="Salaire brut (si indiqué)" cents={d.brut} allowEmpty onChange={(v) => setD({ ...d, brut: v })} />
      <div class="grid2">
        <NumberInput label="Heures normales" value={d.heures} onChange={(v) => setD({ ...d, heures: v })} step={0.01} />
        <NumberInput label="Jours d’activité" value={d.jours} onChange={(v) => setD({ ...d, jours: v })} />
      </div>
      <EuroInput label="Indemnités d’entretien" cents={d.entretien} allowEmpty onChange={(v) => setD({ ...d, entretien: v })} />
      <button class="btn btn-primary btn-block btn-lg" disabled={d.net == null} onClick={() => onSave({ month, net: d.net!, brut: d.brut, heures: d.heures, jours: d.jours, entretien: d.entretien, cpJours: d.cpJours, source: init.source })}>
        Enregistrer ce mois
      </button>
    </Sheet>
  );
}
