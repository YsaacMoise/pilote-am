import { useState } from 'preact/hooks';
import { ctxFor, logUsage, putBulletin, state, toast, uid, useStore } from '../store';
import { addMonths, monthLabel, monthOf, today, type Month } from '../engine/dates';
import { computeMonth } from '../engine/month';
import { controle } from '../engine/controle';
import { euros } from '../engine/money';
import type { Bulletin } from '../engine/model';
import { Banner, EuroInput, Gommette, NumberInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { ScanError, parseBulletin, pdfText } from '../pdf';

export function Controle({ cid, month }: { cid?: string; month?: string }) {
  const s = useStore();
  const [c0, setCid] = useState(cid ?? s.contracts[0]?.id);
  const [m, setM] = useState<Month>((month as Month) ?? addMonths(monthOf(today()), -1));
  const c = s.contracts.find((x) => x.id === c0);
  const saved = c ? s.bulletins.find((b) => b.cid === c.id && b.month === m) : undefined;
  const [b, setB] = useState<Partial<Bulletin>>(saved ?? {});
  const [key, setKey] = useState(0);
  const [msg, setMsg] = useState('');
  const [alerte, setAlerte] = useState(false);

  if (!c) return <><Topbar title="Contrôle" back="#/plus" screen="controle" /><main><div class="card empty"><p>Ajoute d’abord un contrat.</p></div></main></>;
  const r = computeMonth(ctxFor(c), m, state.settings.enfantsACharge);
  const filled = b.net != null || b.brut != null || b.heures != null;
  const checks = filled ? controle({ id: '', cid: c.id, month: m, source: 'manuel', ...b } as Bulletin, r, c.rateNet) : [];

  async function onPdf(f: File | undefined) {
    if (!f) return;
    setMsg('Lecture du PDF…');
    setAlerte(false);
    try {
      const x = parseBulletin(await pdfText(f));
      setB({ net: x.net, brut: x.brut, heures: x.heures, jours: x.jours, entretien: x.entretien, source: 'pdf' });
      if (x.month) setM(x.month);
      setKey(key + 1);
      setMsg(x.net == null && x.brut == null ? 'Aucun montant reconnu dans ce PDF : saisis-les à la main.' : 'Montants lus dans le PDF : vérifie-les.');
      logUsage('pdf_controle', 'controle');
    } catch (e) {
      if (e instanceof ScanError) { setMsg(e.message); setAlerte(true); logUsage('pdf_scan', 'controle'); }
      else setMsg('Impossible de lire ce PDF. Saisis les montants à la main.');
    }
  }

  return (
    <>
      <Topbar title="Contrôler un bulletin" back="#/plus" screen="controle" />
      <main>
        {s.contracts.length > 1 && (
          <div class="chips" role="group" aria-label="Enfant">
            {s.contracts.map((k) => (
              <button class="chip" aria-pressed={k.id === c.id} onClick={() => { setCid(k.id); setB({}); setKey(key + 1); }}>
                <Gommette name={k.child} color={k.color} size="sm" />{k.child}
              </button>
            ))}
          </div>
        )}
        <div class="month-nav">
          <button class="icon-btn" aria-label="Mois précédent" onClick={() => { setM(addMonths(m, -1)); setB({}); setKey(key + 1); }}><Icon name="left" /></button>
          <h2 aria-live="polite">{monthLabel(m).replace(/^./, (x) => x.toUpperCase())}</h2>
          <button class="icon-btn" aria-label="Mois suivant" disabled={m >= monthOf(today())} onClick={() => { setM(addMonths(m, 1)); setB({}); setKey(key + 1); }}><Icon name="right" /></button>
        </div>
        <p class="muted">Recopie les chiffres du bulletin Pajemploi de {c.child}, ou importe le PDF. L’app compare avec son calcul : {euros(r.netTotal)} net, {r.heuresNormales} h, {r.joursActivite} jours.</p>
        <label class="btn btn-outline btn-block">
          <Icon name="upload" />Importer le bulletin PDF
          <input type="file" accept="application/pdf,.pdf" class="sr-only" onChange={(e) => onPdf((e.target as HTMLInputElement).files?.[0])} />
        </label>
        {msg && (alerte ? <div role="status"><Banner tone="warn">{msg}</Banner></div> : <p role="status" class="muted">{msg}</p>)}
        <section class="card" key={key}>
          <fieldset>
            <legend>Le bulletin</legend>
            <div class="grid2">
              <EuroInput label="Salaire net" cents={b.net} allowEmpty onChange={(v) => setB({ ...b, net: v })} />
              <EuroInput label="Salaire brut" cents={b.brut} allowEmpty onChange={(v) => setB({ ...b, brut: v })} />
            </div>
            <div class="grid2">
              <NumberInput label="Heures normales" value={b.heures} step={0.01} onChange={(v) => setB({ ...b, heures: v })} />
              <NumberInput label="Jours d’activité" value={b.jours} onChange={(v) => setB({ ...b, jours: v })} />
            </div>
            <EuroInput label="Indemnités d’entretien" cents={b.entretien} allowEmpty onChange={(v) => setB({ ...b, entretien: v })} />
          </fieldset>
        </section>
        {checks.length > 0 && (
          <section class="card stack" aria-labelledby="res" aria-live="polite">
            <h2 id="res">Résultat</h2>
            {checks.map((x) => (
              <div class="row" style={{ alignItems: 'flex-start' }}>
                <span class={`check-${x.level}`}><Icon name={x.level === 'ok' ? 'check' : x.level === 'warn' ? 'alert' : 'info'} /></span>
                <div class="stack-sm" style={{ gap: '2px' }}><b>{x.title}</b><span class="muted small">{x.detail}</span></div>
              </div>
            ))}
            <p class="hint">Le brut est contrôlé par sa cohérence avec le net (environ 78 % pour une assistante maternelle) et le minimum conventionnel.</p>
          </section>
        )}
        {filled && (
          <button class="btn btn-primary btn-block btn-lg" onClick={async () => {
            await putBulletin({ id: saved?.id ?? uid(), cid: c.id, month: m, source: (b.source as any) ?? 'manuel', net: b.net, brut: b.brut, heures: b.heures, jours: b.jours, entretien: b.entretien });
            toast('Bulletin enregistré');
          }}>Garder ce bulletin</button>
        )}
        {r.fromHistory && <Banner tone="info">Ce mois est antérieur au suivi par l’app : la comparaison utilise l’historique.</Banner>}
      </main>
    </>
  );
}
