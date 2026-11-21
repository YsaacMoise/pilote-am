import { ABSENCE_NON_GEREE_CHOISIE, ABSENCES_NON_GEREES } from '../legal';
import { useEffect, useState } from 'preact/hooks';
import { activeContracts, ctxFor, logUsage, putLeave, saveSettings, state, toast, uid, updateDay, useStore } from '../store';
import { addDays, dayLabel, minutes, nowHHMM, today, weekday, JOUR_NOMS, MOIS_NOMS, daysBetween } from '../engine/dates';
import { dayInfo, type Ctx, type DayInfo } from '../engine/payroll';
import { AM_ABS_LABEL, AM_ABS_NON_GEREES, CHILD_ABS_LABEL, type AmAbs, type ChildAbs, type Contract, type DayRec, type NatureEvenement, type Plage, type Presence } from '../engine/model';
import { libelleDureeSaisie, NATURE_EVENEMENT_LABEL } from '../engine/evenements';
import { hoursLabel } from '../engine/money';
import { Banner, CHILD_COLORS, Choices, DateInput, Gommette, Sheet, Stepper, Switch, Topbar, useErreurAffichee } from '../ui/kit';
import { evAnnulation, evCorrections, evPointage, type GestePointage } from '../usage-events';
import { AideVideo, BienvenueDemo } from '../ui/VideoGuide';
import { isDemo } from '../db';
import { Icon } from '../ui/icons';
import { de } from '../engine/texte';

const fmtH = (t: string) => t.replace(/^0(\d)/, '$1').replace(':', ' h ');

function planText(di: DayInfo): string {
  if (!di.planned.length) return 'Pas d’accueil prévu';
  return 'Prévu ' + di.planned.map((p) => `${fmtH(p.start)} – ${fmtH(p.end)}`).join(' et ');
}

/** Ligne « Prévu » : les horaires en JetBrains Mono, reliés par une flèche, comme dans la charte (08h15 → 17h45). */
function PlanLine({ di }: { di: DayInfo }) {
  if (!di.planned.length) return <>Pas d’accueil prévu</>;
  return (
    <>
      <span class="sr-only">{planText(di)}</span>
      <span aria-hidden="true">Prévu {di.planned.map((p, i) => <>{i > 0 && ' et '}<span class="hours">{p.start.replace(':', 'h')} → {p.end.replace(':', 'h')}</span></>)}</span>
    </>
  );
}

export function Today() {
  const s = useStore();
  const t = today();
  const [day, setDay] = useState(t);
  const [edit, setEdit] = useState<Contract | null>(null);
  const [amSheet, setAmSheet] = useState(false);
  // T-048 : l'écran se réévalue chaque minute et au retour sur l'app, pour que le bouton change sans recharger.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const tic = () => setMinute((m) => m + 1);
    // Calée sur le début de chaque minute : la minuterie se relance jusqu'à la minute suivante (toutes les 60 s),
    // sans dériver même si le téléphone a ralenti les minuteries pendant que l'app était en arrière-plan.
    let id: ReturnType<typeof setTimeout>;
    const planifier = () => { id = setTimeout(() => { tic(); planifier(); }, msAvantMinuteSuivante(Date.now())); };
    planifier();
    const retour = () => { if (document.visibilityState === 'visible') tic(); };
    document.addEventListener('visibilitychange', retour);
    window.addEventListener('focus', tic);
    return () => { clearTimeout(id); document.removeEventListener('visibilitychange', retour); window.removeEventListener('focus', tic); };
  }, []);
  const kids = s.contracts.filter((c) => c.start <= day && (!c.end || c.end >= day));
  const base = day < addDays(t, -5) ? addDays(day, 5) : t;
  const days = Array.from({ length: 7 }, (_, i) => addDays(base, i - 5));

  // Départs oubliés sur les 14 derniers jours
  const forgotten: { c: Contract; d: string }[] = [];
  for (const c of activeContracts()) {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(t, -i);
      if (dayInfo(ctxFor(c), d).departOublie) forgotten.push({ c, d });
    }
  }
  const lastBackup = s.settings.lastBackup;
  const backupDue = s.contracts.length > 0 && (!lastBackup || Date.now() - lastBackup > 7 * 86400000);
  const amToday = s.leaves.find((l) => day >= l.from && day <= l.to);

  return (
    <>
      <Topbar title={day === t ? 'Aujourd’hui' : dayLabel(day).replace(/^./, (x) => x.toUpperCase())} sub={day === t ? dayLabel(day) : day < t ? `il y a ${daysBetween(day, t)} jour${daysBetween(day, t) > 1 ? 's' : ''}` : 'à venir'} screen="aujourdhui" />
      <main>
        {isDemo() && <BienvenueDemo />}
        <AideVideo id="pointer" />
        <nav aria-label="Choisir le jour" class="daystrip">
          {days.map((d) => {
            const flag = s.contracts.some((c) => dayInfo(ctxFor(c), d).departOublie);
            return (
              <button aria-pressed={d === day} onClick={() => setDay(d)}>
                <span class="d-name">{d === t ? 'auj.' : JOUR_NOMS[weekday(d) - 1].slice(0, 3)}</span>{' '}
                <span class="d-num">{Number(d.slice(8))}</span>
                <span class="sr-only"> {MOIS_NOMS[Number(d.slice(5, 7)) - 1]}{flag ? ', départ non pointé' : ''}</span>
                <span class={`d-dot ${flag ? 'on' : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        {amToday && (
          <Banner tone="info" icon="sun">
            <strong>{AM_ABS_LABEL[amToday.type]}</strong>
            <span>Du {dayLabel(amToday.from)} au {dayLabel(amToday.to)}, pour tous les enfants.</span>
          </Banner>
        )}

        {kids.length === 0 && (
          <div class="card empty">
            <h2>{s.contracts.length ? 'Aucun contrat ce jour-là' : 'Ajoute le premier enfant que tu accueilles'}</h2>
            <p class="muted">Le planning du contrat remplit les journées tout seul. Tu n’auras qu’à noter ce qui change.</p>
            {!s.contracts.length && <a class="btn btn-primary btn-lg" href="#/contrat/nouveau"><Icon name="plus" />Ajouter un enfant accueilli</a>}
          </div>
        )}

        {kids.length > 1 && (
          <div class="seg view-switch" role="radiogroup" aria-label="Affichage des enfants">
            <button role="radio" aria-checked={!s.settings.compact} onClick={() => { saveSettings({ compact: false }); logUsage('vue_cartes', 'aujourdhui'); }}>Cartes</button>
            <button role="radio" aria-checked={!!s.settings.compact} onClick={() => { saveSettings({ compact: true }); logUsage('vue_liste', 'aujourdhui'); }}>Liste</button>
          </div>
        )}
        {s.settings.compact && kids.length > 1 ? (
          <div class="kid-list">
            {kids.map((c) => <KidCard key={c.id} c={c} day={day} compact onEdit={() => setEdit(c)} />)}
          </div>
        ) : (
          kids.map((c) => <KidCard key={c.id} c={c} day={day} onEdit={() => setEdit(c)} />)
        )}
        {day === t && forgotten.length > 0 && (
          <Banner tone="warn">
            <strong>{forgotten.length === 1 ? 'Un départ n’a pas été pointé' : `${forgotten.length} départs n’ont pas été pointés`}</strong>
            <span>
              {forgotten.slice(0, 3).map((f) => `${f.c.child} le ${dayLabel(f.d)}`).join(', ')}. L’heure prévue est retenue en attendant.
            </span>
            <div class="btn-row">
              <button class="btn btn-outline" onClick={() => setDay(forgotten[0].d)}>Corriger</button>
            </div>
          </Banner>
        )}

        {day === t && backupDue && (
          <Banner tone="info" icon="shield">
            <strong>Pense à ta sauvegarde de la semaine</strong>
            <span>Une copie dans Fichiers protège tes données si le téléphone est perdu.</span>
            <div class="btn-row"><a class="btn btn-outline" href="#/sauvegarde">Sauvegarder</a></div>
          </Banner>
        )}


        {s.contracts.length > 0 && (
          <button class="btn btn-outline btn-block" onClick={() => setAmSheet(true)}>
            <Icon name="calendar" />Je serai absente
          </button>
        )}
      </main>
      {edit && <DaySheet c={edit} day={day} onClose={() => setEdit(null)} />}
      {amSheet && <AmAbsenceSheet start={day} onClose={() => setAmSheet(false)} />}
    </>
  );
}

// ---------- T-048 : heure vraie quand l'appui arrive loin de l'heure prévue ----------
// Seuils stricts, en minutes : au-delà, l'app demande quelle heure est vraie au lieu de noter l'heure de l'appui.
/** Arrivée : plus de 30 minutes après le début prévu (seuil fixé par le DG). */
export const SEUIL_ARRIVEE_MIN = 30;
/** Départ : plus de 15 minutes après la fin prévue (chaque minute après la fin prévue est payée en plus). */
export const SEUIL_DEPART_MIN = 15;

/** Heure lisible des textes T-048 : « 8 h 15 », « 17 h » (sans « 00 », sans zéro devant l'heure). */
export function heureLisible(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Les trois choix à proposer, quand le seuil est passé. */
export interface ChoixPointage {
  kind: 'a' | 'd';
  idx: number;
  /** Heure prévue : début de la plage pour l'arrivée, fin pour le départ */
  prevue: string;
  /** Heure de l'appui, au rendu */
  maintenant: string;
  /** Minutes entre l'heure prévue et maintenant */
  ecartMin: number;
  /**
   * Départ : minutes que le moteur paiera en plus avec un départ « maintenant » plutôt qu'à la fin prévue
   * (voir minutesPayeesEnPlus). Absent ou ≤ 0 : pas de parenthèse « (+N min payées) ».
   */
  payeesMin?: number;
}

/** Délai jusqu'au début de la minute suivante (petite marge de 50 ms pour tomber après le changement de minute). */
export function msAvantMinuteSuivante(nowMs: number): number {
  return 60_000 - (nowMs % 60_000) + 50;
}

/**
 * Appui sur le bouton simple « Arrivée » / « Départ » : le choix est recalculé avec l'heure du geste.
 * « choix » : le seuil est passé entre deux réévaluations de l'écran ; rien n'est enregistré, les trois choix s'ouvrent.
 * « direct » : l'heure de l'appui est notée, comme avant T-048.
 */
export function decisionAppui(planned: Plage[], na: { idx: number; kind: 'a' | 'd' } | null, heureGeste: string): 'choix' | 'direct' {
  return choixPointage(planned, na, heureGeste) ? 'choix' : 'direct';
}

/**
 * Minutes payées en plus par un départ à `heureDepart` plutôt qu'à la fin prévue de la plage `idx`, selon le moteur :
 * différence d'extraMin de dayInfo entre les deux journées simulées. Le contexte est copié (journées dans une Map neuve,
 * cache neuf) : ni le contexte de l'écran ni son cache ne sont touchés.
 */
export function minutesPayeesEnPlus(ctx: Ctx, day: string, idx: number, heureDepart: string): number {
  const rec = ctx.days.get(day);
  const plage = dayInfo(ctx, day).planned[idx];
  if (!rec || !plage) return 0;
  const simule = (heure: string) => {
    const days = new Map(ctx.days);
    days.set(day, pointerJour(rec, idx, 'd', heure, true));
    return dayInfo({ ...ctx, days, cache: new Map() }, day).extraMin;
  };
  return simule(heureDepart) - simule(plage.end);
}

/**
 * Choix à proposer pour la plage à pointer (celle de nextAction), ou null : rien ne change (avant le seuil,
 * plage sans heure prévue, accueil imprévu, rien à pointer).
 */
export function choixPointage(planned: Plage[], na: { idx: number; kind: 'a' | 'd' } | null, maintenant: string): ChoixPointage | null {
  if (!na) return null;
  const plage = planned[na.idx];
  if (!plage) return null;
  const prevue = na.kind === 'a' ? plage.start : plage.end;
  const ecartMin = minutes(maintenant) - minutes(prevue);
  const seuil = na.kind === 'a' ? SEUIL_ARRIVEE_MIN : SEUIL_DEPART_MIN;
  if (ecartMin <= seuil) return null;
  return { kind: na.kind, idx: na.idx, prevue, maintenant, ecartMin };
}

/** Textes de la carte et de la fiche : ligne d'en-tête et libellés des trois boutons. */
export function textesChoix(ch: ChoixPointage): { titre: string; prevue: string; maintenant: string; autre: string } {
  const arr = ch.kind === 'a';
  return {
    titre: `${arr ? 'Arrivée' : 'Départ'} prévu${arr ? 'e' : ''} à ${heureLisible(ch.prevue)}`,
    prevue: `À ${heureLisible(ch.prevue)}`,
    maintenant: `Maintenant, ${heureLisible(ch.maintenant)}${!arr && (ch.payeesMin ?? 0) > 0 ? ` (+${ch.payeesMin} min payées)` : ''}`,
    autre: 'Autre heure',
  };
}

export const MSG_DEPART_AVANT_ARRIVEE = 'L’heure de départ doit être après l’arrivée.';
export const MSG_HEURE_FUTURE = 'Cette heure n’est pas encore passée.';
export const MSG_HEURE_VIDE = 'Choisis une heure.';

/**
 * Vérifie l'heure à enregistrer : pas d'heure future ; un départ après l'arrivée de la plage.
 * Rend le message à afficher, ou '' si l'heure est acceptée.
 */
export function verifierHeure(kind: 'a' | 'd', heure: string, maintenant: string, arrivee?: string): string {
  if (!/^\d{2}:\d{2}$/.test(heure)) return MSG_HEURE_VIDE;
  if (minutes(heure) > minutes(maintenant)) return MSG_HEURE_FUTURE;
  if (kind === 'd' && arrivee && minutes(heure) <= minutes(arrivee)) return MSG_DEPART_AVANT_ARRIVEE;
  return '';
}

/**
 * Enregistre un choix seulement si l'heure est acceptée : appelle pointer une fois, ou jamais.
 * Rend le message de refus, ou '' quand le pointage est parti. Seul chemin d'écriture des trois choix.
 */
export function enregistrerChoix(
  ch: Pick<ChoixPointage, 'kind'>, heure: string, geste: GestePointage, maintenant: string, arrivee: string | undefined,
  pointer: (heure: string, geste: GestePointage) => unknown,
): string {
  const e = verifierHeure(ch.kind, heure, maintenant, arrivee);
  if (!e) void pointer(heure, geste);
  return e;
}

/** Journée après le pointage : la même mise à jour que le bouton d'avant T-048, avec l'heure choisie. */
export function pointerJour(r: DayRec, idx: number, kind: 'a' | 'd', heure: string, avecPlanning: boolean): DayRec {
  const p: Presence[] = [...(r.pres ?? [])];
  while (p.length <= idx) p.push({});
  p[idx] = kind === 'a' ? { a: heure } : { ...p[idx], d: heure };
  return { ...r, pres: p, extra: avecPlanning ? r.extra : true };
}

export function nextAction(di: Pick<DayInfo, 'planned'>, rec: DayRec | undefined): { idx: number; kind: 'a' | 'd' } | null {
  const pres = rec?.pres ?? [];
  const n = Math.max(di.planned.length, 1);
  for (let i = 0; i < n; i++) {
    const p = pres[i];
    if (!p?.a) return { idx: i, kind: 'a' };
    if (!p.d) return { idx: i, kind: 'd' };
  }
  return null;
}

function KidCard({ c, day, onEdit, compact }: { c: Contract; day: string; onEdit: () => void; compact?: boolean }) {
  // Heure lue à chaque rendu (l'écran se réévalue chaque minute, et après un appui).
  const maintenant = nowHHMM();
  const t = today();
  // T-048 : fiche ouverte : « choix » (vue en liste) ou « autre » (saisie de l'heure)
  const [fiche, setFiche] = useState<'choix' | 'autre' | null>(null);
  let choix: ChoixPointage | null = null;
  let pointer: ((heure: string, geste: GestePointage | null) => Promise<void>) | null = null;
  let arriveePlage: string | undefined;
  const ctx = ctxFor(c);
  const di = dayInfo(ctx, day);
  const rec = di.rec;
  const color = CHILD_COLORS[c.color % CHILD_COLORS.length];
  const tags: { tone: string; text: string }[] = [];
  let action: { label: string; icon: 'in' | 'out'; run: () => void; quiet?: boolean } | null = null;

  const pres = (rec?.pres ?? []).filter((p) => p.a);
  for (const p of pres) {
    tags.push({ tone: 'ok', text: `Arrivée ${fmtH(p.a!)}` });
    if (p.d) tags.push({ tone: 'ok', text: `Départ ${fmtH(p.d)}` });
  }
  if (di.extraMin > 0 && !di.enCours) tags.push({ tone: 'info', text: `+${hoursLabel(di.extraMin)} en plus` });
  if (di.departOublie) tags.push({ tone: 'warn', text: 'Départ non pointé' });
  if (di.kind === 'absent' && rec?.abs) {
    tags.push({ tone: 'info', text: CHILD_ABS_LABEL[rec.abs] });
    tags.push({ tone: di.deducted ? 'warn' : 'ok', text: di.deducted ? 'Retenu sur le salaire' : 'Payé' });
  }
  if (di.kind === 'ferie') tags.push({ tone: 'info', text: `Férié : ${di.ferie} (payé)` });
  if (di.kind === 'am' && di.amLeave) tags.push({ tone: 'info', text: AM_ABS_LABEL[di.amLeave] });
  if (di.kind === 'prevu' && day < t) tags.push({ tone: 'ok', text: 'Comme prévu' });

  const canPoint = day === t && (di.kind === 'prevu' || di.kind === 'present' || (di.kind === 'hors' && !di.planned.length));
  if (canPoint) {
    const na = nextAction(di, rec);
    if (na) {
      const isArr = na.kind === 'a';
      arriveePlage = isArr ? undefined : rec?.pres?.[na.idx]?.a;
      // Enregistre l'heure choisie : même mise à jour, même message avec « Annuler ».
      pointer = async (heure: string, geste: GestePointage | null) => {
        const undo = await updateDay(c.id, day, (r) => pointerJour(r, na.idx, na.kind, heure, di.planned.length > 0));
        // « arrivee » ou « depart » toujours ; le choix fait en plus quand les trois choix étaient proposés (T-048).
        for (const ev of evPointage(isArr, geste)) logUsage(ev, 'aujourdhui');
        // C-101 : une annulation juste après le pointage dit que le bouton a été touché par erreur.
        const annuler = async () => { await undo(); logUsage(evAnnulation(isArr), 'aujourdhui'); };
        let extra = '';
        if (!isArr) {
          const plage = di.planned[na.idx];
          if (plage && minutes(heure) > minutes(plage.end)) extra = ` (+${hoursLabel(minutes(heure) - minutes(plage.end))})`;
        }
        toast(`${isArr ? 'Arrivée' : 'Départ'} ${de(c.child)} à ${fmtH(heure)}${extra}`, annuler);
      };
      // T-048 : seuil passé pour une plage qui a une heure prévue : trois choix au lieu de l'heure de l'appui.
      choix = choixPointage(di.planned, na, maintenant);
      if (choix?.kind === 'd') choix = { ...choix, payeesMin: minutesPayeesEnPlus(ctx, day, choix.idx, choix.maintenant) };
      const enregistrer = pointer;
      action = {
        label: isArr ? (di.planned.length || pres.length ? 'Arrivée' : 'Imprévu') : 'Départ',
        quiet: !di.planned.length && !pres.length,
        icon: isArr ? 'in' : 'out',
        run: () => {
          // R1 : seuil passé depuis le dernier rendu : rien n'est noté, les trois choix s'ouvrent.
          const heure = nowHHMM();
          if (decisionAppui(di.planned, na, heure) === 'choix') { setFiche('choix'); return; }
          void enregistrer(heure, null);
        },
      };
    }
  }

  // T-048 : les trois choix (carte, ou fiche de la vue en liste) et la fiche « Autre heure ».
  const choixVue = choix && pointer && (
    <ChoixHeure ch={choix} child={c.child} arrivee={arriveePlage} pointer={pointer} onAutre={() => setFiche('autre')} onFait={() => setFiche(null)} />
  );
  const fiches = choix && pointer && fiche && (
    fiche === 'choix'
      ? <Sheet title={`${choix.kind === 'a' ? 'Arrivée' : 'Départ'} ${de(c.child)}`} onClose={() => setFiche(null)}>{choixVue}</Sheet>
      : <AutreHeureSheet ch={choix} child={c.child} arrivee={arriveePlage} pointer={pointer} onClose={() => setFiche(null)} />
  );

  if (compact) {
    // Une ligne par enfant : pastille, prénom, l'état le plus utile, et le bouton du moment
    const status = tags.length ? tags[tags.length - 1].text : planText(di);
    return (
      <article class="kid-row" style={{ '--g': color } as any} aria-label={c.child}>
        <button class="kid-row-main" onClick={onEdit} aria-label={`${c.child} : ${planText(di)}${tags.length ? ', ' + tags.map((x) => x.text).join(', ') : ''}. Modifier la journée`}>
          <Gommette name={c.child} color={c.color} size="sm" />
          <span class="kid-row-text">
            <span class="kid-row-name">{c.child}</span>
            <span class="kid-row-status">{status}</span>
          </span>
        </button>
        {action && (
          <button class={action.quiet ? 'btn btn-outline' : 'btn btn-primary'} onClick={choix ? () => setFiche('choix') : action.run} aria-label={`${action.label} ${de(c.child)}`} aria-haspopup={choix ? 'dialog' : undefined}>
            <Icon name={action.icon} />{action.label}
          </button>
        )}
        {fiches}
      </article>
    );
  }

  return (
    <article class="kid" style={{ '--g': color } as any} aria-label={c.child}>
      <div class="kid-head">
        <Gommette name={c.child} color={c.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div class="kid-name">{c.child}</div>
          <div class="kid-plan"><PlanLine di={di} /></div>
        </div>
      </div>
      {tags.length > 0 && (
        <div class="kid-status">
          {tags.map((x) => <span class={`tag ${x.tone}`}>{x.text}</span>)}
        </div>
      )}
      {choixVue}
      <div class="kid-actions" style={!action || choix ? { gridTemplateColumns: '1fr' } : undefined}>
        {action && !choix && (
          <button class={action.quiet ? 'btn btn-outline' : 'btn btn-primary btn-lg'} onClick={action.run} aria-label={action.quiet ? `Accueil imprévu : arrivée ${de(c.child)}` : undefined}>
            <Icon name={action.icon} />{action.label}
          </button>
        )}
        <button class={`btn btn-edit ${action && !action.quiet && !choix ? 'btn-secondary btn-lg' : 'btn-secondary'}`} onClick={onEdit} aria-label={`${action ? 'Modifier' : day > t ? 'Prévoir une absence' : 'Modifier la journée'} (${c.child})`}>
          <Icon name="edit" />{action ? 'Modifier' : day > t ? 'Prévoir une absence' : 'Modifier la journée'}
        </button>
      </div>
      {fiches}
    </article>
  );
}

type Pointer = (heure: string, geste: GestePointage | null) => Promise<void>;

/** T-048 : « Arrivée prévue à 8 h 15 », puis « À 8 h 15 » (principal), « Maintenant, 9 h 05 », « Autre heure ». */
function ChoixHeure({ ch, child, arrivee, pointer, onAutre, onFait }: { ch: ChoixPointage; child: string; arrivee?: string; pointer: Pointer; onAutre: () => void; onFait: () => void }) {
  const tx = textesChoix(ch);
  const quoi = `${ch.kind === 'a' ? 'Arrivée' : 'Départ'} ${de(child)}`;
  // « À <heure de fin prévue> » ne doit pas donner un départ avant (ou à) l'arrivée enregistrée.
  const refusPrevue = verifierHeure(ch.kind, ch.prevue, ch.maintenant, arrivee);
  const [err, setErr] = useState('');
  useErreurAffichee('depart_avant_arrivee', err === MSG_DEPART_AVANT_ARRIVEE);
  const choisir = (heure: string, geste: GestePointage) => {
    // L'heure de l'appui est relue au moment du geste.
    const e = enregistrerChoix(ch, heure, geste, nowHHMM(), arrivee, pointer);
    if (e) setErr(e); else onFait();
  };
  return (
    <div class="pointage-choix" role="group" aria-label={`${quoi} : quelle heure est vraie ?`}>
      <p class="pointage-choix-titre">{tx.titre}</p>
      <button class="btn btn-primary btn-lg btn-block" disabled={!!refusPrevue} onClick={() => choisir(ch.prevue, 'prevue')} aria-label={`${quoi} ${tx.prevue.replace(/^À/, 'à')}`}>
        <Icon name={ch.kind === 'a' ? 'in' : 'out'} />{tx.prevue}
      </button>
      {refusPrevue && <p class="err">{refusPrevue}</p>}
      <button class="btn btn-secondary btn-lg btn-block" onClick={() => choisir(nowHHMM(), 'maintenant')} aria-label={`${quoi} : ${tx.maintenant}`}>
        {tx.maintenant}
      </button>
      <button class="btn btn-outline btn-block" onClick={onAutre} aria-haspopup="dialog" aria-label={`${quoi} : ${tx.autre}`}>
        <Icon name="clock" />{tx.autre}
      </button>
      {err && <p class="err" role="alert">{err}</p>}
    </div>
  );
}

/** T-048 : la seule heure à choisir, réglée d'avance sur l'heure prévue. Rien n'est enregistré avant « Enregistrer ». */
function AutreHeureSheet({ ch, child, arrivee, pointer, onClose }: { ch: ChoixPointage; child: string; arrivee?: string; pointer: Pointer; onClose: () => void }) {
  const arr = ch.kind === 'a';
  const [heure, setHeure] = useState(ch.prevue);
  const [err, setErr] = useState('');
  useErreurAffichee('depart_avant_arrivee', err === MSG_DEPART_AVANT_ARRIVEE);
  useErreurAffichee('saisie', !!err && err !== MSG_DEPART_AVANT_ARRIVEE);
  function save() {
    // Rien n'est écrit avant ce geste ; fermer la fiche n'écrit rien.
    const e = enregistrerChoix(ch, heure, 'autre', nowHHMM(), arrivee, pointer);
    if (e) setErr(e); else onClose();
  }
  return (
    <Sheet title={`${arr ? 'Arrivée' : 'Départ'} ${de(child)}`} onClose={onClose}>
      <p class="muted">{textesChoix(ch).titre}</p>
      <div class="field">
        <label for="autre-heure">Heure {arr ? 'd’arrivée' : 'de départ'}</label>
        <input id="autre-heure" class="input num" type="time" value={heure} max={nowHHMM()} min={!arr && arrivee ? arrivee : undefined}
          onInput={(e) => { setHeure((e.target as HTMLInputElement).value); setErr(''); }} />
      </div>
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn btn-primary btn-block btn-lg" onClick={save}>Enregistrer</button>
    </Sheet>
  );
}

const CHILD_ABS_OPTIONS: { v: ChildAbs | 'none'; l: string; sub?: string }[] = [
  { v: 'none', l: 'Présent', sub: 'Accueilli normalement' },
  { v: 'malade_certif', l: CHILD_ABS_LABEL.malade_certif, sub: 'Retenu dans la limite de 5 jours par an, plus une absence de 14 jours d’affilée' },
  { v: 'malade', l: CHILD_ABS_LABEL.malade, sub: 'Payé' },
  { v: 'parents', l: CHILD_ABS_LABEL.parents, sub: 'Payé' },
];
// T-035b : l'absence « sans solde » de l'enfant n'est plus proposée (CCN art. 105 : absence non prévue = payée). Elle reste
// affichée seulement sur un jour déjà noté ainsi, pour pouvoir le corriger.
const OPTION_SANS_SOLDE_ENFANT = { v: 'sans_solde_enfant' as const, l: CHILD_ABS_LABEL.sans_solde_enfant, sub: 'Payé : la convention ne permet pas de le retenir (article 105)' };

export function DaySheet({ c, day, onClose }: { c: Contract; day: string; onClose: () => void }) {
  const di = dayInfo(ctxFor(c), day);
  const rec = di.rec;
  const slots = Math.max(di.planned.length, rec?.pres?.length ?? 0, 1);
  const init: Presence[] = Array.from({ length: slots }, (_, i) => ({
    a: rec?.pres?.[i]?.a ?? di.planned[i]?.start ?? '',
    d: rec?.pres?.[i]?.d ?? di.planned[i]?.end ?? '',
  }));
  const [pres, setPres] = useState<Presence[]>(init);
  const [abs, setAbs] = useState<ChildAbs | 'none'>(rec?.abs ?? 'none');
  const [repas, setRepas] = useState<number>(rec?.repas ?? c.repasParJour);
  const [km, setKm] = useState<number>(rec?.km ?? 0);
  const [kmEnfants, setKmEnfants] = useState<number>(rec?.kmEnfants ?? 0);
  // T-025 C-2 : saisie d'avant (champ absent) avec un seul enfant dans la voiture = une seule famille demandeuse.
  const [kmPartage, setKmPartage] = useState<boolean>(rec?.kmPartage ?? (rec?.kmEnfants !== undefined && rec.kmEnfants > 1));
  const [ferieT, setFerieT] = useState<boolean>(!!rec?.ferieTravaille);
  const [err, setErr] = useState('');
  const future = day > today();
  useErreurAffichee('depart_avant_arrivee', !!err);

  async function save() {
    for (const p of pres) {
      if (p.a && p.d && p.d <= p.a) { setErr('L’heure de départ doit être après l’arrivée.'); return; }
    }
    const samePlan = pres.every((p, i) => di.planned[i] && p.a === di.planned[i].start && p.d === di.planned[i].end) && pres.length === di.planned.length;
    const undo = await updateDay(c.id, day, (r) => {
      const next: DayRec = { ...r };
      if (abs !== 'none') { next.abs = abs; delete next.pres; }
      else {
        delete next.abs;
        if (samePlan || future) delete next.pres;
        else next.pres = pres.filter((p) => p.a).map((p) => ({ a: p.a, d: p.d || undefined }));
        if (!di.planned.length && next.pres?.length) next.extra = true;
      }
      if (repas !== c.repasParJour) next.repas = repas; else delete next.repas;
      if (km) next.km = km; else delete next.km;
      if (km) next.kmPartage = kmPartage; else delete next.kmPartage;
      if (km && kmPartage && kmEnfants >= 1) next.kmEnfants = kmEnfants; else delete next.kmEnfants;
      if (ferieT) next.ferieTravaille = true; else delete next.ferieTravaille;
      return next;
    });
    logUsage('journee_modifiee', 'aujourdhui');
    // C-101 : heure déjà pointée puis changée (le jour même ou après coup). Ni l'heure ni l'écart ne partent.
    // Heures effectives, plage par plage (sans filtrer, pour garder les index) : celles du formulaire, qui valent
    // le planning quand rien n'a changé (relecture contradictoire : faux « heure corrigée » quand samePlan).
    const apres = abs !== 'none' ? [] : pres;
    // T-048 : le jour même, heure_corrigee part avec heure_corrigee_arrivee et/ou heure_corrigee_depart.
    for (const ev of evCorrections(day, today(), rec?.pres, apres)) logUsage(ev, 'aujourdhui');
    onClose();
    toast(`Journée ${de(c.child)} enregistrée`, undo);
  }

  return (
    <Sheet title={`${c.child}, ${dayLabel(day)}`} onClose={onClose}>
      <p class="muted">{planText(di)}</p>
      {di.ferie && <Switch label={`Jour férié (${di.ferie}) travaillé`} hint={day.endsWith('05-01') ? '1er mai : payé double' : 'Majoré de 10 %'} checked={ferieT} onChange={setFerieT} />}
      <Choices label="Ce jour-là" value={abs} options={rec?.abs === 'sans_solde_enfant' ? [...CHILD_ABS_OPTIONS, OPTION_SANS_SOLDE_ENFANT] : CHILD_ABS_OPTIONS} onChange={setAbs} />
      {abs === 'none' && !future && (
        <fieldset>
          <legend>Heures réelles</legend>
          {pres.map((p, i) => (
            <div class="grid2">
              <div class="field">
                <label for={`a${i}`}>Arrivée{pres.length > 1 ? ` (${i + 1})` : ''}</label>
                <input id={`a${i}`} class="input num" type="time" value={p.a} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setPres(pres.map((x, j) => (j === i ? { ...x, a: v } : x))); setErr(''); }} />
              </div>
              <div class="field">
                <label for={`d${i}`}>Départ{pres.length > 1 ? ` (${i + 1})` : ''}</label>
                <input id={`d${i}`} class="input num" type="time" value={p.d} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setPres(pres.map((x, j) => (j === i ? { ...x, d: v } : x))); setErr(''); }} />
              </div>
            </div>
          ))}
          {err && <p class="err" role="alert">{err}</p>}
          {pres.length < 2 && <button class="btn btn-ghost" onClick={() => setPres([...pres, { a: '', d: '' }])}><Icon name="plus" />Ajouter une plage</button>}
          {di.planned.length > 0 && (
            <button class="btn btn-ghost" onClick={() => setPres(di.planned.map((p) => ({ a: p.start, d: p.end })))}><Icon name="undo" />Revenir au planning</button>
          )}
        </fieldset>
      )}
      {abs === 'none' && !future && (
        <>
          {c.repasPrix > 0 && <Stepper label="Repas fournis" value={repas} onChange={setRepas} max={4} />}
          {c.kmTaux > 0 && <Stepper label="Kilomètres" value={km} onChange={setKm} max={500} unit="km" />}
          {c.kmTaux > 0 && km > 0 && <Switch label="Une autre famille a aussi demandé ce trajet" hint="Non : ces km sont dus en entier par cette famille (article 113)." checked={kmPartage} onChange={setKmPartage} />}
          {c.kmTaux > 0 && km > 0 && kmPartage && <Stepper label="Enfants dans la voiture" value={kmEnfants} onChange={setKmEnfants} max={8} />}
          {c.kmTaux > 0 && km > 0 && kmPartage && <p class="hint">Compte tous les enfants dans la voiture, les tiens compris si le trajet est aussi pour eux. Chaque famille paie sa part, au prorata des enfants (article 113). À moins de 2, les km restent à confirmer.</p>}
        </>
      )}
      <button class="btn btn-primary btn-block btn-lg" onClick={save}>Enregistrer</button>
    </Sheet>
  );
}

const AM_OPTIONS: { v: AmAbs; l: string; sub: string }[] = [
  { v: 'cp', l: AM_ABS_LABEL.cp, sub: 'Décomptés de ton compteur de congés' },
  { v: 'am_malade', l: AM_ABS_LABEL.am_malade, sub: 'Non payé par les parents (indemnités de la Sécurité sociale)' },
  { v: 'am_enfant_malade', l: AM_ABS_LABEL.am_enfant_malade, sub: 'Non payé (3 jours par an, 5 dans certains cas)' },
  { v: 'evenement', l: AM_ABS_LABEL.evenement, sub: 'Mariage, naissance, décès… : payé sur justificatif, selon la durée prévue' },
  { v: 'sans_solde', l: AM_ABS_LABEL.sans_solde, sub: 'Non payé, avec l’accord des parents' },
  // T-031 : absences que l'app ne calcule pas. Les saisir bloque les mois concernés au lieu de les payer comme travaillés.
  ...AM_ABS_NON_GEREES.map((v) => ({ v, l: AM_ABS_LABEL[v], sub: 'Non géré par l’app : les mois concernés sont bloqués' })),
];

export function AmAbsenceSheet({ start, onClose }: { start: string; onClose: () => void }) {
  const [type, setType] = useState<AmAbs>('cp');
  const [nature, setNature] = useState<NatureEvenement | undefined>(undefined);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(start);
  const err = to < from ? 'La date de fin doit être après le début.' : '';
  useErreurAffichee('dates_absence', !!err);
  return (
    <Sheet title="Je serai absente" onClose={onClose}>
      <p class="muted">Pour tous les enfants. Les parents ne te paient pas les jours non payés : l’app fait la retenue toute seule.</p>
      <Choices label="Raison" value={type} options={AM_OPTIONS} onChange={setType} />
      {type === 'evenement' && (
        <Choices label="Quel événement ?" value={nature} onChange={setNature}
          options={(Object.keys(NATURE_EVENEMENT_LABEL) as NatureEvenement[]).map((v) => ({ v, l: NATURE_EVENEMENT_LABEL[v], sub: libelleDureeSaisie(v, from) }))} />
      )}
      {type === 'evenement' && <p class="hint">Déplacement de plus de 600 km aller-retour : le jour en plus est non rémunéré, saisis-le en congé sans solde.</p>}
      {(AM_ABS_NON_GEREES as AmAbs[]).includes(type) ? <Banner tone="warn">{ABSENCE_NON_GEREE_CHOISIE}</Banner> : <p class="hint">{ABSENCES_NON_GEREES}</p>}
      <div class="grid2">
        <DateInput label="Du" value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} />
        <DateInput label="Au (inclus)" value={to} min={from} onChange={setTo} />
      </div>
      {type === 'cp' && <p class="hint">Mets ton dernier jour de congé. L’app compte les jours du lundi au samedi jusqu’à la veille de ta reprise : le samedi avant un retour le lundi compte aussi.</p>}
      {err && <p class="err" role="alert">{err}</p>}
      <button
        class="btn btn-primary btn-block btn-lg"
        disabled={!!err || !from || !to || (type === 'evenement' && !nature)}
        onClick={async () => {
          const undo = await putLeave(type === 'evenement' ? { id: uid(), type, from, to, nature } : { id: uid(), type, from, to });
          logUsage('absence_am', 'aujourdhui');
          onClose();
          toast(`${AM_ABS_LABEL[type]} enregistré${type === 'cp' ? 's' : ''}`, undo);
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}

export { state };
