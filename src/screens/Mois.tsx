import { AVERTISSEMENT_CALCUL, PAJEMPLOI_PLUS_DATE, PAJEMPLOI_PLUS_RAPPEL } from '../legal';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ctxFor, logUsage, toast, useStore, state } from '../store';
import { addMonths, dayLabel, eachDay, firstDay, lastDay, monthLabel, monthOf, today, type Month } from '../engine/dates';
import { computeMonth, declarationLines, declarationText, MESSAGE_REDUCTION_HS_BRUT, moisEnCoursAu, totalAVerser } from '../engine/month';
import { dayInfo, PREFIXE_ENTRETIEN_SOUS_MIN, termsAt } from '../engine/payroll';
import { MESSAGE_CONGES_DEPART, MESSAGE_SOLDE_CONGES } from '../engine/conges';
import { CongesDepart } from './CongesDepart';
import { estInformation } from '../engine/alertes';
import { euros, hoursLabel } from '../engine/money';
import { baremesAttendus, messageBaremesAttendus } from '../engine/rates';
import { CHILD_ABS_LABEL, AM_ABS_LABEL, type Contract } from '../engine/model';
import { Banner, Gommette, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { shareText } from '../share';
import { AideVideo } from '../ui/VideoGuide';
import { DaySheet } from './Today';
import { lignesDetail } from '../engine/detail';
import { dureeTexte, etatDeclaration, lignesResume, montantFinDeMois, resumeTravail, texteMoisEnCours } from '../engine/resume';
import { mouvementReduit, paieToujoursVisible, setPaieToujoursVisible } from '../paie-visible';
import { Switch } from '../ui/kit';
import { releveDonnees } from '../releve/donnees';

declare const __APP_VERSION__: string;

/** Ouvre le partage du téléphone avec le PDF ; sinon le télécharge. 'refuse' : iPhone a refusé le partage (trop long après le geste). */
async function partagerPdf(file: File): Promise<'ok' | 'refuse' | 'annule'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      // Le fichier seul, sans texte : avec un texte, iOS n'enregistre que le texte (bug WebKit 244408).
      await nav.share({ files: [file] });
      return 'ok';
    } catch (e) {
      const n = (e as DOMException)?.name;
      if (n === 'AbortError') return 'annule';
      if (n === 'NotAllowedError') return 'refuse';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'ok';
}

export function Mois({ month: m0, cid: c0 }: { month?: string; cid?: string }) {
  const s = useStore();
  const [month, setMonth] = useState<Month>((m0 as Month) ?? monthOf(today()));
  const list = s.contracts.filter((c) => c.start <= lastDay(month) && (!c.end || c.end >= firstDay(month)));
  const [cid, setCid] = useState<string | undefined>(c0);
  const c = list.find((x) => x.id === cid) ?? list[0];
  const [edit, setEdit] = useState<string | null>(null);
  // T-118 : paie du mois cachée d'emblée ; montrée d'un geste, elle reste visible jusqu'à la sortie de l'écran Mois
  // (changer de mois ou d'enfant ne la recache pas). « Toujours afficher ma paie » : gardé sur ce téléphone.
  const [paieVue, setPaieVue] = useState(paieToujoursVisible());

  return (
    <>
      <Topbar title="Mois" sub="Déclaration Pajemploi" screen="mois" />
      <main>
        <AideVideo id="mois" />
        <div class="month-nav">
          <button class="icon-btn" aria-label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))}><Icon name="left" /></button>
          <h2 aria-live="polite">{monthLabel(month).replace(/^./, (x) => x.toUpperCase())}</h2>
          <button class="icon-btn" aria-label="Mois suivant" disabled={month >= monthOf(today())} onClick={() => setMonth(addMonths(month, 1))}><Icon name="right" /></button>
        </div>
        {list.length > 1 && (
          <div class="chips" role="group" aria-label="Enfant">
            {list.map((k) => (
              <button class="chip" aria-pressed={k.id === c?.id} onClick={() => setCid(k.id)}>
                <Gommette name={k.child} color={k.color} size="sm" />{k.child}
              </button>
            ))}
          </div>
        )}
        {!c ? (
          <div class="card empty"><h2>Pas de contrat ce mois-ci</h2><p class="muted">Change de mois ou ajoute un enfant depuis « Plus ».</p></div>
        ) : (
          <MonthView key={`${c.id}|${month}`} c={c} month={month} onEdit={setEdit} paieVue={paieVue} setPaieVue={setPaieVue} />
        )}
      </main>
      {edit && c && <DaySheet c={c} day={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MonthView({ c, month, onEdit, paieVue, setPaieVue }: { c: Contract; month: Month; onEdit: (d: string) => void; paieVue: boolean; setPaieVue: (v: boolean) => void }) {
  const ctx = ctxFor(c);
  const r = computeMonth(ctx, month, state.settings.enfantsACharge);
  const lines = declarationLines(ctx, r);
  const current = month === monthOf(today());
  const totalVerse = totalAVerser(r);
  // T-118 (ajout du DG du 26/11) : mois en cours, montant provisoire. Le salaire du mois est fixe ; l'entretien et les repas
  // s'ajoutent par jour d'accueil. Montant final attendu si les jours restants se passent comme prévu : le même mois calculé au
  // dernier jour du mois, en ne reprenant que la différence d'entretien et de repas.
  const enCours = current && !!moisEnCoursAu(ctx.today, month);
  const finAttendue = enCours ? montantFinDeMois(totalVerse, r, computeMonth(ctxFor(c, lastDay(month)), month, state.settings.enfantsACharge), !!c.accueilOccasionnel) : undefined;
  const [occupe, setOccupe] = useState(false);
  const [pret, setPret] = useState<File | null>(null);
  const [partage, setPartage] = useState(false);
  const envoyer = async (file: File) => {
    if (partage) return; // un second appui pendant que la feuille de partage est ouverte lancerait un téléchargement
    setPartage(true);
    const res = await partagerPdf(file).finally(() => setPartage(false));
    // iPhone : le partage doit suivre de près un geste ; s'il a été refusé, un second bouton le relance.
    setPret(res === 'refuse' ? file : null);
  };
  const fabriquer = async () => {
    if (occupe) return;
    setOccupe(true);
    try {
      const d = releveDonnees(ctx, month, {
        amName: state.settings.amName, enfants: state.settings.enfantsACharge, now: new Date(),
        version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue',
      });
      const { genererRelevePdf } = await import('../releve/fabrication');
      const pdf = await genererRelevePdf(d);
      logUsage('releve_pdf');
      await envoyer(new File([pdf as Uint8Array<ArrayBuffer>], d.nomFichier, { type: 'application/pdf' }));
    } catch {
      toast('Le relevé n’a pas pu être fabriqué. Réessaie.');
    } finally {
      setOccupe(false);
    }
  };

  if (r.fromHistory) {
    return (
      <div class="card stack">
        <h2>Mois repris de l’historique</h2>
        {r.missing ? <p>Aucun bulletin pour ce mois. Ajoute-le dans l’historique du contrat pour fiabiliser les congés et la fin de contrat.</p> : <p>Salaire net déclaré : <b>{euros(r.net)}</b></p>}
        <a class="btn btn-outline" href={`#/historique/${c.id}`}>Ouvrir l’historique</a>
      </div>
    );
  }

  // T-103 (D4) : barèmes du mois pas encore publiés : aucun calcul « provisoire ».
  if (baremesAttendus(firstDay(month))) {
    return (
      <section class="card stack" aria-labelledby="bar-t">
        <h2 id="bar-t">Ce mois n’est pas encore calculé</h2>
        <Banner tone="info">{messageBaremesAttendus(monthLabel(month))}</Banner>
      </section>
    );
  }

  // T-119 : congés de départ calculés par l'app, la seule question est celle des jours déjà pris : elle se pose ici, en un geste.
  if (r.nonGere.length === 1 && r.nonGere[0] === MESSAGE_CONGES_DEPART) {
    return (
      <section class="card stack" aria-labelledby="depart-t">
        <h2 id="depart-t">Tes congés au début du suivi</h2>
        <CongesDepart c={c} />
      </section>
    );
  }
  // T-116 (A2) : calcul impossible (rien n'est deviné), le solde est demandé : une invite, pas une alerte.
  if (r.nonGere.length === 1 && r.nonGere[0] === MESSAGE_SOLDE_CONGES) {
    return (
      <section class="card stack" aria-labelledby="solde-t">
        <h2 id="solde-t">Indique ton solde de congés</h2>
        <p>Des congés de ce mois dépassent les droits que l’app connaît. Le contrat a commencé avant le suivi par l’app et ton solde de départ n’a pas été donné : l’app ne retient aucun jour sans solde tant qu’elle ne le connaît pas.</p>
        <p class="hint">{MESSAGE_SOLDE_CONGES}</p>
        <a class="btn btn-primary" href={`#/contrat/${c.id}`}>Indiquer mon solde</a>
      </section>
    );
  }

  // T-031 : cas non géré ou donnée à saisir (T-103) : aucun montant, aucune case, pas d'envoi au parent.
  if (r.nonGere.length) {
    return (
      <section class="card stack" aria-labelledby="ng-t">
        <h2 id="ng-t">Ce mois n’est pas calculé</h2>
        {r.nonGere.map((t) => <Banner tone="warn">{t}</Banner>)}
        <p class="hint">L’app ne donne aucun montant pour ce mois tant que ce qui est dit ci-dessus n’est pas réglé. Une donnée à saisir : saisis-la, le mois se calcule aussitôt. Un cas non géré : déclare ce mois avec les parents, sans l’app.</p>
        <a class="btn btn-outline" href={`#/contrat/${c.id}`}>Ouvrir le contrat</a>
      </section>
    );
  }

  const exceptions = eachDay(firstDay(month), lastDay(month))
    .map((d) => dayInfo(ctx, d))
    .filter((di) => di.rec || di.kind === 'am' || di.kind === 'ferie' || di.departOublie);

  return (
    <>
      <TonMois c={c} month={month} vue={paieVue} setVue={setPaieVue} total={totalVerse}
        titre={<span class="summary-label" id="tot">Ta paie de {monthLabel(month).split(' ')[0]} · à verser par la famille{c.family ? ` ${c.family}` : ''}</span>}>
        <span class="summary-sub">dont salaire net {euros(r.netTotal)}{r.brutConnu ? `, soit ${euros(r.brutEstime)} brut` : ''}</span>
        {r.brutConnu && r.reductionHS > 0 && <span class="summary-sub">et réduction de cotisations des heures complémentaires et majorées {euros(r.reductionHS)}</span>}
        {/* T-118 (ajout du DG du 26/11) : informations neutres, sans couleur d'alerte (plus de pastille orange). */}
        {!r.brutConnu && <span class="summary-info"><Icon name="info" size={16} /><span>Brut non affiché : <a href={`#/contrat/${c.id}`}>indique ton taux horaire brut dans le contrat</a>.</span></span>}
        {enCours && <span class="summary-info"><Icon name="info" size={16} /><span>{texteMoisEnCours(month, finAttendue, !!c.accueilOccasionnel)}</span></span>}
      </TonMois>

      {!c.pajemploiPlus && (!c.end || c.end >= PAJEMPLOI_PLUS_DATE) && <Banner tone="info">{PAJEMPLOI_PLUS_RAPPEL}</Banner>}
      {r.alerts.map((a) => a.startsWith(PREFIXE_ENTRETIEN_SOUS_MIN)
        ? <Banner tone="warn"><span>{a}</span><a class="btn btn-outline" href={`#/avenant/${c.id}/nouveau`}>Faire l’avenant</a></Banner>
        : <Banner tone={estInformation(a) ? 'info' : 'warn'}>{a}</Banner>)}
      {r.cpNote && <Banner tone="info" icon="sun">{r.cpNote}</Banner>}

      <section class="card" aria-labelledby="decl-t">
        <h2 id="decl-t" style={{ marginBottom: '4px' }}>À déclarer sur Pajemploi</h2>
        <p class="muted small" style={{ marginBottom: '8px' }}>Une déclaration par enfant, faite par le parent entre le 25 et le 5 du mois suivant, dans cet ordre.</p>
        <p class="hint" style={{ marginBottom: '8px' }}>{AVERTISSEMENT_CALCUL}</p>
        <div class="decl">
          {lines.map((l) => (
            <div class="decl-line">
              <span class="decl-label"><span>{l.label}</span>{l.hint && <span class="decl-hint">{l.hint}</span>}</span>
              <span class="decl-value">{l.value}</span>
            </div>
          ))}
        </div>
      </section>

      <div class="btn-row">
        <button
          class="btn btn-primary btn-lg"
          onClick={async () => {
            const res = await shareText(declarationText(ctx, r, state.settings.amName));
            logUsage('mois_partage', 'mois');
            if (res === 'copied') toast('Texte copié : colle-le dans ton message au parent.');
          }}
        >
          <Icon name="share" />Envoyer au parent
        </button>
        <button class="btn btn-outline btn-lg" type="button" onClick={fabriquer} disabled={occupe} aria-busy={occupe}>
          <Icon name="file" />{occupe ? 'Fabrication du relevé…' : 'Relevé du mois (PDF)'}
        </button>
        <a class="btn btn-outline btn-lg" href={`#/controle/${c.id}/${month}`}><Icon name="receipt" />Contrôler le bulletin</a>
      </div>
      {pret && (
        <Banner tone="info">
          Le relevé est prêt. <button class="btn-link" type="button" disabled={partage} onClick={() => envoyer(pret)}>Partager le relevé</button>
        </Banner>
      )}

      <details class="more">
        <summary>Comment c’est calculé</summary>
        <div class="more-body">
          <dl class="kv">
            {/* T-118 (D-23) : lignes qui font toujours le salaire net (prorata d'entrée, de sortie ou d'avenant compris). */}
            {!c.accueilOccasionnel && (<><dt>{termsAt(c, `${month}-01`).yearType === 'complete' ? 'Heures du planning type ce mois (art. 111)' : 'Jours du planning type ce mois (art. 111)'}</dt>
            <dd>{termsAt(c, `${month}-01`).yearType === 'complete' ? hoursLabel(r.divisorMin) : r.divisorDays}</dd></>)}
            {lignesDetail(c, month, r).map((l) => <><dt>{l.total ? <b>{l.label}</b> : l.label}</dt><dd>{l.montant < 0 ? `−${euros(-l.montant)}` : euros(l.montant)}</dd></>)}
            {r.brutConnu && r.reductionHS > 0 && (<><dt>Réduction de cotisations des heures complémentaires et majorées</dt><dd>{euros(r.reductionHS)}</dd></>)}
            <dt>Entretien ({r.presenceDays} j)</dt><dd>{euros(r.entretien)}</dd>
            {r.repas > 0 && (<><dt>Repas</dt><dd>{euros(r.repas)}</dd></>)}
            {r.km > 0 && (<><dt>Kilomètres</dt><dd>{euros(r.km)}</dd></>)}
          </dl>
          {r.brutConnu && r.reductionHS > 0 && <p class="muted small">Heures complémentaires et majorées : elles ouvrent une réduction de tes cotisations de {euros(r.reductionHS)} (11,31 % de leur brut, code de la sécurité sociale, art. L241-17 et D241-21), comptée dans le total à verser. Ces heures sont aussi exonérées d’impôt, dans la limite de 7 500 € par an.</p>}
          {r.reductionHSManquante && <p class="muted small">{MESSAGE_REDUCTION_HS_BRUT}</p>}
          <p class="muted small">
            {c.accueilOccasionnel ? 'Accueil occasionnel : heures d’accueil du mois × taux horaire ; congés payés : 10 % des salaires de l’accueil, versés à sa fin (art. 109.3 et 102.1.2.3).' : termsAt(c, `${month}-01`).yearType === 'complete'
              ? 'Année complète : retenue = salaire mensualisé × heures non payées ÷ heures prévues dans le mois (art. 111).'
              : 'Année incomplète : retenue = salaire mensualisé × jours non payés ÷ jours prévus dans le mois (art. 111).'}
          </p>
        </div>
      </details>

      <div class="row">
        <span class="label" style={{ flex: 1 }}>Corriger un autre jour</span>
        {/* T-103 (M5) : un champ date vide s'affiche sur iPhone comme un cadre blanc. Bouton visible, champ date transparent par-dessus. */}
        <span class="btn btn-outline pick-day">
          <Icon name="edit" size={18} />Choisir un jour
          <input id="other-day" aria-label="Choisir un jour à corriger" type="date" min={firstDay(month)} max={lastDay(month) < today() ? lastDay(month) : today()}
            onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onEdit(v); (e.target as HTMLInputElement).value = ''; }} />
        </span>
      </div>
      <section class="stack-sm" aria-labelledby="exc-t">
        <h2 id="exc-t" class="section-title">Ce qui a changé ce mois-ci</h2>
        {exceptions.length === 0 ? (
          <p class="muted">Rien : tout s’est passé comme prévu au planning.</p>
        ) : (
          <div class="list">
            {exceptions.map((di) => {
              let sub = '';
              if (di.kind === 'am' && di.amLeave) sub = AM_ABS_LABEL[di.amLeave];
              else if (di.kind === 'ferie') sub = `Férié : ${di.ferie}${di.deducted ? ', non payé' : ''}`;
              else if (di.rec?.abs) sub = CHILD_ABS_LABEL[di.rec.abs] + (di.deducted ? ', retenu' : ', payé');
              else if (di.departOublie) sub = 'Départ non pointé';
              else if (di.extraMin) sub = `+${hoursLabel(di.extraMin)} en plus`;
              else if (di.rec?.pres?.length) sub = 'Horaires pointés';
              else sub = 'Modifié';
              return (
                <button class="li" onClick={() => onEdit(di.date)}>
                  <span class="li-main">
                    <span class="li-title">{dayLabel(di.date)}</span>
                    <span class="li-sub">{sub}</span>
                  </span>
                  <span class="li-end"><Icon name="edit" size={20} /></span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * T-118 : carte « Ton mois ». Face avant : le travail du mois (jours, heures, absences, état de la déclaration) et le bouton
 * « Voir ma paie du mois ». Au toucher, la carte se retourne et le montant monte de 0 à sa valeur en 0,8 s ; il reste
 * visible jusqu'à la sortie de l'écran. Mouvement réduit demandé par le téléphone : ni rotation, ni montant qui monte.
 */
function TonMois({ c, month, vue, setVue, total, titre, children }: { c: Contract; month: Month; vue: boolean; setVue: (v: boolean) => void; total: number; titre: preact.ComponentChildren; children: preact.ComponentChildren }) {
  const ctx = ctxFor(c);
  const res = resumeTravail(ctx, month);
  const lignes = lignesResume(res);
  const absences = res.enfant.reduce((a, e) => a + e.jours, 0) + res.am.reduce((a, x) => a + x.jours, 0);
  const etat = etatDeclaration(month, ctx.today);
  const [toujours, setToujours] = useState(paieToujoursVisible());
  // Montant affiché : il monte de 0 à `total` seulement après le geste « Voir ma paie du mois ».
  const [affiche, setAffiche] = useState(total);
  const [anim, setAnim] = useState(false);
  const totalRef = useRef<HTMLSpanElement>(null);
  const voirRef = useRef<HTMLButtonElement>(null);
  const reduit = mouvementReduit();
  useEffect(() => { if (!anim) setAffiche(total); }, [total, anim]);
  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const t0 = performance.now(), duree = 800;
    const pas = (t: number) => {
      const k = Math.min(1, (t - t0) / duree);
      const e = 1 - Math.pow(1 - k, 3);
      setAffiche(k >= 1 ? total : Math.round(total * e));
      if (k < 1) raf = requestAnimationFrame(pas); else setAnim(false);
    };
    raf = requestAnimationFrame(pas);
    return () => { cancelAnimationFrame(raf); setAffiche(total); };
  }, [anim]);
  const voir = () => {
    setVue(true);
    logUsage('paie_vue', 'mois');
    if (!reduit) { setAffiche(0); setAnim(true); }
    focusApres.current = 'total';
  };
  const cacher = () => { setVue(false); focusApres.current = 'voir'; };
  // Relecture T-118 (M2) : le focus suit le changement de face une fois la face rendue active (sans `inert`), avec ou sans
  // mouvement réduit.
  const focusApres = useRef<'total' | 'voir' | null>(null);
  useEffect(() => {
    const cible = focusApres.current === 'total' ? totalRef.current : focusApres.current === 'voir' ? voirRef.current : null;
    focusApres.current = null;
    cible?.focus();
  }, [vue]);
  return (
    <div class={`ton-mois${vue ? ' retourne' : ''}${reduit ? ' sans-mouvement' : ''}`}>
      <section class="card tm-face tm-avant" aria-labelledby="tm-t" inert={vue}>
        <span class="tm-eyebrow">Ton mois · {c.child}{c.family ? `, famille ${c.family}` : ''}</span>
        <h2 id="tm-t" class="tm-titre">Ton travail en {monthLabel(month).split(' ')[0]}</h2>
        <div class="stat-grid">
          <div><b class="num">{res.jours}</b><span>jour{res.jours > 1 ? 's' : ''} d’accueil</span></div>
          <div><b class="num">{dureeTexte(res.minutes)}</b><span>de travail</span></div>
          <div><b class="num">{absences}</b><span>absence{absences > 1 ? 's' : ''}</span></div>
        </div>
        {lignes.length
          ? <ul class="tm-lignes">{lignes.map((l) => <li>{l}</li>)}</ul>
          : <p class="muted">Aucun écart avec le planning.</p>}
        {etat && <span class="tm-etat"><Icon name="clock" size={16} />{etat}</span>}
        <button ref={voirRef} class="btn btn-primary btn-lg btn-block" type="button" onClick={voir} aria-expanded={vue} aria-controls="tm-paie">
          <Icon name="euro" />Voir ma paie du mois
        </button>
      </section>
      <section id="tm-paie" class="summary stack tm-face tm-arriere" aria-labelledby="tot" inert={!vue}>
        {titre}
        <span ref={totalRef} class="total" tabIndex={-1}>
          <span aria-hidden="true">{euros(affiche)}</span>
          <span class="sr-only">{euros(total)}</span>
        </span>
        {children}
        <span class="summary-sub">Pour {res.jours} jour{res.jours > 1 ? 's' : ''} d’accueil et {dureeTexte(res.minutes)} de travail{absences ? `, ${absences} absence${absences > 1 ? 's' : ''}` : ''}{res.jusquau < lastDay(month) ? ` au ${res.jusquau.slice(8, 10)}/${res.jusquau.slice(5, 7)}` : ''}.</span>
        <button class="btn tm-revoir" type="button" onClick={cacher}><Icon name="undo" />Revoir le travail du mois</button>
        <div class="tm-toujours">
          <Switch label="Toujours afficher ma paie" checked={toujours} onChange={(v) => { setToujours(v); setPaieToujoursVisible(v); if (v) setVue(true); }} />
        </div>
      </section>
    </div>
  );
}
