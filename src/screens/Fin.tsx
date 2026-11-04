import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, useStore } from '../store';
import { addMonths, monthLabel, monthOf, shortDate, today, type Month } from '../engine/dates';
import { finDeContrat, MOTIF_LABEL, type Motif } from '../engine/fin';
import { euros, eurosArrondis, hoursLabel } from '../engine/money';
import { Banner, Choices, DateInput, EuroInput, Gommette, Topbar } from '../ui/kit';

export function Fin({ id }: { id?: string }) {
  const s = useStore();
  const [cid, setCid] = useState(id ?? s.contracts[0]?.id);
  const [notif, setNotif] = useState(today());
  const [motif, setMotif] = useState<Motif>('retrait');
  const [remise, setRemise] = useState<'recommande' | 'main_propre'>('recommande');
  // Première présentation : suit la date d'envoi tant qu'elle n'est pas saisie (relecture contradictoire, point 1).
  const [presentation, setPresentation] = useState<string | null>(null);
  // C-008 : total des salaires bruts lu sur les bulletins Pajemploi, pour ne pas calculer l'indemnité sur une estimation.
  const [brutTotal, setBrutTotal] = useState<number | undefined>(undefined);
  const [brutJusqua, setBrutJusqua] = useState<Month>(addMonths(monthOf(today()), -1));
  const changeEnvoi = (v: string) => { setNotif(v); if (presentation && presentation < v) setPresentation(null); };
  const c = s.contracts.find((x) => x.id === cid);
  if (!c) return <><Topbar title="Fin de contrat" back="#/plus" screen="fin" /><main><div class="card empty"><p>Aucun contrat.</p></div></main></>;
  const envoi = notif < c.start ? c.start : notif;
  // C-017 : le préavis part de la première présentation de la lettre recommandée ou de la remise en main propre
  // contre décharge (art. 120), jamais de l'annonce orale.
  const avecLettre = motif !== 'deces';
  // Seuls le retrait et la démission ont un préavis : pour les autres motifs, seule la date d'envoi compte.
  const avecPreavis = motif === 'retrait' || motif === 'demission';
  const presVue = presentation && presentation > envoi ? presentation : envoi;
  const pres = avecPreavis && remise === 'recommande' ? presVue : envoi;
  const parMois: Partial<Record<Month, number>> = {};
  for (const b of s.bulletins) if (b.cid === c.id && b.brut) parMois[b.month] = b.brut;
  const f = finDeContrat(ctxFor(c), envoi, motif, s.settings.enfantsACharge, pres, { parMois, total: brutTotal, jusqua: brutJusqua });
  const total = f.indemniteRupture + f.regularisation + f.cpIndemnite;
  // L'indemnité de rupture dépend du brut : tant qu'un mois est estimé, elle est affichée arrondie, comme une estimation.
  const surBrut = motif === 'retrait' || motif === 'deces' || motif === 'inaptitude' || motif === 'inaptitude_pro';
  const estime = surBrut && f.brutsEstimes.length > 0;
  const periode = f.brutsEstimes.length === 1 ? monthLabel(f.brutsEstimes[0]) : `${f.brutsEstimes.length} mois, de ${monthLabel(f.brutsEstimes[0] ?? '2026-01')} à ${monthLabel(f.brutsEstimes[f.brutsEstimes.length - 1] ?? '2026-01')}`;
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
            <Choices label="Qui arrête et pourquoi" value={motif} onChange={setMotif} options={(Object.keys(MOTIF_LABEL) as Motif[]).map((k) => ({ v: k, l: MOTIF_LABEL[k] }))} />
            {avecPreavis ? (
              <>
                <Choices label="Comment la lettre est donnée" value={remise} onChange={(v) => { setRemise(v); setPresentation(null); }} options={[
                  { v: 'recommande', l: 'Lettre recommandée avec accusé de réception' },
                  { v: 'main_propre', l: 'Lettre remise en main propre contre décharge', sub: 'L’autre signe et date un double' },
                ]} />
                {remise === 'recommande' ? (
                  <>
                    <DateInput label="Date d’envoi de la lettre" hint="Sert à compter l’ancienneté." value={notif} min={c.start} onChange={changeEnvoi} />
                    <DateInput label="Date de première présentation de la lettre" hint="Le jour où le facteur la présente la première fois (accusé de réception ou avis de passage). Le préavis part de ce jour, pas de l’annonce orale." value={presVue} min={envoi} onChange={(v) => setPresentation(v || null)} />
                  </>
                ) : (
                  <DateInput label="Date de remise de la lettre contre décharge" hint="Le préavis part de ce jour, pas de l’annonce orale." value={notif} min={c.start} onChange={changeEnvoi} />
                )}
              </>
            ) : avecLettre ? (
              <DateInput label="Date d’envoi ou de remise de la lettre" hint="Pas de préavis pour ce motif : le contrat s’arrête à cette date." value={notif} min={c.start} onChange={changeEnvoi} />
            ) : (
              <DateInput label="Date du décès" value={notif} min={c.start} onChange={setNotif} />
            )}
          </fieldset>
        </section>
        {surBrut && (f.brutsEstimes.length > 0 || brutTotal != null) && (
          <section class="card stack-sm" aria-labelledby="fin-brut">
            <h2 id="fin-brut">Salaires bruts de tes bulletins</h2>
            <p>L’indemnité de rupture se calcule sur les salaires bruts. {brutTotal == null && f.brutsEstimes.length > 0 ? <>Le brut n’est pas connu pour {periode} : l’app l’estime à partir du net, ce qui peut être faux de quelques euros.</> : 'Le total saisi est utilisé.'}</p>
            <EuroInput label="Total des salaires bruts de tes bulletins" hint="Additionne la ligne « salaire brut » de chaque bulletin Pajemploi de ce contrat, du premier jusqu’au mois indiqué ci-dessous, congés payés compris." cents={brutTotal} allowEmpty onChange={setBrutTotal} />
            <label class="label" for="fin-jusqua">Dernier bulletin compris dans ce total</label>
            <input id="fin-jusqua" class="input" type="month" value={brutJusqua} min={c.start.slice(0, 7)} max={monthOf(f.dernierJour)} onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) setBrutJusqua(v as Month); }} />
            {brutTotal != null && f.brutsEstimes.length > 0 && <p class="hint">Les mois suivants ({periode}) n’ont pas encore de bulletin : leur brut reste estimé.</p>}
          </section>
        )}
        {f.alertes.map((a) => <Banner tone="warn">{a} <a href={`#/historique/${c.id}`}>Ouvrir l’historique</a></Banner>)}
        <section class="card stack" aria-labelledby="fin-res" aria-live="polite">
          <h2 id="fin-res">Ce qui t’est dû</h2>
          <dl class="kv">
            <dt>{avecLettre ? 'Ancienneté à l’envoi de la lettre' : 'Ancienneté'}</dt><dd>{f.ancienneteMois} mois</dd>
            <dt>Préavis</dt><dd>{f.preavisLabel}</dd>
            <dt>Dernier jour (préavis inclus)</dt><dd>{shortDate(f.dernierJour)}</dd>
          </dl>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Indemnité de rupture</span><span class="decl-hint">{f.ruptureExplication}</span></span><span class="decl-value">{estime && f.indemniteRupture > 0 ? `environ ${eurosArrondis(f.indemniteRupture)}` : euros(f.indemniteRupture)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Régularisation</span><span class="decl-hint">{f.regularisation > 0 || termsAt(c, f.dernierJour).yearType === 'incomplete' ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé') : 'Année complète : pas de régularisation'}</span></span><span class="decl-value">{euros(f.regularisation)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Congés non pris</span><span class="decl-hint">{f.cpExplication}</span></span><span class="decl-value">{euros(f.cpIndemnite)}</span></div>
          </div>
          <div class="spread"><b>Total estimé, hors salaire du dernier mois</b><span class="decl-value">{estime && f.indemniteRupture > 0 ? `environ ${eurosArrondis(total)}` : euros(total)}</span></div>
          <p class="hint">L’indemnité de rupture est calculée sur {estime ? `environ ${eurosArrondis(f.totalBrut)}` : euros(f.totalBrut)} de salaires bruts{estime ? ', en partie estimés à partir du net : saisis le total de tes bulletins plus haut pour un montant exact' : ''}. Elle n’est pas soumise aux cotisations.</p>
        </section>
      </main>
    </>
  );
}
