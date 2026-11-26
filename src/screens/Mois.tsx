import { AVERTISSEMENT_CALCUL, PAJEMPLOI_PLUS_DATE, PAJEMPLOI_PLUS_RAPPEL } from '../legal';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ctxFor, logUsage, putContract, toast, useStore, state } from '../store';
import { addMonths, dayLabel, eachDay, firstDay, lastDay, monthLabel, monthOf, today, weekday, type ISODate, type Month } from '../engine/dates';
import { computeMonth, declarationLines, declarationText, MESSAGE_REDUCTION_HS_BRUT, moisEnCoursAu, totalAVerser } from '../engine/month';
import { dayInfo, PREFIXE_ENTRETIEN_SOUS_MIN, termsAt } from '../engine/payroll';
import { MESSAGE_CONGES_DEPART, MESSAGE_SOLDE_CONGES } from '../engine/conges';
import { CongesDepart } from './CongesDepart';
import { estInformation } from '../engine/alertes';
import { euros, hoursLabel } from '../engine/money';
import { baremesAttendus, messageBaremesAttendus } from '../engine/rates';
import { CHILD_ABS_LABEL, AM_ABS_LABEL, type AmLeave, type Contract } from '../engine/model';
import { CHILD_COLORS, CHILD_INKS } from '../ui/kit';
import { annulerDeclare, declareLe, marquerDeclare, texteDeclare } from '../declares';
import { Banner, Gommette, Topbar } from '../ui/kit';
import { de } from '../engine/texte';
import { Icon } from '../ui/icons';
import { shareText } from '../share';
import { AideVideo } from '../ui/VideoGuide';
import { AmAbsenceSheet, DaySheet } from './Today';
import { CongeSheet } from './Conges';
import { lignesDetail } from '../engine/detail';
import { dureeTexte, etatDeclaration, lignesResume, montantFinDeMois, resumeTravail, texteMoisEnCours } from '../engine/resume';
import { mouvementReduit, paieToujoursVisible, setPaieToujoursVisible } from '../paie-visible';
import { masquerMontants, Montant, usePaieVue } from '../ui/paie';
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
  // T-135 : enfant choisi (carte, puce ou lien) : la lunette devient son calendrier. Sans choix : la vue de tous.
  const choisi = list.find((x) => x.id === cid);
  const c = choisi ?? list[0];
  const [edit, setEdit] = useState<string | null>(null);
  // T-135 : un jour touché dans la lunette de tous ouvre « Je serai absente » à ce jour.
  const [amJour, setAmJour] = useState<string | null>(null);
  // T-135 : un jour d'absence de l'AM touché ouvre cette absence (modifier, supprimer).
  const [conge, setConge] = useState<string | null>(null);
  const congeOuvert = conge ? s.leaves.find((l) => l.id === conge) : undefined;
  // T-118 : paie du mois cachée d'emblée ; montrée d'un geste, elle reste visible jusqu'à la sortie de l'écran Mois
  // (changer de mois ou d'enfant ne la recache pas). « Toujours afficher ma paie » : gardé sur ce téléphone.
  const [paieVue, setPaieVue] = usePaieVue();
  // Vision 1.1 (T-126) : la page de l'enfant suit la vue d'ensemble, sur le même écran ; une carte la choisit et y descend.
  const enfantRef = useRef<HTMLElement>(null);
  const descendre = () => requestAnimationFrame(() => enfantRef.current?.scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'start' }));
  const lunetteRef = useRef<HTMLDivElement>(null);
  // T-135 : une carte choisit l'enfant (ou, déjà choisie, revient à tous) ; la lunette reste en vue.
  const choisir = (id: string | undefined) => {
    setCid(id);
    requestAnimationFrame(() => lunetteRef.current?.scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'nearest' }));
  };
  // Lien direct vers un mois et un enfant (#/mois/<mois>/<enfant>) : l'écran va à sa page.
  useEffect(() => {
    if (m0) setMonth(m0 as Month);
    if (c0) { setCid(c0); descendre(); }
  }, [m0, c0]);

  return (
    <>
      <Topbar title="Mois" sub="Déclaration Pajemploi" screen="mois" />
      <main class="mois">
        <div class="month-nav">
          <button class="icon-btn" aria-label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))}><Icon name="left" /></button>
          <h2 aria-live="polite">{monthLabel(month).replace(/^./, (x) => x.toUpperCase())}</h2>
          <button class="icon-btn" aria-label="Mois suivant" disabled={month >= monthOf(today())} onClick={() => setMonth(addMonths(month, 1))}><Icon name="right" /></button>
        </div>
        {list.length > 0 && <VueMois key={month} list={list} month={month} paieVue={paieVue} setPaieVue={setPaieVue} enfant={choisi} lunetteRef={lunetteRef}
          onChoisir={(id) => choisir(id === choisi?.id ? undefined : id)} onTous={() => choisir(undefined)}
          onJour={(j) => (j.conge?.id ? setConge(j.conge.id) : choisi ? setEdit(j.d) : setAmJour(j.d))} />}
        {!c ? (
          <div class="card empty"><h2>Pas de contrat ce mois-ci</h2><p class="muted">Change de mois ou ajoute un enfant depuis « Plus ».</p></div>
        ) : (
          <section class="mois-enfant" ref={enfantRef} aria-labelledby="me-t">
            <div class="me-tete">
              <h2 id="me-t">{c.child}</h2>
              <Gommette name={c.child} color={c.color} />
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
            <MonthView key={`${c.id}|${month}`} c={c} month={month} onEdit={setEdit} paieVue={paieVue} setPaieVue={setPaieVue} />
          </section>
        )}
        <AideVideo id="mois" />
      </main>
      {edit && c && <DaySheet c={c} day={edit} onClose={() => setEdit(null)} />}
      {amJour && <AmAbsenceSheet start={amJour} onClose={() => setAmJour(null)} />}
      {congeOuvert && <CongeSheet l={congeOuvert} onClose={() => setConge(null)} />}
    </>
  );
}

/** Un mois est calculé pour un contrat : ni repris de l'historique, ni barèmes attendus, ni cas à régler (T-031, T-103, T-116, T-119). */
function calcule(c: Contract, month: Month) {
  const r = computeMonth(ctxFor(c), month, state.settings.enfantsACharge);
  const ok = !r.fromHistory && !baremesAttendus(firstDay(month)) && r.nonGere.length === 0;
  return { r, ok };
}

/** Valeur d'une case Pajemploi à coller : sans « € » ni « h » (comme la page des parents). */
export function valeurACopier(v: string): string {
  return v.replace(/[\u00a0\u202f]/g, ' ').replace(/\s*€$/, '').replace(/^(\d+) h$/, '$1').trim();
}

// T-135 : composants de la paie cachée, communs à toute l'app (src/ui/paie.tsx).
export { MONTANT_CACHE, masquerMontants } from '../ui/paie';

/**
 * Jours de la lunette : un par jour où au moins un contrat prévoit un accueil (consigne T-126, 9.6). T-135 (décision de la
 * direction) : un jour d'absence de l'AM reste dans le cercle, marqué (`conge`), et ne compte pas dans les jours prévus.
 */
export type CongeLunette = Partial<AmLeave> & { from: string; to: string };
export interface JourLunette { d: ISODate; ferie: boolean; absents: Contract[]; conge?: CongeLunette }
export function joursLunette(list: Contract[], month: Month, leaves: CongeLunette[]): JourLunette[] {
  const out: JourLunette[] = [];
  for (const d of eachDay(firstDay(month), lastDay(month))) {
    const conge = leaves.find((l) => d >= l.from && d <= l.to);
    const infos = list.map((c) => ({ c, di: dayInfo(ctxFor(c), d) })).filter((x) => x.di.planned.length > 0);
    if (!infos.length) continue;
    out.push(conge ? { d, ferie: infos.some((x) => !!x.di.ferie), absents: [], conge } : { d, ferie: infos.some((x) => !!x.di.ferie), absents: infos.filter((x) => x.di.kind === 'absent').map((x) => x.c) });
  }
  return out;
}

/** Jours d'accueil prévus du cercle : ni férié, ni absence de l'AM (absences des enfants comprises : elles étaient prévues). */
export const joursPrevus = (jours: JourLunette[]) => jours.filter((j) => !j.ferie && !j.conge).length;

/** Montant qui monte de 0 à sa valeur en 0,8 s après le geste « Voir ma paie » ; rien ne bouge si le téléphone demande un mouvement réduit. */
function useMontantQuiMonte(total: number): [number, () => void] {
  const [affiche, setAffiche] = useState(total);
  const [anim, setAnim] = useState(false);
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
  const lancer = () => { if (!mouvementReduit()) { setAffiche(0); setAnim(true); } };
  return [affiche, lancer];
}

/** Vue d'ensemble du mois : lunette, enfants absents, « À déclarer sur Pajemploi », « Ta paie du mois » (total, puis la paie de chaque contrat). */
function VueMois({ list, month, paieVue, setPaieVue, enfant, lunetteRef, onChoisir, onTous, onJour }: {
  list: Contract[]; month: Month; paieVue: boolean; setPaieVue: (v: boolean) => void; enfant?: Contract;
  lunetteRef: preact.RefObject<HTMLDivElement>; onChoisir: (id: string) => void; onTous: () => void; onJour: (j: JourLunette) => void;
}) {
  const s = useStore();
  const t = today();
  // T-135 : enfant choisi : son calendrier (ses jours prévus, ses absences, fériés, aujourd'hui). Sinon : tous les contrats.
  const jours = joursLunette(enfant ? [enfant] : list, month, s.leaves);
  // T-135 : le centre compte ce que dit son libellé : les jours d'accueil prévus du mois (calendrier), et non les jours
  // d'activité déclarés à Pajemploi des cartes (jours mensualisés), ni les jours d'accueil déjà faits de « Ton mois ».
  const prevus = joursPrevus(jours);
  const conges = jours.some((j) => j.conge);
  const calculs = list.map((c) => ({ c, ...calcule(c, month) }));
  const nonCalcules = calculs.filter((x) => !x.ok);
  const total = nonCalcules.length ? 0 : calculs.reduce((n, x) => n + totalAVerser(x.r), 0);
  const [affiche, lancer] = useMontantQuiMonte(total);
  const voir = () => { setPaieVue(true); logUsage('paie_vue', 'mois'); lancer(); };
  const rappels = jours.flatMap((j) => j.absents.map((c) => ({ c, d: j.d })));
  // Lunette : semaines séparées par un vide ; on tourne dans le sens des aiguilles d'une montre depuis midi.
  const places: (JourLunette | null)[] = [];
  jours.forEach((j, i) => {
    if (i > 0 && (weekday(j.d) < weekday(jours[i - 1].d) || Number(j.d.slice(8)) - Number(jours[i - 1].d.slice(8)) >= 7)) places.push(null);
    places.push(j);
  });
  if (places.length) places.push(null);
  const n = Math.max(places.length, 1);
  const R = 132, C = 170;
  // Bouton d'un jour : aussi large que l'écart entre deux jours (13 % du cadre au plus).
  const taille = Math.min(13, ((2 * Math.PI * R) / n / 340) * 100);
  const Mois1 = monthLabel(month).replace(/^./, (x) => x.toUpperCase());
  const label = `${enfant ? `Calendrier ${de(enfant.child)}, ` : ''}${Mois1} : ${prevus} jour${prevus > 1 ? 's' : ''} d’accueil prévu${prevus > 1 ? 's' : ''}.`;
  const nomJour = (j: JourLunette) => `${dayLabel(j.d)}${j.conge ? (j.conge.type === 'cp' || !j.conge.type ? ', congé' : ', absence') : ''}${j.ferie ? ', férié' : ''}${j.absents.length ? `, absence ${j.absents.map((c) => de(c.child)).join(', ')}` : ''}${j.d === t ? ', aujourd’hui' : ''}`;
  return (
    <section class="vue-mois" aria-label="Le mois en un coup d’œil">
      {enfant && (
        <div class="ln-tete">
          <Gommette name={enfant.child} color={enfant.color} />
          <h3 class="ln-nom">{enfant.child}</h3>
          <button class="btn btn-outline btn-sm" type="button" aria-label="Revenir à tous les enfants" onClick={onTous}>Tous</button>
        </div>
      )}
      <div class="lunette" ref={lunetteRef}>
        <div class="ln-cadre" role="group" aria-label={label}>
          {places.map((j, i) => {
            if (!j) return null;
            const a = (i / n) * 2 * Math.PI - Math.PI / 2 + Math.PI / n;
            const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
            const abs = j.absents[0];
            const cls = j.conge ? `ln-conge${j.d === t ? ' ln-conge-auj' : ''}` : j.d === t ? 'ln-auj' : abs ? 'ln-abs' : j.ferie ? 'ln-ferie' : j.d < t ? 'ln-passe' : 'ln-avenir';
            const k = abs ? abs.color % CHILD_COLORS.length : 0;
            return (
              <button type="button" class={`ln ${cls}`} aria-label={nomJour(j)} onClick={() => onJour(j)}
                style={{ left: `${(x / 340) * 100}%`, top: `${(y / 340) * 100}%`, width: `${taille}%` }}>
                <span class="ln-rond" style={abs && j.d !== t ? { background: CHILD_COLORS[k], color: CHILD_INKS[k] } : undefined}>{Number(j.d.slice(8))}</span>
              </button>
            );
          })}
          <div class="ln-centre" aria-hidden="true">
            <span class="ln-total">{prevus}</span>
            <span class="ln-total-label">jour{prevus > 1 ? 's' : ''} d’accueil prévu{prevus > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      {(rappels.length > 0 || conges) && (
        <ul class="ln-rappels">
          {conges && <li><span class="ln-hachure" aria-hidden="true" />congé</li>}
          {rappels.slice(0, 2).map((x) => <li><Gommette name={x.c.child} color={x.c.color} size="sm" />absence le {Number(x.d.slice(8))}</li>)}
          {rappels.length > 2 && <li class="ln-plus">+{rappels.length - 2}</li>}
        </ul>
      )}
      <p class="eyebrow mp-eyebrow">À déclarer sur Pajemploi</p>
      <div class="mp-cartes">
        {calculs.map(({ c, r, ok }) => {
          const fait = c.declares?.[month];
          return (
            <button class="mp-carte" aria-pressed={c.id === enfant?.id} onClick={() => onChoisir(c.id)}>
              <Gommette name={c.child} color={c.color} />
              <b class="mp-nom">{c.child}</b>
              <span class="mp-chiffres">{ok ? `${r.heuresNormales} h · ${r.joursActivite} j` : 'Non calculé'}</span>
              {ok && (fait ? <span class="tag mp-etat"><Icon name="check" size={16} />Déclaré</span> : <span class="tag afaire mp-etat">À déclarer</span>)}
            </button>
          );
        })}
      </div>
      <div class="card mp-paie">
        <span class="mp-paie-txt">
          <span class="mp-paie-label">Ta paie du mois</span>
          {nonCalcules.length
            ? <span class="mp-paie-non">Non calculé pour {nonCalcules.map((x) => x.c.child).join(', ')}</span>
            : paieVue ? <b class="mp-total"><span aria-hidden="true">{euros(affiche)}</span><span class="sr-only">{euros(total)}</span></b> : <b class="mp-total mp-cache"><span aria-hidden="true">•••• €</span><span class="sr-only">Montant caché</span></b>}
        </span>
        {!nonCalcules.length && (paieVue
          ? <button class="btn" type="button" onClick={() => setPaieVue(false)}>Cacher</button>
          : <button class="btn btn-primary" type="button" onClick={voir}>Voir ma paie</button>)}
        {!nonCalcules.length && paieVue && calculs.length > 1 && (
          <ul class="mp-detail" aria-label="Paie de chaque contrat">
            {calculs.map(({ c, r }) => <li><span class="mp-detail-nom">{c.child}</span><span class="mp-detail-points" aria-hidden="true" /><b>{euros(totalAVerser(r))}</b></li>)}
          </ul>
        )}
      </div>
    </section>
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
        {r.missing ? <p>Aucun bulletin pour ce mois. Ajoute-le dans l’historique du contrat pour fiabiliser les congés et la fin de contrat.</p> : <p>Salaire net déclaré : <b><Montant v={euros(r.net)} /></b></p>}
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
  const fait = declareLe(c, month);
  const annulerRef = useRef<HTMLButtonElement>(null);
  const declarerRef = useRef<HTMLButtonElement>(null);
  const focusDeclare = useRef(false);
  useEffect(() => {
    if (!focusDeclare.current) return;
    focusDeclare.current = false;
    (fait ? annulerRef : declarerRef).current?.focus();
  }, [fait]);
  // T-126 : « C'est déclaré » (contrat à jour lu dans l'état : rien d'autre ne change).
  const noterDeclare = async (oui: boolean) => {
    const actuel = state.contracts.find((x) => x.id === c.id) ?? c;
    focusDeclare.current = true;
    await putContract(oui ? marquerDeclare(actuel, month, today()) : annulerDeclare(actuel, month));
  };
  const copier = async (v: string) => {
    try { await navigator.clipboard.writeText(valeurACopier(v)); toast('Copié'); } catch { /* presse-papiers refusé : rien n'est copié */ }
  };

  return (
    <>
      {!c.pajemploiPlus && (!c.end || c.end >= PAJEMPLOI_PLUS_DATE) && <Banner tone="info">{PAJEMPLOI_PLUS_RAPPEL}</Banner>}
      {/* T-135 : paie cachée : les montants des alertes du mois aussi. */}
      {r.alerts.map((a) => a.startsWith(PREFIXE_ENTRETIEN_SOUS_MIN)
        ? <Banner tone="warn"><span>{paieVue ? a : masquerMontants(a)}</span><a class="btn btn-outline" href={`#/avenant/${c.id}/nouveau`}>Faire l’avenant</a></Banner>
        : <Banner tone={estInformation(a) ? 'info' : 'warn'}>{paieVue ? a : masquerMontants(a)}</Banner>)}
      {r.cpNote && <Banner tone="info" icon="sun">{r.cpNote}</Banner>}

      <section class="decl-carte" aria-labelledby="decl-t">
        <h2 id="decl-t">À déclarer sur Pajemploi</h2>
        <p class="hint">Une déclaration par enfant, faite par le parent entre le 25 et le 5 du mois suivant, dans cet ordre.</p>
        <p class="hint">{AVERTISSEMENT_CALCUL}</p>
        <div class="decl">
          {lines.map((l, i) => (
            <div class="decl-line">
              <span class="decl-label"><span id={`dl-${i}`}>{l.label}</span>{l.hint && <span class="decl-hint">{l.hint}</span>}</span>
              {/* T-135 : paie cachée : montant masqué ; « Copier » copie la vraie valeur. */}
              <span class="decl-value" id={`dv-${i}`}>{/€$/.test(l.value) ? <Montant v={l.value} /> : l.value}</span>
              {/* Nom « Copier », case et valeur en description : le nom de la case reste celui de son champ ailleurs. */}
              <button class="btn decl-copier" type="button" onClick={() => void copier(l.value)} aria-describedby={`dl-${i} dv-${i}`}>Copier</button>
            </div>
          ))}
        </div>
        {fait ? (
          <div class="declare-fait" role="status">
            <Icon name="check" size={20} /><span>{texteDeclare(fait)}</span>
            <button ref={annulerRef} class="btn btn-ghost btn-sm" type="button" onClick={() => void noterDeclare(false)}>Annuler</button>
          </div>
        ) : (
          <button ref={declarerRef} class="btn btn-primary declare-btn" type="button" onClick={() => void noterDeclare(true)}>C’est déclaré</button>
        )}
      </section>

      <button
        class="btn btn-secondary btn-block"
        onClick={async () => {
          const res = await shareText(declarationText(ctx, r, state.settings.amName));
          logUsage('mois_partage', 'mois');
          if (res === 'copied') toast('Texte copié : colle-le dans ton message au parent.');
        }}
      >
        <Icon name="share" />Envoyer au parent
      </button>

      <div class="list mois-liens">
        <details class="li-details">
          <summary class="li">
            <span class="li-main"><span class="li-title" id="exc-t">Ce qui a changé ce mois-ci</span></span>
            <span class="li-end"><b class="li-nombre">{exceptions.length}</b><Icon name="right" /></span>
          </summary>
          {exceptions.length === 0 ? (
            <p class="muted li-vide">Rien : tout s’est passé comme prévu au planning.</p>
          ) : (
            <div class="list li-sous" aria-labelledby="exc-t">
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
        </details>
        <a class="li" href={`#/controle/${c.id}/${month}`}><span class="li-main"><span class="li-title">Contrôler le bulletin</span></span><span class="li-end"><Icon name="right" /></span></a>
        <button class="li" type="button" onClick={fabriquer} disabled={occupe} aria-busy={occupe}>
          <span class="li-main"><span class="li-title">{occupe ? 'Fabrication du relevé…' : 'Relevé du mois (PDF)'}</span></span><span class="li-end"><Icon name="right" /></span>
        </button>
        {/* T-103 (M5) : un champ date vide s'affiche sur iPhone comme un cadre blanc. Ligne visible, champ date transparent par-dessus. */}
        <span class="li pick-day">
          <span class="li-main"><span class="li-title">Corriger un jour</span></span><span class="li-end"><Icon name="right" /></span>
          <input id="other-day" aria-label="Choisir un jour à corriger" type="date" min={firstDay(month)} max={lastDay(month) < today() ? lastDay(month) : today()}
            onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onEdit(v); (e.target as HTMLInputElement).value = ''; }} />
        </span>
      </div>
      {pret && (
        <Banner tone="info">
          Le relevé est prêt. <button class="btn-link" type="button" disabled={partage} onClick={() => envoyer(pret)}>Partager le relevé</button>
        </Banner>
      )}

      <TonMois c={c} month={month} vue={paieVue} setVue={setPaieVue} total={totalVerse}
        titre={<span class="summary-label" id="tot">Ta paie de {monthLabel(month).split(' ')[0]} · à verser par la famille{c.family ? ` ${c.family}` : ''}</span>}>
        <span class="summary-sub">dont salaire net {euros(r.netTotal)}{r.brutConnu ? `, soit ${euros(r.brutEstime)} brut` : ''}</span>
        {r.brutConnu && r.reductionHS > 0 && <span class="summary-sub">et réduction de cotisations des heures complémentaires et majorées {euros(r.reductionHS)}</span>}
        {/* T-118 (ajout du DG du 26/11) : informations neutres, sans couleur d'alerte (plus de pastille orange). */}
        {!r.brutConnu && <span class="summary-info"><Icon name="info" size={16} /><span>Brut non affiché : <a href={`#/contrat/${c.id}`}>indique ton taux horaire brut dans le contrat</a>.</span></span>}
        {enCours && <span class="summary-info"><Icon name="info" size={16} /><span>{texteMoisEnCours(month, finAttendue, !!c.accueilOccasionnel)}</span></span>}
      </TonMois>

      <details class="more">
        <summary>Comment c’est calculé</summary>
        <div class="more-body">
          <dl class="kv">
            {/* T-118 (D-23) : lignes qui font toujours le salaire net (prorata d'entrée, de sortie ou d'avenant compris). */}
            {!c.accueilOccasionnel && (<><dt>{termsAt(c, `${month}-01`).yearType === 'complete' ? 'Heures du planning type ce mois (art. 111)' : 'Jours du planning type ce mois (art. 111)'}</dt>
            <dd>{termsAt(c, `${month}-01`).yearType === 'complete' ? hoursLabel(r.divisorMin) : r.divisorDays}</dd></>)}
            {lignesDetail(c, month, r).map((l) => <><dt>{l.total ? <b>{l.label}</b> : l.label}</dt><dd><Montant v={l.montant < 0 ? `−${euros(-l.montant)}` : euros(l.montant)} /></dd></>)}
            {r.brutConnu && r.reductionHS > 0 && (<><dt>Réduction de cotisations des heures complémentaires et majorées</dt><dd><Montant v={euros(r.reductionHS)} /></dd></>)}
            <dt>Entretien ({r.presenceDays} j)</dt><dd><Montant v={euros(r.entretien)} /></dd>
            {r.repas > 0 && (<><dt>Repas</dt><dd><Montant v={euros(r.repas)} /></dd></>)}
            {r.km > 0 && (<><dt>Kilomètres</dt><dd><Montant v={euros(r.km)} /></dd></>)}
          </dl>
          {r.brutConnu && r.reductionHS > 0 && <p class="muted small">Heures complémentaires et majorées : elles ouvrent une réduction de tes cotisations de <Montant v={euros(r.reductionHS)} /> (11,31 % de leur brut, code de la sécurité sociale, art. L241-17 et D241-21), comptée dans le total à verser. Ces heures sont aussi exonérées d’impôt, dans la limite de 7 500 € par an.</p>}
          {r.reductionHSManquante && <p class="muted small">{MESSAGE_REDUCTION_HS_BRUT}</p>}
          <p class="muted small">
            {c.accueilOccasionnel ? 'Accueil occasionnel : heures d’accueil du mois × taux horaire ; congés payés : 10 % des salaires de l’accueil, versés à sa fin (art. 109.3 et 102.1.2.3).' : termsAt(c, `${month}-01`).yearType === 'complete'
              ? 'Année complète : retenue = salaire mensualisé × heures non payées ÷ heures prévues dans le mois (art. 111).'
              : 'Année incomplète : retenue = salaire mensualisé × jours non payés ÷ jours prévus dans le mois (art. 111).'}
          </p>
        </div>
      </details>
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
    if (!cible) return;
    // Contre-relecture T-118 (M2) : une image plus tard, la face est visible et peut prendre le focus.
    cible.focus();
    if (document.activeElement !== cible) requestAnimationFrame(() => cible.focus());
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
