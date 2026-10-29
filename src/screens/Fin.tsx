import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, useStore } from '../store';
import { shortDate, today } from '../engine/dates';
import { finDeContrat, MOTIF_LABEL, type Motif } from '../engine/fin';
import { euros, hoursLabel } from '../engine/money';
import { Banner, Choices, DateInput, Gommette, Topbar } from '../ui/kit';

export function Fin({ id }: { id?: string }) {
  const s = useStore();
  const [cid, setCid] = useState(id ?? s.contracts[0]?.id);
  const [notif, setNotif] = useState(today());
  const [motif, setMotif] = useState<Motif>('retrait');
  const c = s.contracts.find((x) => x.id === cid);
  if (!c) return <><Topbar title="Fin de contrat" back="#/plus" screen="fin" /><main><div class="card empty"><p>Aucun contrat.</p></div></main></>;
  const f = finDeContrat(ctxFor(c), notif < c.start ? c.start : notif, motif, s.settings.enfantsACharge);
  const total = f.indemniteRupture + f.regularisation + f.cpIndemnite;
  return (
    <>
      <Topbar title="Fin de contrat" back="#/plus" screen="fin" />
      <main>
        {s.contracts.length > 1 && (
          <div class="chips" role="group" aria-label="Enfant">
            {s.contracts.map((k) => (
              <button class="chip" aria-pressed={k.id === c.id} onClick={() => setCid(k.id)}><Gommette name={k.child} color={k.color} size="sm" />{k.child}</button>
            ))}
          </div>
        )}
        <p class="muted">Une simulation pour savoir ce qui t’est dû. L’app ne produit pas les documents officiels (certificat de travail, attestation France Travail, reçu pour solde de tout compte) : c’est au parent employeur de les établir.</p>
        <section class="card">
          <fieldset>
            <legend>La rupture</legend>
            <DateInput label="Date où la décision est annoncée" value={notif} min={c.start} onChange={setNotif} />
            <Choices label="Qui arrête et pourquoi" value={motif} onChange={setMotif} options={(Object.keys(MOTIF_LABEL) as Motif[]).map((k) => ({ v: k, l: MOTIF_LABEL[k] }))} />
          </fieldset>
        </section>
        {f.alertes.map((a) => <Banner tone="warn">{a} <a href={`#/historique/${c.id}`}>Ouvrir l’historique</a></Banner>)}
        <section class="card stack" aria-labelledby="fin-res" aria-live="polite">
          <h2 id="fin-res">Ce qui t’est dû</h2>
          <dl class="kv">
            <dt>Ancienneté à l’annonce</dt><dd>{f.ancienneteMois} mois</dd>
            <dt>Préavis</dt><dd>{f.preavisLabel}</dd>
            <dt>Dernier jour (préavis inclus)</dt><dd>{shortDate(f.dernierJour)}</dd>
          </dl>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Indemnité de rupture</span><span class="decl-hint">{f.ruptureExplication}</span></span><span class="decl-value">{euros(f.indemniteRupture)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Régularisation</span><span class="decl-hint">{f.regularisation > 0 || termsAt(c, f.dernierJour).yearType === 'incomplete' ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé') : 'Année complète : pas de régularisation'}</span></span><span class="decl-value">{euros(f.regularisation)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Congés non pris</span><span class="decl-hint">{f.cpExplication}</span></span><span class="decl-value">{euros(f.cpIndemnite)}</span></div>
          </div>
          <div class="spread"><b>Total estimé, hors salaire du dernier mois</b><span class="decl-value">{euros(total)}</span></div>
          <p class="hint">L’indemnité de rupture est calculée sur {euros(f.totalBrut)} de salaires bruts (estimés à partir du net quand le brut est inconnu). Elle n’est pas soumise aux cotisations.</p>
        </section>
      </main>
    </>
  );
}
