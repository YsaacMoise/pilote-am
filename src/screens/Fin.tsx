import { MESSAGE_TAUX_BRUT, termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, putContract, toast, useStore } from '../store';
import { MESSAGE_CONGES_DEPART, soldesDepartAConfirmer } from '../engine/conges';
import { CongesDepart } from './CongesDepart';
import { addDays, addMonths, monthLabel, monthOf, shortDate, today, type Month } from '../engine/dates';
import { FIN_CDD_LABEL, finDeContrat, finDeCdd, MESSAGE_CDD_IFC, MESSAGE_CDD_PAS_DE_PREAVIS, QUESTION_SINISTRE, type DemandeurInexecution, type FinCdd, type FinCddNonGere, type Motif } from '../engine/fin';
import { cumulCpADemander, finEssaiMaxCdi, QUESTION_ESSAI_AUTRE_ENFANT } from '../engine/preavis';
import { QUESTION_CUMUL_CP } from '../engine/suspensions';
import { avecPreavisMotif, FINS_CDD, FINS_CDD_NON_GEREES, type Contract, type Rupture } from '../engine/model';
import { euros, hoursLabel } from '../engine/money';
import { ligneIndemnitePreavis, ligneRegularisation } from './fin-lignes';
import { Banner, Choices, DateInput, EuroInput, Gommette, Topbar } from '../ui/kit';
import { BoutonPaie, Montant, TexteMontants } from '../ui/paie';

/**
 * T-079 : choix de « Pourquoi le contrat s'arrête-t-il ? », du plus courant au plus rare, chacun dit qui agit.
 * MOTIF_LABEL (engine/fin.ts) reste le libellé court des messages ; les valeurs v sont inchangées.
 */
const CHOIX_MOTIF: { v: Motif; l: string; sub?: string }[] = [
  { v: 'retrait', l: 'Les parents retirent l’enfant', sub: 'Entrée à l’école, déménagement, autre mode de garde…' },
  { v: 'demission', l: 'Je démissionne' },
  { v: 'retraite', l: 'Je pars à la retraite', sub: 'Tu as l’âge légal de départ. Tu préviens les parents par écrit, avec un préavis.' },
  { v: 'essai', l: 'Rupture pendant la période d’essai', sub: 'À ton initiative ou à celle des parents.' },
  { v: 'faute_grave', l: 'Les parents retirent l’enfant pour faute grave', sub: 'Leur lettre te reproche une faute grave.' },
  { v: 'faute_lourde', l: 'Les parents retirent l’enfant pour faute lourde', sub: 'Leur lettre te reproche une faute lourde (intention de leur nuire).' },
  { v: 'inaptitude', l: 'Je suis inapte, pour une raison sans lien avec le travail' },
  { v: 'inaptitude_pro', l: 'Je suis inapte après un accident du travail ou une maladie professionnelle' },
  { v: 'agrement', l: 'Mon agrément est suspendu, modifié ou retiré', sub: 'Décision du conseil départemental : les parents doivent retirer l’enfant.' },
  { v: 'deces', l: 'Décès de l’enfant' },
  { v: 'deces_am', l: 'Décès de l’assistante maternelle', sub: 'Calcul pour ses ayants droit ou pour les parents.' },
  { v: 'deces_employeur', l: 'Décès du parent employeur' },
];

/** T-122 (n3) : simulation ; les documents officiels de fin ne sont pas produits par l'app. */
export const AVERTISSEMENT_FIN = 'Simulation. Les documents officiels de fin sont établis par le parent employeur.';

const ouiNon = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'oui' : 'non');

/** « de mars », « d’août », « d’octobre » */
const deMois = (l: string) => (/^[aeiouyéè]/i.test(l) ? `d’${l}` : `de ${l}`);

export function Fin({ id }: { id?: string }) {
  const s = useStore();
  const [cid, setCid] = useState(id ?? s.contracts[0]?.id);
  // T-045b : les réponses enregistrées avec le contrat sont reprises à l'ouverture de l'écran.
  const r0 = s.contracts.find((x) => x.id === (id ?? s.contracts[0]?.id))?.rupture;
  // T-122 (décision 1 du DG) : aucun motif, aucune date ni aucune réponse proposés d'avance ; écran en trois temps.
  const [etape, setEtape] = useState<1 | 2 | 3>(r0 ? 3 : 1);
  const [errFin, setErrFin] = useState<string[]>([]);
  const [notifS, setNotif] = useState(r0?.notif ?? '');
  const [motifS, setMotif0] = useState<Motif | undefined>(r0?.motif);
  const setMotif = (v: Motif) => { setMotif0(v); setErrFin([]); };
  const [remiseS, setRemise] = useState<'recommande' | 'main_propre' | undefined>(r0 ? 'recommande' : undefined);
  // Première présentation : suit la date d'envoi tant qu'elle n'est pas saisie (relecture contradictoire, point 1).
  const [presentation, setPresentation] = useState<string | null>(r0?.presentation ?? null);
  // T-045 : préavis fait en entier ou non (CCN art. 64 et 64.2) et dernier jour travaillé.
  const [preavisS, setPreavisFait] = useState<'oui' | DemandeurInexecution | undefined>(r0 ? (r0.preavis !== 'execute' ? r0.preavis : 'oui') : undefined);
  // Calcul inchangé : les réponses données (les valeurs de repli ne servent qu'avant la réponse, rien n'est montré avant le 3e temps).
  const notif = notifS || today();
  const motif: Motif = motifS ?? 'retrait';
  const remise = remiseS ?? 'recommande';
  const preavisFait = preavisS ?? 'oui';
  const [dernierTravaille, setDernierTravaille] = useState<string | null>(r0?.dernierJourTravaille ?? null);
  // T-107 : réponses demandées seulement dans leur cas (accord écrit de cumul des congés et du préavis).
  const [cumulCp, setCumulCp] = useState<boolean | undefined>(r0?.cumulCpPreavis);
  // T-109 (correction 7) : essai de 30 jours pour un autre enfant de la même famille (CCN 95.1).
  const [essaiAutre, setEssaiAutre] = useState<boolean | undefined>(r0?.essaiAutreEnfant);
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
  if (c.cdd) return <><Topbar title="Fin de contrat" back="#/plus" screen="fin" /><main>{choixEnfant}<p class="muted">{AVERTISSEMENT_FIN}</p><FinCddEcran key={c.id} c={c} /></main></>;
  const envoi = notif < c.start ? c.start : notif;
  // C-017 : le préavis part de la première présentation de la lettre recommandée ou de la remise en main propre
  // contre décharge (art. 120), jamais de l'annonce orale.
  const avecLettre = motif !== 'deces' && motif !== 'deces_am';
  // Seuls le retrait et la démission ont un préavis : pour les autres motifs, seule la date d'envoi compte.
  const avecPreavis = avecPreavisMotif(motif);
  const presVue = presentation && presentation > envoi ? presentation : envoi;
  const pres = avecPreavis && remise === 'recommande' ? presVue : envoi;
  const inexecution = avecPreavis && preavisFait !== 'oui' ? { demandeur: preavisFait, dernierJourTravaille: dernierTravaille ?? envoi } : undefined;
  // T-045b : la simulation ne tient pas compte de la date de fin déjà enregistrée ; un écart est signalé et l'enregistrement
  // la remplace. Le calcul des mois, lui, refuse toute date de fin qui ne concorde pas avec le préavis (controleFinContrat).
  const parMois: Partial<Record<Month, number>> = {};
  for (const b of s.bulletins) if (b.cid === c.id && b.brut) parMois[b.month] = b.brut;
  // T-107 (cas 1) : la question n'est posée que si des congés payés tombent dans un préavis fait en entier.
  const demanderCumul = avecPreavis && !inexecution && cumulCpADemander(c.start, { motif, notif: envoi, presentation: pres }, s.leaves);
  // T-109 (correction 7) : un autre contrat de la même famille était en cours au premier jour de celui-ci.
  const autreEnfantEnCours = !!c.family && s.contracts.some((k) => k.id !== c.id && k.family === c.family && k.start < c.start && (!k.end || k.end >= c.start));
  const demanderEssaiAutre = motif === 'essai' && autreEnfantEnCours && envoi > finEssaiMaxCdi(c, true).fin && envoi <= finEssaiMaxCdi(c).fin;
  const reponses = { cumulCpPreavis: demanderCumul ? cumulCp : undefined, essaiAutreEnfant: demanderEssaiAutre ? essaiAutre : undefined };
  const f = finDeContrat(ctxFor({ ...c, end: undefined }), envoi, motif, s.settings.enfantsACharge, pres, inexecution, { parMois, total: brutTotal, jusqua: brutJusqua }, reponses, autreEnfantEnCours);
  // T-050d (C-4) : le dernier mois est dans les bulletins (total saisi ou brut lu) : l'ICCP et la régularisation y sont déjà.
  const finDansBulletins = ((brutTotal ?? 0) > 0 && brutJusqua >= monthOf(f.dernierJour)) || (parMois[monthOf(f.dernierJour)] ?? 0) > 0;
  const rupture: Rupture = {
    motif, notif: envoi, ...(pres !== envoi ? { presentation: pres } : {}),
    preavis: inexecution ? inexecution.demandeur : 'execute', ...(inexecution ? { dernierJourTravaille: inexecution.dernierJourTravaille } : {}),
    ...(reponses.cumulCpPreavis !== undefined ? { cumulCpPreavis: reponses.cumulCpPreavis } : {}),
    ...(reponses.essaiAutreEnfant !== undefined ? { essaiAutreEnfant: reponses.essaiAutreEnfant } : {}),
  };
  const enregistre = c.end === f.dernierJour && JSON.stringify(c.rupture) === JSON.stringify(rupture);
  const enregistrer = async () => {
    const prev = await putContract({ ...c, end: f.dernierJour, rupture });
    toast(`Fin de contrat enregistrée : ${f.dispense ? "fin du contrat" : "dernier jour"} le ${shortDate(f.dernierJour)}`, prev ? async () => { await putContract(prev); } : undefined);
  };
  const ligneRegul = ligneRegularisation(f, termsAt(c, f.dernierJour).yearType === 'incomplete');
  const ligneDispense = f.dispense ? ligneIndemnitePreavis(f.dispense) : undefined;
  // T-103 (D1) : l'indemnité de rupture se calcule sur les salaires bruts. Un mois dont le brut n'est pas connu (ni bulletin,
  // ni taux horaire brut au contrat) : l'indemnité n'est pas donnée, l'écran demande la donnée (jamais « environ »).
  const surBrut = motif === 'retrait' || motif === 'deces' || motif === 'inaptitude' || motif === 'inaptitude_pro';
  const estime = surBrut && f.brutsEstimes.length > 0 && f.indemniteRupture > 0;
  const ruptureNonCalculee = !!f.ruptureAConfirmer || estime;
  const total = (ruptureNonCalculee ? 0 : f.indemniteRupture) + f.regularisation + f.cpIndemnite + f.indemnitePreavis;
  const nonCalcule = !!f.cpAConfirmer || ruptureNonCalculee || !!f.regularisationNonCalculee;
  const periode = f.brutsEstimes.length === 1 ? monthLabel(f.brutsEstimes[0]) : `${f.brutsEstimes.length} mois, ${deMois(monthLabel(f.brutsEstimes[0] ?? '2026-01'))} à ${monthLabel(f.brutsEstimes[f.brutsEstimes.length - 1] ?? '2026-01')}`;
  return (
    <>
      <Topbar title={`Fin du contrat · ${c.child}`} back={`#/enfant/${c.id}`} screen="fin" />
      <main>
        {etape === 1 && choixEnfant}
        <p class="eyebrow">{etape} sur 3 · {['Pourquoi', 'La lettre et ses dates', 'Ce qui t’est dû'][etape - 1]}</p>
        {/* T-122 (décision de la direction, n3) : protection juridique, une ligne. */}
        <p class="muted">{AVERTISSEMENT_FIN}</p>
        {etape === 1 && <section class="card">
          <fieldset>
            <legend>Pourquoi</legend>
            <Choices label="Pourquoi le contrat s’arrête-t-il ?" value={motifS} onChange={setMotif} options={CHOIX_MOTIF} />
          </fieldset>
        </section>}
        {etape === 2 && <section class="card">
          <fieldset>
            <legend>La lettre et ses dates</legend>
            {avecPreavis ? (
              <>
                <Choices label="Comment la lettre est-elle remise ?" value={remiseS} onChange={(v) => { setRemise(v); setPresentation(null); setErrFin([]); }} options={[
                  { v: 'recommande', l: 'En recommandé avec accusé de réception' },
                  { v: 'main_propre', l: 'En main propre, contre décharge', sub: 'La personne qui la reçoit signe et date un double.' },
                ]} />
                {remiseS === undefined ? null : remiseS === 'recommande' ? (
                  <>
                    <DateInput label="Date d’envoi de la lettre" hint="Le jour où elle est postée." value={notifS} min={c.start} onChange={changeEnvoi} />
                    <DateInput label="Date de première présentation de la lettre" hint="Le premier passage du facteur (accusé de réception ou avis de passage)." value={presVue} min={envoi} onChange={(v) => setPresentation(v || null)} />
                  </>
                ) : (
                  <DateInput label="Date de remise en main propre" hint="La date écrite sur la décharge." value={notifS} min={c.start} onChange={changeEnvoi} />
                )}
                <Choices label="Le préavis est-il effectué en entier ?" value={preavisS} onChange={(v) => { setPreavisFait(v); setErrFin([]); }} options={[
                  { v: 'oui', l: 'Oui, effectué ou en cours' },
                  { v: 'am_acceptee', l: 'Non : je pars plus tôt, avec l’accord des parents', sub: 'Le contrat finit à ton dernier jour travaillé.' },
                  { v: 'employeur', l: 'Non : les parents me dispensent de le faire', sub: 'Ils te paient jusqu’à la date prévue de fin du préavis.' },
                  { v: 'am_sans_accord', l: 'Non : je pars plus tôt, sans l’accord des parents', sub: 'Le contrat finit à ton dernier jour travaillé.' },
                ]} />
                {demanderCumul && (
                  <Choices label={QUESTION_CUMUL_CP} value={ouiNon(cumulCp)} onChange={(v) => setCumulCp(v === 'oui')} options={[
                    { v: 'oui', l: 'Oui, nous avons signé un accord écrit', sub: 'Les congés et le préavis courent en même temps.' },
                    { v: 'non', l: 'Non', sub: 'Les congés suspendent le préavis : il finit plus tard (convention, article 64.1).' },
                  ]} />
                )}
                {preavisS !== undefined && preavisS !== 'oui' && (
                  <DateInput label="Dernier jour travaillé" hint={preavisFait === 'employeur' ? 'Le dernier jour où tu as accueilli l’enfant. S’ils ne l’ont plus confié dès le jour de la lettre, mets le dernier jour où tu l’as accueilli avant la lettre.' : 'Le dernier jour où tu as accueilli l’enfant.'} value={dernierTravaille ?? envoi} min={preavisFait === 'employeur' ? addDays(envoi, -7) : envoi} onChange={(v) => setDernierTravaille(v || null)} />
                )}
              </>
            ) : motif === 'agrement' ? (
              <DateInput label="Date de la décision du conseil départemental" hint="La date de notification de la décision." value={notifS} min={c.start} onChange={changeEnvoi} />
            ) : avecLettre ? (
              <>
                <DateInput label="Date de la lettre (envoi ou remise)" value={notifS} min={c.start} onChange={changeEnvoi} />
                {demanderEssaiAutre && (
                  <Choices label={QUESTION_ESSAI_AUTRE_ENFANT} value={ouiNon(essaiAutre)} onChange={(v) => setEssaiAutre(v === 'oui')} options={[
                    { v: 'oui', l: 'Oui', sub: 'L’essai de ce contrat dure au plus 30 jours (convention, article 95.1).' },
                    { v: 'non', l: 'Non', sub: 'L’essai dure au plus 2 ou 3 mois, selon tes jours de travail.' },
                  ]} />
                )}
              </>
            ) : (
              <DateInput label="Date du décès" value={notifS} min={c.start} onChange={setNotif} />
            )}
          </fieldset>
        </section>}
        {etape < 3 && errFin.length > 0 && <p class="err" role="alert">Pour continuer : {errFin.join(' ; ')}.</p>}
        {etape < 3 && <button class="btn btn-primary btn-block btn-lg" onClick={() => {
          const e: string[] = [];
          if (etape === 1 && !motifS) e.push('choisis pourquoi le contrat s’arrête');
          if (etape === 2) {
            if (avecPreavis && !remiseS) e.push('indique comment la lettre est remise');
            if (!notifS) e.push('indique la date');
            if (avecPreavis && !preavisS) e.push('indique si le préavis est effectué en entier');
          }
          setErrFin(e);
          if (!e.length) { setEtape(etape === 1 ? 2 : 3); window.scrollTo(0, 0); }
        }}>Continuer</button>}
        {etape > 1 && <button class="btn btn-ghost btn-block" onClick={() => { setErrFin([]); setEtape(etape === 3 ? 2 : 1); }}>{etape === 3 ? 'La lettre et ses dates' : 'Pourquoi'}</button>}
        {etape === 3 && <>
        {/* T-119 : congés de départ calculés par l'app, en attente de la réponse de l'AM (un geste) : la fin en dépend. */}
        {soldesDepartAConfirmer(ctxFor(c).c) && <section class="card stack" aria-labelledby="fin-depart"><h2 id="fin-depart">Tes congés au début du suivi</h2><CongesDepart c={c} /></section>}
        {f.nonGere && f.nonGere.every((t) => t === MESSAGE_CONGES_DEPART) ? (
          // Relecture T-119 (N1) : seule la confirmation des congés de départ manque : un geste (carte ci-dessus), pas un refus.
          <p class="hint" aria-live="polite">Confirme tes congés au début du suivi, juste au-dessus : la fin de contrat se calcule aussitôt.</p>
        ) : f.nonGere ? (
          <section class="card stack" aria-labelledby="fin-ng" aria-live="polite">
            <h2 id="fin-ng">Fin de contrat non calculée</h2>
            {f.nonGere.filter((t) => t !== MESSAGE_CONGES_DEPART).map((t) => <Banner tone="warn">{t}</Banner>)}
            <p class="hint">L’app ne donne aucun montant : préavis, indemnités et congés non pris en dépendent. Fais le calcul avec les parents, sans l’app.</p>
          </section>
        ) : <>
        {surBrut && (f.brutsEstimes.length > 0 || brutTotal != null) && (
          <section class="card stack-sm" aria-labelledby="fin-brut">
            <h2 id="fin-brut">Salaires bruts de tes bulletins</h2>
            <p>L’indemnité de rupture se calcule sur les salaires bruts (convention, article 121.1). {f.brutsEstimes.length > 0 ? <>Le brut n’est pas connu pour {periode}. Indique ton salaire horaire brut dans le contrat (<a href={`#/contrat/${c.id}`}>ouvrir le contrat</a>), ou le total brut de tes bulletins ci-dessous.</> : 'Le total saisi est utilisé.'}</p>
            <EuroInput label="Total des salaires bruts de tes bulletins" hint="Additionne la ligne « salaire brut » de chaque bulletin Pajemploi de ce contrat, du premier jusqu’au mois indiqué ci-dessous, congés payés compris." cents={brutTotal} allowEmpty onChange={setBrutTotal} />
            <label class="label" for="fin-jusqua">Dernier bulletin compris dans ce total</label>
            <input id="fin-jusqua" class="input" type="month" value={brutJusqua} min={c.start.slice(0, 7)} max={monthOf(f.dernierJour)} onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) setBrutJusqua(v as Month); }} />
            {brutTotal != null && f.brutsEstimes.length > 0 && <p class="hint">Les mois suivants ({periode}) n’ont pas encore de bulletin : indique ton salaire horaire brut dans le contrat pour les calculer.</p>}
          </section>
        )}
        {f.alertes.map((a) => <Banner tone="warn"><TexteMontants t={a} /> <a href={`#/historique/${c.id}`}>Ouvrir l’historique</a></Banner>)}
        {f.cpAConfirmer && <Banner tone="warn">{f.cpAConfirmer}</Banner>}
        {estime && <Banner tone="warn">Indemnité de rupture non calculée : le brut de {periode} n’est pas connu. {MESSAGE_TAUX_BRUT} Tu peux aussi saisir le total brut de tes bulletins plus haut.</Banner>}
        <section class="card stack" aria-labelledby="fin-res" aria-live="polite">
          <h2 id="fin-res">Ce qui t’est dû</h2>
          <BoutonPaie ecran="fin" />
          <dl class="kv">
            <dt>{avecLettre ? 'Ancienneté à l’envoi de la lettre' : 'Ancienneté'}</dt><dd>{f.ancienneteMois} mois</dd>
            <dt>Préavis</dt><dd>{f.preavisLabel}</dd>
            <dt>{f.dispense ? 'Fin du contrat (date prévue de fin du préavis)' : motif === 'deces' || motif === 'deces_am' || inexecution ? 'Dernier jour' : 'Dernier jour (préavis inclus)'}</dt><dd>{shortDate(f.dernierJour)}</dd>
          </dl>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Indemnité de rupture</span><span class="decl-hint"><TexteMontants t={f.ruptureExplication} /></span></span><span class="decl-value">{ruptureNonCalculee ? 'non calculée' : <Montant v={euros(f.indemniteRupture)} />}</span></div>
            {motif === 'deces' && <div class="decl-line"><span class="decl-label"><span>Indemnité égale au préavis</span><span class="decl-hint"><TexteMontants t={f.indemnitePreavisExplication} /></span></span><span class="decl-value"><Montant v={euros(f.indemnitePreavis)} /></span></div>}
            {f.indemniteDueParents && f.indemniteDueParents.net > 0 && <div class="decl-line"><span class="decl-label"><span>Ce que les parents peuvent te demander</span><span class="decl-hint">Salaire net du préavis non fait, du {shortDate(f.indemniteDueParents.du)} au {shortDate(f.indemniteDueParents.au)} (convention, article 64.2), en passant par le conseil de prud’hommes.{motif !== 'retrait' ? ' Si tu es enceinte, rien n’est dû (Code du travail, L1225-34).' : ''} Pas compté dans le total.</span></span><span class="decl-value"><Montant v={euros(f.indemniteDueParents.net)} /></span></div>}
            {ligneDispense && <div class="decl-line"><span class="decl-label"><span>Indemnité de préavis</span><span class="decl-hint"><TexteMontants t={ligneDispense.hint} /></span></span><span class="decl-value"><TexteMontants t={ligneDispense.valeur} /></span></div>}
            <div class="decl-line"><span class="decl-label"><span>Régularisation</span><span class="decl-hint"><TexteMontants t={ligneRegul.hint} /></span></span><span class="decl-value"><TexteMontants t={ligneRegul.valeur} /></span></div>
            <div class="decl-line"><span class="decl-label"><span>Congés non pris</span><span class="decl-hint"><TexteMontants t={f.cpExplication} /></span></span><span class="decl-value">{f.cpAConfirmer ? 'non calculée' : <Montant v={euros(f.cpIndemnite)} />}</span></div>
          </div>
          <div class="spread"><b>{nonCalcule ? 'Total, hors salaire du dernier mois et sommes non calculées' : 'Total, hors salaire du dernier mois'}</b><span class="decl-value"><Montant v={euros(total)} /></span></div>
          {surBrut && !ruptureNonCalculee && <p class="hint">L’indemnité de rupture est calculée sur <Montant v={euros(f.totalBrut)} /> de salaires bruts, régularisation et indemnités de la fin comprises{finDansBulletins ? ' (elles sont dans tes bulletins)' : ''}. Elle n’est pas soumise aux cotisations.</p>}
        </section>
        </>}
        <section class="card stack" aria-labelledby="fin-save">
          <h2 id="fin-save">Enregistrer cette fin de contrat</h2>
          {c.end && !enregistre && <Banner tone="warn">La date de fin enregistrée ({shortDate(c.end)}) ou les réponses enregistrées ne correspondent pas à ce calcul. Tant qu’elles ne concordent pas avec le préavis, l’app ne calcule pas les derniers mois.</Banner>}
          <p class="hint">Sans elle, les derniers mois ne sont pas calculés.</p>
          {enregistre ? <p>Enregistrée.</p> : <button class="btn btn-primary btn-block" onClick={enregistrer}>Enregistrer la fin du contrat</button>}
        </section>
        {/* T-122 (décision 3 du DG) : les bulletins d'avant Arvela, facultatifs, rendent ce calcul plus juste. */}
        {c.trackedFrom > c.start && surBrut && (
          <section class="card stack-sm" aria-labelledby="fin-bul">
            <h2 id="fin-bul">Bulletins d’avant Arvela (facultatifs)</h2>
            <p class="hint">Le salaire brut de chaque bulletin entre dans le total des salaires sur lequel se calcule l’indemnité de rupture ; un mois d’avant le {shortDate(c.trackedFrom)} sans bulletin n’y est pas compté.{f.manquants.length ? ` ${f.manquants.length} mois sans bulletin.` : ''}</p>
            <a class="btn btn-outline" href={`#/historique/${c.id}`}>Ajouter des bulletins</a>
          </section>
        )}
        </>}
      </main>
    </>
  );
}

/** Ligne « à confirmer » d'une somme de la fin d'un CDD : part sûre, écart hors du total */

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
  // T-107 (cas 4) : force majeure : sinistre ? et, sans terme précis, date prévue du retour de la personne remplacée.
  const [sinistre, setSinistre] = useState<boolean | undefined>(r0?.sinistre);
  const [termeSinistre, setTermeSinistre] = useState<string | undefined>(r0?.termeSinistre);
  const jour = dernier < c.start ? c.start : dernier;
  const demanderTerme = finCdd === 'force_majeure' && sinistre === true && !!c.cddTermeImprecis;
  const reponses = { sinistre: finCdd === 'force_majeure' ? sinistre : undefined, termeSinistre: demanderTerme ? termeSinistre : undefined };
  const f = finDeCdd(ctxFor({ ...c, end: undefined }), jour, finCdd, s.settings.enfantsACharge, undefined, reponses);
  // D17 : une fin non gérée n'est jamais enregistrée (le message s'affiche, rien n'est gardé).
  const finGeree = finCdd && (FINS_CDD as string[]).includes(finCdd) ? finCdd as FinCdd : undefined;
  const rupture: Rupture = {
    motif: 'fin_cdd', notif: jour, preavis: 'execute', ...(finGeree ? { finCdd: finGeree } : {}),
    ...(reponses.sinistre !== undefined ? { sinistre: reponses.sinistre } : {}), ...(reponses.termeSinistre ? { termeSinistre: reponses.termeSinistre } : {}),
  };
  const enregistre = c.end === jour && JSON.stringify(c.rupture) === JSON.stringify(rupture);
  const enregistrer = async () => {
    const prev = await putContract({ ...c, end: jour, rupture });
    toast(`Fin du CDD enregistrée : dernier jour le ${shortDate(jour)}`, prev ? async () => { await putContract(prev); } : undefined);
  };
  const ifcNet = f.ifcAConfirmer ? 0 : f.ifcNet ?? 0;
  const total = ifcNet + (f.regularisationAConfirmer ? 0 : f.regularisation) + (f.cpAConfirmer ? 0 : f.cpIndemnite) + (f.indemniteSinistre?.net ?? 0);
  const nonCalcule = !!(f.ifcAConfirmer || f.cpAConfirmer || f.regularisationAConfirmer);
  const choix = [...FINS_CDD, ...FINS_CDD_NON_GEREES];
  return (
    <>
      <section class="card">
        <fieldset>
          <legend>La fin du CDD</legend>
          <p class="hint">{MESSAGE_CDD_PAS_DE_PREAVIS}</p>
          <DateInput label="Dernier jour du contrat" hint={c.cddTerme ? `${c.cddTermeImprecis ? 'Fin de la durée minimale' : 'Date de fin prévue'} : ${shortDate(c.cddTerme)}. Si la date a été reportée, mets d’abord la nouvelle date de fin prévue dans le contrat.` : 'Le dernier jour du contrat.'} value={jour} min={c.start} onChange={(v) => setDernier(v || jour)} />
          <Choices label="Comment finit le CDD ?" value={finCdd} onChange={setFinCdd} options={choix.map((k) => ({ v: k, l: FIN_CDD_LABEL[k].l, sub: FIN_CDD_LABEL[k].sub }))} />
          {finCdd === 'force_majeure' && (
            <Choices label={QUESTION_SINISTRE} value={ouiNon(sinistre)} onChange={(v) => setSinistre(v === 'oui')} options={[
              { v: 'oui', l: 'Oui, un sinistre', sub: 'Le parent te verse les salaires jusqu’à la date de fin prévue (code du travail, article L1243-4).' },
              { v: 'non', l: 'Non, un autre cas de force majeure' },
            ]} />
          )}
          {demanderTerme && <DateInput label="Date à laquelle la personne remplacée devait revenir" hint="Ton CDD de remplacement aurait fini ce jour-là." value={termeSinistre ?? ''} min={jour} onChange={(v) => setTermeSinistre(v || undefined)} />}
        </fieldset>
      </section>
      {soldesDepartAConfirmer(ctxFor(c).c) && <section class="card stack" aria-labelledby="cdd-depart"><h2 id="cdd-depart">Tes congés au début du suivi</h2><CongesDepart c={c} /></section>}
      {f.nonGere && f.nonGere.every((t) => t === MESSAGE_CONGES_DEPART) ? (
        <p class="hint" aria-live="polite">Confirme tes congés au début du suivi, juste au-dessus : la fin du CDD se calcule aussitôt.</p>
      ) : f.nonGere ? (
        <section class="card stack" aria-labelledby="fincdd-ng" aria-live="polite">
          <h2 id="fincdd-ng">Fin du CDD non calculée</h2>
          {f.nonGere.filter((t) => t !== MESSAGE_CONGES_DEPART).map((t) => <Banner tone="warn">{t}</Banner>)}
          <p class="hint">L’app ne donne aucun montant.</p>
        </section>
      ) : <>
        {f.alertes.map((a) => <Banner tone="warn"><TexteMontants t={a} /></Banner>)}
        {[f.ifcAConfirmer, f.regularisationAConfirmer, f.cpAConfirmer].filter(Boolean).map((t) => <Banner tone="warn">{t}</Banner>)}
        <section class="card stack" aria-labelledby="fincdd-res" aria-live="polite">
          <h2 id="fincdd-res">Ce qui t’est dû</h2>
          <BoutonPaie ecran="fin" />
          <dl class="kv">
            <dt>Préavis</dt><dd>Aucun</dd>
            <dt>Dernier jour</dt><dd>{shortDate(f.dernierJour)}</dd>
          </dl>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Indemnité de fin de contrat</span><span class="decl-hint"><TexteMontants t={f.ifcExplication} /></span></span><span class="decl-value">{f.ifcAConfirmer ? 'non calculée' : <><Montant v={euros(ifcNet)} /> net</>}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Régularisation</span><span class="decl-hint">{f.regularisationAConfirmer ? 'Non calculée : voir l’encadré plus haut' : f.finCdd === 'suite_cdi' ? 'Ton contrat continue en CDI : rien n’est dû maintenant' : termsAt(c, f.dernierJour).yearType === 'incomplete' ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé') : 'Accueil toute l’année : pas de régularisation'}</span></span><span class="decl-value">{f.regularisationAConfirmer ? 'non calculée' : <Montant v={euros(f.regularisation)} />}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Congés non pris</span><span class="decl-hint"><TexteMontants t={f.cpExplication} /></span></span><span class="decl-value">{f.cpAConfirmer ? 'non calculée' : <Montant v={euros(f.cpIndemnite)} />}</span></div>
            {f.indemniteSinistre && <div class="decl-line"><span class="decl-label"><span>Indemnité du sinistre</span><span class="decl-hint">Salaires que tu aurais touchés du {shortDate(f.indemniteSinistre.du)} au {shortDate(f.indemniteSinistre.au)} (code du travail, article L1243-4).</span></span><span class="decl-value"><Montant v={euros(f.indemniteSinistre.net)} /></span></div>}
          </div>
          <div class="spread"><b>{nonCalcule ? 'Total net, hors salaire du dernier mois et sommes non calculées' : 'Total net, hors salaire du dernier mois'}</b><span class="decl-value"><Montant v={euros(total)} /></span></div>
          {ifcNet > 0 && <p class="hint">{MESSAGE_CDD_IFC} Elle est calculée sur <Montant v={euros(f.assietteNetteCdd ?? 0)} /> de salaires nets : l’Urssaf la fait déclarer et payer en net.</p>}
        </section>
        {!!f.declaration?.length && (
          <section class="card stack-sm" aria-labelledby="fincdd-decl">
            <h2 id="fincdd-decl">À déclarer à Pajemploi avec le dernier salaire</h2>
            <p class="hint">L’indemnité de congés non pris et la régularisation se déclarent aussi avec le dernier salaire.</p>
            <div class="decl">
              {f.declaration.map((d) => <div class="decl-line"><span class="decl-label"><span>{d.libelle}</span><span class="decl-hint"><TexteMontants t={d.hint} /></span></span><span class="decl-value"><Montant v={euros(d.net)} /></span></div>)}
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
          : finCdd && !finGeree ? <p class="hint">L’app ne calcule pas ce cas : elle n’enregistre pas cette fin, et ne garde pas ta réponse.</p>
          : enregistre ? <p>Enregistrée.</p> : <button class="btn btn-primary btn-block" onClick={enregistrer} disabled={!finGeree}>Enregistrer la fin du CDD</button>}
      </section>
    </>
  );
}
