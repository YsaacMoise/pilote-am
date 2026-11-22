import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, putContract, toast, useStore } from '../store';
import { addMonths, monthLabel, monthOf, shortDate, today, type Month } from '../engine/dates';
import { FIN_CDD_LABEL, finDeContrat, finDeCdd, MESSAGE_CDD_IFC, MESSAGE_CDD_PAS_DE_PREAVIS, MOTIF_LABEL, MOTIFS_CDI, type DemandeurInexecution, type FinCdd, type FinCddNonGere, type FinResult, type Motif } from '../engine/fin';
import { FINS_CDD, FINS_CDD_NON_GEREES, type Contract, type Rupture } from '../engine/model';
import { cddDeuxLectures } from '../engine/cdd';
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
  const choixEnfant = s.contracts.length > 1 && (
    <div class="chips" role="group" aria-label="Enfant">
      {s.contracts.map((k) => (
        <button class="chip" aria-pressed={k.id === c.id} onClick={() => setCid(k.id)}><Gommette name={k.child} color={k.color} size="sm" />{k.child}</button>
      ))}
    </div>
  );
  // T-076 : un CDD finit sans lettre ni préavis (R-CDD-06) : écran à part.
  if (c.cdd) return <><Topbar title="Fin de contrat" back="#/plus" screen="fin" /><main>{choixEnfant}<FinCddEcran key={c.id} c={c} /></main></>;
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
  // T-050d (C-4) : le dernier mois est dans les bulletins (total saisi ou brut lu) : l'ICCP et la régularisation y sont déjà.
  const finDansBulletins = ((brutTotal ?? 0) > 0 && brutJusqua >= monthOf(f.dernierJour)) || (parMois[monthOf(f.dernierJour)] ?? 0) > 0;
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
        {choixEnfant}
        <p class="muted">Une simulation pour savoir ce qui t’est dû. L’app ne produit pas les documents officiels (certificat de travail, attestation France Travail, reçu pour solde de tout compte) : c’est au parent employeur de les établir.</p>
        <section class="card">
          <fieldset>
            <legend>La rupture</legend>
            <Choices label="Qui arrête et pourquoi" value={motif} onChange={setMotif} options={MOTIFS_CDI.map((k) => ({ v: k, l: MOTIF_LABEL[k] }))} />
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
          <p class="hint">L’indemnité de rupture est calculée sur {estime ? `environ ${eurosArrondis(f.totalBrut)}` : euros(f.totalBrut)} de salaires bruts, régularisation et indemnité de congés de la fin comprises{finDansBulletins ? ' (elles sont dans tes bulletins)' : f.cpAConfirmer || f.regularisationAConfirmer ? ' (celles qui sont à confirmer n’y sont pas encore comptées)' : ''}{estime ? ', en partie estimés à partir du net : saisis le total de tes bulletins plus haut pour un montant exact' : ''}. Elle n’est pas soumise aux cotisations.{motif === 'deces' ? ' L’indemnité égale au préavis n’y est pas comptée pour l’instant : ce point est en cours d’examen.' : ''}</p>
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

/** Ligne « à confirmer » d'une somme de la fin d'un CDD : part sûre, écart hors du total */
const partAConfirmer = (p: FinResult['cpPartAConfirmer']) => (p ? ` + ${euros(p.montant)} à confirmer` : '');

/**
 * T-076 : fin d'un CDD (regles/t076-cdd.md, parties 5.1 et 5.2 ; decisions-direction, section 2). Pas de lettre ni de préavis :
 * le dernier jour et la façon dont le CDD finit. Sommes : indemnité de fin de contrat (IFC), régularisation, congés non pris,
 * chacune avec sa part à confirmer hors du total.
 */
function FinCddEcran({ c }: { c: Contract }) {
  const s = useStore();
  const r0 = c.rupture?.motif === 'fin_cdd' ? c.rupture : undefined;
  const [dernier, setDernier] = useState<string>(r0?.notif ?? c.end ?? c.cddTerme ?? today());
  const [finCdd, setFinCdd] = useState<FinCdd | FinCddNonGere | undefined>(r0?.finCdd);
  const jour = dernier < c.start ? c.start : dernier;
  const f = finDeCdd(ctxFor({ ...c, end: undefined }), jour, finCdd, s.settings.enfantsACharge);
  const rupture: Rupture = { motif: 'fin_cdd', notif: jour, preavis: 'execute', ...(finCdd ? { finCdd } : {}) };
  const enregistre = c.end === jour && JSON.stringify(c.rupture) === JSON.stringify(rupture);
  const enregistrer = async () => {
    const prev = await putContract({ ...c, end: jour, rupture });
    toast(`Fin du CDD enregistrée : dernier jour le ${shortDate(jour)}`, prev ? async () => { await putContract(prev); } : undefined);
  };
  const ifcNet = f.ifcAConfirmer ? 0 : f.ifcNet ?? 0;
  const total = ifcNet + (f.regularisationAConfirmer ? 0 : f.regularisation) + (f.cpAConfirmer ? 0 : f.cpIndemnite);
  const aConfirmer = !!(f.ifcAConfirmer || f.ifcPartAConfirmer || f.cpAConfirmer || f.cpPartAConfirmer || f.regularisationAConfirmer || f.regularisationPartAConfirmer);
  const choix = [...FINS_CDD, ...FINS_CDD_NON_GEREES];
  // m3 : CDD à deux lectures du salaire (P1, P2) : la somme de fin complète le total au plus petit des deux calculs.
  const deuxLectures = cddDeuxLectures(c) && f.finCdd !== 'suite_cdi';
  return (
    <>
      <p class="muted">Une simulation pour savoir ce qui t’est dû. L’app ne produit pas les documents officiels (certificat de travail, attestation France Travail, reçu pour solde de tout compte) : c’est au parent employeur de les établir.</p>
      <section class="card">
        <fieldset>
          <legend>La fin du CDD</legend>
          <p class="hint">{MESSAGE_CDD_PAS_DE_PREAVIS}</p>
          <DateInput label="Dernier jour du contrat" hint={c.cddTerme ? `${c.cddTermeImprecis ? 'Fin de la durée minimale' : 'Date de fin prévue'} : ${shortDate(c.cddTerme)}. Si la date a été reportée, mets le vrai dernier jour.` : 'Le dernier jour du contrat.'} value={jour} min={c.start} onChange={(v) => setDernier(v || jour)} />
          <Choices label="Comment finit le CDD ?" value={finCdd} onChange={setFinCdd} options={choix.map((k) => ({ v: k, l: FIN_CDD_LABEL[k].l, sub: FIN_CDD_LABEL[k].sub }))} />
        </fieldset>
      </section>
      {f.nonGere ? (
        <section class="card stack" aria-labelledby="fincdd-ng" aria-live="polite">
          <h2 id="fincdd-ng">Fin du CDD non calculée</h2>
          {f.nonGere.map((t) => <Banner tone="warn">{t}</Banner>)}
          <p class="hint">L’app ne donne aucun montant.</p>
        </section>
      ) : <>
        {f.alertes.map((a) => <Banner tone="warn">{a}</Banner>)}
        {[f.ifcAConfirmer, f.ifcPartAConfirmer?.message, f.regularisationAConfirmer, f.regularisationPartAConfirmer?.message, f.cpAConfirmer, f.cpPartAConfirmer?.message].filter(Boolean).map((t) => <Banner tone="warn">{t}</Banner>)}
        <section class="card stack" aria-labelledby="fincdd-res" aria-live="polite">
          <h2 id="fincdd-res">Ce qui t’est dû</h2>
          <dl class="kv">
            <dt>Préavis</dt><dd>Aucun</dd>
            <dt>Dernier jour</dt><dd>{shortDate(f.dernierJour)}</dd>
          </dl>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Indemnité de fin de contrat</span><span class="decl-hint">{f.ifcExplication}</span></span><span class="decl-value">{f.ifcAConfirmer ? 'à confirmer' : `${euros(ifcNet)} net${partAConfirmer(f.ifcPartAConfirmer)}${ifcNet > 0 ? ` (environ ${eurosArrondis(f.ifc ?? 0)} brut)` : ''}`}</span></div>
            <div class="decl-line"><span class="decl-label"><span>{deuxLectures ? 'Régularisation et complément de salaire' : 'Régularisation'}</span><span class="decl-hint">{f.regularisationAConfirmer ? 'Montant à confirmer : voir l’encadré plus haut' : f.finCdd === 'suite_cdi' ? 'Ton contrat continue en CDI : rien n’est dû maintenant' : deuxLectures ? 'Ce qui porte ton total au plus petit des deux calculs du CDD : voir l’encadré plus haut' : termsAt(c, f.dernierJour).yearType === 'incomplete' ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé') : 'Accueil toute l’année : pas de régularisation'}</span></span><span class="decl-value">{f.regularisationAConfirmer ? 'à confirmer' : `${euros(f.regularisation)}${partAConfirmer(f.regularisationPartAConfirmer)}`}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Congés non pris</span><span class="decl-hint">{f.cpExplication}</span></span><span class="decl-value">{f.cpAConfirmer ? 'à confirmer' : `${euros(f.cpIndemnite)}${partAConfirmer(f.cpPartAConfirmer)}`}</span></div>
          </div>
          <div class="spread"><b>{aConfirmer ? 'Total net estimé, hors salaire du dernier mois et sommes à confirmer' : 'Total net estimé, hors salaire du dernier mois'}</b><span class="decl-value">{euros(total)}</span></div>
          {ifcNet > 0 && <p class="hint">{MESSAGE_CDD_IFC} Elle est calculée sur {euros(f.assietteNetteCdd ?? 0)} de salaires nets : l’Urssaf la fait déclarer et payer en net. Le brut est une estimation.</p>}
        </section>
        {!!f.declaration?.length && (
          <section class="card stack-sm" aria-labelledby="fincdd-decl">
            <h2 id="fincdd-decl">À déclarer à Pajemploi avec le dernier salaire</h2>
            <div class="decl">
              {f.declaration.map((d) => <div class="decl-line"><span class="decl-label"><span>{d.libelle}</span><span class="decl-hint">{d.hint}</span></span><span class="decl-value">{euros(d.net)}</span></div>)}
            </div>
          </section>
        )}
      </>}
      <section class="card stack" aria-labelledby="fincdd-save">
        <h2 id="fincdd-save">Enregistrer cette fin de CDD</h2>
        {c.end && !enregistre && <Banner tone="warn">La date de fin enregistrée ({shortDate(c.end)}) ou ta réponse enregistrée ne correspondent pas à ce calcul.</Banner>}
        <p class="hint">Enregistre le dernier jour ({shortDate(jour)}) et la façon dont le CDD finit : le calcul de chaque mois et de la fin s’en sert.</p>
        {/* D8 : la suite en CDI ne termine pas le contrat : pas d'enregistrement de fin. */}
        {finCdd === 'suite_cdi'
          ? <p class="hint">Ton CDD continue en CDI : ne l’enregistre pas comme une fin. Ouvre le contrat et passe-le en CDI.</p>
          : enregistre ? <p>Enregistrée.</p> : <button class="btn btn-primary btn-block" onClick={enregistrer} disabled={!finCdd}>Enregistrer la fin du CDD</button>}
      </section>
    </>
  );
}
