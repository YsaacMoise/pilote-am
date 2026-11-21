import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, putContract, toast, useStore } from '../store';
import { addMonths, monthLabel, monthOf, shortDate, today, type Month } from '../engine/dates';
import { finDeContrat, MOTIF_LABEL, type DemandeurInexecution, type Motif } from '../engine/fin';
import type { Rupture } from '../engine/model';
import { euros, eurosArrondis, hoursLabel } from '../engine/money';
import { Banner, Choices, DateInput, EuroInput, Gommette, Topbar } from '../ui/kit';

/** « de mars », « d’août », « d’octobre » */
const deMois = (l: string) => (/^[aeiouyéè]/i.test(l) ? `d’${l}` : `de ${l}`);

export function Fin({ id }: { id?: string }) {
  const s = useStore();
  const [cid, setCid] = useState(id ?? s.contracts[0]?.id);
  // T-045b : les réponses enregistrées avec le contrat sont reprises à l'ouverture de l'écran.
  const r0 = s.contracts.find((x) => x.id === (id ?? s.contracts[0]?.id))?.rupture;
  const [notif, setNotif] = useState(r0?.notif ?? today());
  const [motif, setMotif] = useState<Motif>(r0?.motif ?? 'retrait');
  const [remise, setRemise] = useState<'recommande' | 'main_propre'>('recommande');
  // Première présentation : suit la date d'envoi tant qu'elle n'est pas saisie (relecture contradictoire, point 1).
  const [presentation, setPresentation] = useState<string | null>(r0?.presentation ?? null);
  // T-045 : préavis fait en entier ou non (CCN art. 64 et 64.2) et dernier jour travaillé.
  const [preavisFait, setPreavisFait] = useState<'oui' | DemandeurInexecution>(r0 && r0.preavis !== 'execute' ? r0.preavis : 'oui');
  const [dernierTravaille, setDernierTravaille] = useState<string | null>(r0?.dernierJourTravaille ?? null);
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
  const inexecution = avecPreavis && preavisFait !== 'oui' ? { demandeur: preavisFait, dernierJourTravaille: dernierTravaille ?? envoi } : undefined;
  // T-045b : la simulation ne tient pas compte de la date de fin déjà enregistrée ; un écart est signalé et l'enregistrement
  // la remplace. Le calcul des mois, lui, refuse toute date de fin qui ne concorde pas avec le préavis (controleFinContrat).
  const parMois: Partial<Record<Month, number>> = {};
  for (const b of s.bulletins) if (b.cid === c.id && b.brut) parMois[b.month] = b.brut;
  const f = finDeContrat(ctxFor({ ...c, end: undefined }), envoi, motif, s.settings.enfantsACharge, pres, inexecution, { parMois, total: brutTotal, jusqua: brutJusqua });
  const rupture: Rupture = {
    motif, notif: envoi, ...(pres !== envoi ? { presentation: pres } : {}),
    preavis: inexecution ? inexecution.demandeur : 'execute', ...(inexecution ? { dernierJourTravaille: inexecution.dernierJourTravaille } : {}),
  };
  const enregistre = c.end === f.dernierJour && JSON.stringify(c.rupture) === JSON.stringify(rupture);
  const enregistrer = async () => {
    const prev = await putContract({ ...c, end: f.dernierJour, rupture });
    toast(`Fin de contrat enregistrée : dernier jour le ${shortDate(f.dernierJour)}`, prev ? async () => { await putContract(prev); } : undefined);
  };
  const total = (f.ruptureAConfirmer ? 0 : f.indemniteRupture) + f.regularisation + f.cpIndemnite + f.indemnitePreavis;
  const aConfirmer = !!f.cpAConfirmer || !!f.ruptureAConfirmer || !!f.regularisationAConfirmer || !!f.indemnitePreavisAConfirmer;
  // L'indemnité de rupture dépend du brut : tant qu'un mois est estimé, elle est affichée arrondie, comme une estimation.
  const surBrut = motif === 'retrait' || motif === 'deces' || motif === 'inaptitude' || motif === 'inaptitude_pro';
  const estime = surBrut && f.brutsEstimes.length > 0;
  const periode = f.brutsEstimes.length === 1 ? monthLabel(f.brutsEstimes[0]) : `${f.brutsEstimes.length} mois, ${deMois(monthLabel(f.brutsEstimes[0] ?? '2026-01'))} à ${monthLabel(f.brutsEstimes[f.brutsEstimes.length - 1] ?? '2026-01')}`;
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
                <Choices label="Le préavis est-il fait en entier ?" value={preavisFait} onChange={setPreavisFait} options={[
                  { v: 'oui', l: 'Oui, ou il est en cours' },
                  { v: 'am_acceptee', l: 'Non, à ma demande, et les parents ont accepté', sub: 'Le contrat finit à ton dernier jour travaillé' },
                  { v: 'employeur', l: 'Non, les parents m’en dispensent', sub: 'Ils te doivent une indemnité égale au préavis' },
                  { v: 'am_sans_accord', l: 'Non, je pars sans leur accord' },
                ]} />
                {preavisFait !== 'oui' && (
                  <DateInput label="Dernier jour travaillé" hint="Le dernier jour où tu as accueilli l’enfant." value={dernierTravaille ?? envoi} min={envoi} onChange={(v) => setDernierTravaille(v || null)} />
                )}
              </>
            ) : avecLettre ? (
              <DateInput label="Date d’envoi ou de remise de la lettre" hint="Pas de préavis pour ce motif : le contrat s’arrête à cette date." value={notif} min={c.start} onChange={changeEnvoi} />
            ) : (
              <DateInput label="Date du décès" value={notif} min={c.start} onChange={setNotif} />
            )}
          </fieldset>
        </section>
        {f.nonGere ? (
          <section class="card stack" aria-labelledby="fin-ng" aria-live="polite">
            <h2 id="fin-ng">Fin de contrat non calculée</h2>
            {f.nonGere.map((t) => <Banner tone="warn">{t}</Banner>)}
            <p class="hint">L’app ne donne aucun montant : préavis, indemnités et congés non pris en dépendent. Fais le calcul avec les parents, sans l’app.</p>
          </section>
        ) : <>
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
        {f.preavisFinAConfirmer && !inexecution && <Banner tone="warn">{f.preavisFinAConfirmer}</Banner>}
        {f.cpAConfirmer && <Banner tone="warn">{f.cpAConfirmer}</Banner>}
        {f.regularisationAConfirmer && <Banner tone="warn">{f.regularisationAConfirmer}</Banner>}
        {f.indemnitePreavisAConfirmer && <Banner tone="warn">{f.indemnitePreavisAConfirmer}</Banner>}
        {f.ruptureVariantes && <Banner tone="warn">{f.ruptureVariantes}</Banner>}
        <section class="card stack" aria-labelledby="fin-res" aria-live="polite">
          <h2 id="fin-res">Ce qui t’est dû</h2>
          <dl class="kv">
            <dt>{avecLettre ? 'Ancienneté à l’envoi de la lettre' : 'Ancienneté'}</dt><dd>{f.ancienneteMois} mois</dd>
            <dt>Préavis</dt><dd>{f.preavisLabel}</dd>
            <dt>{motif === 'deces' || inexecution ? 'Dernier jour' : 'Dernier jour (préavis inclus)'}</dt><dd>{shortDate(f.dernierJour)}{f.preavisFinAConfirmer && !inexecution ? ' (à confirmer)' : ''}</dd>
          </dl>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Indemnité de rupture</span><span class="decl-hint">{f.ruptureExplication}</span></span><span class="decl-value">{f.ruptureAConfirmer ? 'à confirmer' : estime && f.indemniteRupture > 0 ? `environ ${eurosArrondis(f.indemniteRupture)}` : euros(f.indemniteRupture)}</span></div>
            {motif === 'deces' && <div class="decl-line"><span class="decl-label"><span>Indemnité égale au préavis</span><span class="decl-hint">{f.indemnitePreavisExplication}</span></span><span class="decl-value">{f.indemnitePreavisAConfirmer ? 'à confirmer' : euros(f.indemnitePreavis)}</span></div>}
            <div class="decl-line"><span class="decl-label"><span>Régularisation</span><span class="decl-hint">{f.regularisationAConfirmer ? 'Montant à confirmer : voir l’encadré plus haut' : f.regularisation > 0 || termsAt(c, f.dernierJour).yearType === 'incomplete' ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé') : 'Année complète : pas de régularisation'}</span></span><span class="decl-value">{f.regularisationAConfirmer ? 'à confirmer' : euros(f.regularisation)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Congés non pris</span><span class="decl-hint">{f.cpExplication}</span></span><span class="decl-value">{f.cpAConfirmer ? 'à confirmer' : euros(f.cpIndemnite)}</span></div>
          </div>
          <div class="spread"><b>{aConfirmer ? 'Total estimé, hors salaire du dernier mois et sommes à confirmer' : 'Total estimé, hors salaire du dernier mois'}</b><span class="decl-value">{estime && f.indemniteRupture > 0 && !f.ruptureAConfirmer ? `environ ${eurosArrondis(total)}` : euros(total)}</span></div>
          <p class="hint">L’indemnité de rupture est calculée sur {estime ? `environ ${eurosArrondis(f.totalBrut)}` : euros(f.totalBrut)} de salaires bruts{estime ? ', en partie estimés à partir du net : saisis le total de tes bulletins plus haut pour un montant exact' : ''}. Elle n’est pas soumise aux cotisations.</p>
        </section>
        </>}
        <section class="card stack" aria-labelledby="fin-save">
          <h2 id="fin-save">Enregistrer cette fin de contrat</h2>
          {c.end && !enregistre && <Banner tone="warn">La date de fin enregistrée ({shortDate(c.end)}) ou les réponses enregistrées ne correspondent pas à ce calcul. Tant qu’elles ne concordent pas avec le préavis, l’app ne calcule pas les derniers mois.</Banner>}
          <p class="hint">Enregistre la date de fin ({shortDate(f.dernierJour)}) et tes réponses sur la lettre et le préavis : le calcul de chaque mois s’en sert. Sans elles, l’app ne calcule pas les derniers mois du contrat.</p>
          {enregistre ? <p>Enregistrée.</p> : <button class="btn btn-primary btn-block" onClick={enregistrer}>Enregistrer la fin du contrat</button>}
        </section>
      </main>
    </>
  );
}
