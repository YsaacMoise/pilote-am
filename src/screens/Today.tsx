import { ABSENCES_PROTEGEES_AIDE, ABSENCES_PROTEGEES_DONNEES } from '../legal';
import { useEffect, useState } from 'preact/hooks';
import { activeContracts, ctxFor, deleteLeave, logUsage, putLeave, state, toast, uid, updateDay, useStore } from '../store';
import { addDays, dayLabel, minutes, mondayOf, nowHHMM, today, weekday, JOUR_NOMS, MOIS_NOMS, daysBetween } from '../engine/dates';
import { dayInfo, libelleFerie, type Ctx, type DayInfo } from '../engine/payroll';
import { alertesDurees, AMPLITUDE_MAX_MIN, messageAmplitude } from '../engine/durees';
import { AM_ABS_LABEL, CHILD_ABS_LABEL, NATURE_ATMP_LABEL, type NatureAtMp, type ChildAbs, type Contract, type DayRec, type NatureEvenement, type Plage, type Presence, type AmLeave } from '../engine/model';
import { regionDe } from '../engine/regions';
import { estSuspension } from '../engine/suspensions';
import { libelleDureeSaisie, NATURE_EVENEMENT_LABEL } from '../engine/evenements';
import { absenceSaisie, appliquerReponses, questionsSuite, questionsVisibles, reponsesCompletes, texteQuestionSuite, type ChoixAbsence, type Reponse } from '../engine/absences';
import { hoursLabel } from '../engine/money';
import { Banner, CHILD_COLORS, CHILD_INKS, Choices, DateInput, EuroInput, Gommette, Sheet, Stepper, Switch, Topbar, useErreurAffichee } from '../ui/kit';
import { evAnnulation, evCorrections, evPointage, type GestePointage } from '../usage-events';
import { AideVideo, BienvenueDemo } from '../ui/VideoGuide';
import { isDemo } from '../db';
import { Icon } from '../ui/icons';
import { bornesBande, decaler, finParDefaut, finPourJour, joursBande, libelleBande, peutAvancer, peutReculer } from '../ui/bandeJours';
import { de } from '../engine/texte';
// T-122 : contrats en cours de saisie et accès à la fiche de l'enfant.
import { BrouillonsEnCours } from './Fiche';
import { hasCloudAccount, useCloud } from '../cloud-state';
import { aUnFilet, copieAJour, rappelDuJour } from '../rappels';
import { BoutonCleAcces } from '../ui/CleAcces';

const fmtH = (t: string) => t.replace(/^0(\d)/, '$1').replace(':', ' h ');

function planText(di: DayInfo): string {
  if (!di.planned.length) return 'Pas d’accueil prévu';
  return 'Prévu ' + di.planned.map((p) => `${fmtH(p.start)} – ${fmtH(p.end)}`).join(' et ');
}

/** Ligne « Prévu » : les horaires reliés par une flèche (Vision 1.1 : « Prévu 8 h 30 → 17 h »). */
function PlanLine({ di }: { di: DayInfo }) {
  if (!di.planned.length) return <>Pas d’accueil prévu</>;
  return (
    <>
      <span class="sr-only">{planText(di)}</span>
      <span aria-hidden="true">Prévu {di.planned.map((p, i) => <>{i > 0 && ' et '}<span class="hours">{heureLisible(p.start)} → {heureLisible(p.end)}</span></>)}</span>
    </>
  );
}

export function Today() {
  const s = useStore();
  const t = today();
  const [day, setJour] = useState(t);
  // T-115 (R1) : la bande de sept jours se déplace d'une semaine à l'autre (dernier jour montré).
  const [finBande, setFinBande] = useState(finParDefaut(t));
  const setDay = (d: string) => { setJour(d); setFinBande((f) => finPourJour(d, f, t)); };
  const [edit, setEdit] = useState<Contract | null>(null);
  const [amSheet, setAmSheet] = useState(false);
  // T-048 (question sur le matin) : plages auxquelles l'AM a répondu « Non », par contrat et par jour.
  // Mémoire de l'écran seulement, jamais dans les données : après un rechargement, la question revient.
  const [sautes, setSautes] = useState<Record<string, number[]>>({});
  const sautesDe = (c: Contract) => sautes[c.id + '|' + day] ?? [];
  const nonPour = (c: Contract) => (idx: number) => setSautes((x) => {
    const k = c.id + '|' + day;
    return { ...x, [k]: [...(x[k] ?? []), idx] };
  });
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
  const bornes = bornesBande(s.contracts.map((c) => c.start), t);
  const days = joursBande(finBande);
  const semaine = (sens: 1 | -1) => {
    const x = decaler(finBande, day, sens, bornes);
    if (!x) return;
    setFinBande(x.fin); setJour(x.jour);
  };
  const retourAujourdhui = () => { setJour(t); setFinBande(finParDefaut(t)); };

  // Départs oubliés sur les 14 derniers jours
  const forgotten: { c: Contract; d: string }[] = [];
  for (const c of activeContracts()) {
    // T-109 (correction 20) : aujourd'hui aussi, une fois la fin prévue passée.
    const dt = dayInfo(ctxFor(c), t);
    if (departOublieAujourdhui(dt.planned, dt.rec?.pres, nowHHMM())) forgotten.push({ c, d: t });
    for (let i = 1; i <= 14; i++) {
      const d = addDays(t, -i);
      if (dayInfo(ctxFor(c), d).departOublie) forgotten.push({ c, d });
    }
  }
  const lastBackup = s.settings.lastBackup;
  // T-121 : avec un compte et une copie à jour, plus de rappel chaque semaine (src/rappels.ts).
  const cl = useCloud();
  const compte = !isDemo() && hasCloudAccount() && !!cl.email;
  const rappel = rappelDuJour({
    contrats: s.contracts.length, maintenant: Date.now(), derniereSauvegarde: lastBackup,
    compte, copieAJour: copieAJour(cl), cleOk: !!cl.cleOk, cleManquante: !!cl.cleManquante,
    filet: aUnFilet({ paquets: cl.paquets, cleGardee: s.settings.cleGardee, filets: s.settings.filets }),
  });
  const amToday = s.leaves.find((l) => day >= l.from && day <= l.to);

  // Vision 1.1 (T-126, 9.4) : carte « Maintenant », cadran, puis une ligne par autre enfant. Réglage « Liste » : lignes seules.
  const compact = !!s.settings.compact && kids.length > 1;
  const now = nowHHMM();
  const iNow = !compact && day === t ? indexMaintenant(kids.map((c) => heureAction(c, day, sautesDe(c))), minutes(now)) : -1;
  const titre = dayLabel(day).replace(/^./, (x) => x.toUpperCase());
  const ecart = day === t ? undefined : day < t ? `il y a ${daysBetween(day, t)} jour${daysBetween(day, t) > 1 ? 's' : ''}` : `dans ${daysBetween(t, day)} jour${daysBetween(t, day) > 1 ? 's' : ''}`;

  return (
    <>
      <Topbar grand title={titre} sub={ecart} screen="aujourdhui" apres={s.contracts.length > 0 && (
        <button class="icon-btn absente-btn" aria-label="Je serai absente" onClick={() => setAmSheet(true)}><Icon name="absente" fin /></button>
      )} />
      <main class="today">
        {isDemo() && <BienvenueDemo />}
        <div class="semaine">
          <nav aria-label="Choisir le jour" class="daystrip">
            {days.map((d) => {
              const flag = s.contracts.some((c) => dayInfo(ctxFor(c), d).departOublie);
              return (
                <button aria-pressed={d === day} onClick={() => setDay(d)}>
                  <span class="d-name">{d === t ? 'auj.' : JOUR_NOMS[weekday(d) - 1].slice(0, 3) + '.'}</span>{' '}
                  <span class="d-num">{Number(d.slice(8))}</span>
                  <span class="sr-only"> {MOIS_NOMS[Number(d.slice(5, 7)) - 1]}{flag ? ', départ non pointé' : ''}</span>
                  <span class={`d-dot ${flag ? 'on' : ''}`} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
          {/* Flèches de semaine sous la bande : chaque jour garde 44 px de large au moins (consigne 3). */}
          <div class="daynav">
            <button class="daynav-arrow" aria-label="Semaine précédente" disabled={!peutReculer(finBande, bornes)} onClick={() => semaine(-1)}><Icon name="left" size={20} /></button>
            <p class="daynav-range"><span aria-live="polite">{libelleBande(days)}</span>
              {(day !== t || !days.includes(t)) && (
                <button class="btn btn-ghost btn-sm" onClick={retourAujourdhui}><Icon name="undo" size={18} />Revenir à aujourd’hui</button>
              )}
            </p>
            <button class="daynav-arrow" aria-label="Semaine suivante" disabled={!peutAvancer(finBande, bornes)} onClick={() => semaine(1)}><Icon name="right" size={20} /></button>
          </div>
        </div>

        {amToday && (
          <Banner tone="info" icon="sun">
            <strong>{AM_ABS_LABEL[amToday.type]}</strong>
            <span>Du {dayLabel(amToday.from)} au {dayLabel(amToday.to)}, pour tous les enfants.</span>
          </Banner>
        )}
        {/* T-109 (correction 11) : repos de 11 h, 48 h en moyenne, 2 250 h par an (CASF L423-21, L423-22) : alerte, sans blocage. */}
        {alertesDurees(s.contracts.map((c) => ctxFor(c)), day).map((x) => <Banner tone="warn">{x}</Banner>)}
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
        {kids.length === 0 && s.contracts.length > 0 && (
          <Banner tone="info" icon="calendar">
            <strong>Aucun contrat ce jour-là</strong>
            <span>Le planning du contrat remplit les journées tout seul. Tu n’auras qu’à noter ce qui change.</span>
          </Banner>
        )}
        {kids.length === 0 && !s.contracts.length && (
          <div class="card empty">
            <h2>Ajoute le premier enfant que tu accueilles</h2>
            <p class="muted">Le planning du contrat remplit les journées tout seul. Tu n’auras qu’à noter ce qui change.</p>
            <a class="btn btn-primary btn-lg" href="#/contrat/nouveau"><Icon name="plus" />Ajouter un enfant accueilli</a>
          </div>
        )}

        {compact ? (
          <div class="kid-list">
            {kids.map((c) => <KidCard key={c.id} c={c} day={day} sautees={sautesDe(c)} onNon={nonPour(c)} compact onEdit={() => setEdit(c)} />)}
          </div>
        ) : (
          <>
            {iNow >= 0 && <KidCard key={kids[iNow].id} c={kids[iNow]} day={day} sautees={sautesDe(kids[iNow])} onNon={nonPour(kids[iNow])} onEdit={() => setEdit(kids[iNow])} />}
            {kids.length > 0 && kids.length <= 4 && <Cadran kids={kids} day={day} />}
            {kids.some((_, i) => i !== iNow) && (
              <div class="kid-lines">
                {kids.map((c, i) => i === iNow ? null : <KidCard key={c.id} c={c} day={day} sautees={sautesDe(c)} onNon={nonPour(c)} ligne onEdit={() => setEdit(c)} />)}
              </div>
            )}
          </>
        )}

        {day === t && <BrouillonsEnCours />}
        <AideVideo id="pointer" />
        {day === t && cl.ouverture && (
          <Banner tone="warn" icon="shield">
            <strong>Demande de récupération par Arvela en cours</strong>
            <div class="btn-row"><a class="btn btn-outline" href="#/compte">Voir</a></div>
          </Banner>
        )}
        {day === t && rappel === 'cle' && (
          <Banner tone="info" icon="shield">
            <strong>Protège ta clé de secours</strong>
            <div class="btn-row">
              <BoutonCleAcces mode="proteger" />
              <a class="btn btn-outline" href="#/compte">Autres moyens</a>
            </div>
          </Banner>
        )}
        {day === t && rappel === 'cle-manquante' && (
          <Banner tone="warn" icon="shield">
            <strong>Entre ta clé de secours</strong>
            <div class="btn-row"><BoutonCleAcces mode="ouvrir" /><a class="btn btn-primary" href="#/compte">Entrer ma clé</a><a class="btn btn-ghost" href="#/sauvegarde">Sauvegarder</a></div>
          </Banner>
        )}
        {day === t && rappel === 'sauvegarde' && (
          <Banner tone="info" icon="shield">
            <strong>Pense à ta sauvegarde de la semaine</strong>
            <span>Une copie dans Fichiers protège tes données si le téléphone est perdu.</span>
            <div class="btn-row"><a class="btn btn-outline" href="#/sauvegarde">Sauvegarder</a></div>
          </Banner>
        )}
      </main>
      {edit && <DaySheet c={edit} day={day} onClose={() => setEdit(null)} />}
      {amSheet && <AmAbsenceSheet start={day} onClose={() => setAmSheet(false)} />}
    </>
  );
}

// ---------- Vision 1.1 (T-126) : carte « Maintenant » et cadran de la journée ----------

/** Heure prévue (minutes) de la prochaine action de l'enfant ce jour-là, ou null (pas d'action, ou action sans heure prévue). */
function heureAction(c: Contract, day: string, sautees: readonly number[]): number | null {
  const di = dayInfo(ctxFor(c), day);
  if (!(di.kind === 'prevu' || di.kind === 'present' || (di.kind === 'hors' && !di.planned.length))) return null;
  const na = nextAction(di, di.rec, sautees);
  const p = na ? di.planned[na.idx] : undefined;
  if (!na || !p) return null;
  return minutes(na.kind === 'a' ? p.start : p.end);
}

/**
 * Consigne T-126, 9.4 : l'enfant de la carte « Maintenant » est celui dont la prochaine action a l'heure prévue la plus proche
 * de maintenant (avant ou après). À égalité, l'ordre des contrats. Rend l'index, ou -1 si aucun enfant n'a d'action prévue.
 */
export function indexMaintenant(heures: readonly (number | null)[], maintenant: number): number {
  let best = -1;
  for (let i = 0; i < heures.length; i++) {
    const h = heures[i];
    if (h === null) continue;
    if (best < 0 || Math.abs(h - maintenant) < Math.abs(heures[best]! - maintenant)) best = i;
  }
  return best;
}

/**
 * Bornes du cadran (minutes) : heure la plus tôt arrondie à l'heure en dessous, la plus tardive à l'heure au-dessus
 * (heures prévues et pointées). null sans aucune heure.
 */
export function bornesCadran(heures: readonly number[]): { debut: number; fin: number } | null {
  if (!heures.length) return null;
  const debut = Math.floor(Math.min(...heures) / 60) * 60;
  const fin = Math.max(debut + 60, Math.ceil(Math.max(...heures) / 60) * 60);
  return { debut, fin };
}

const CX = 170, CY = 178;
const RAYONS = [146, 126, 106, 86];

/**
 * Demi-cadran de la journée : un anneau par enfant (plein = présence pointée, clair = prévu, pointillé = absent ce jour-là),
 * aiguille or = maintenant. Bornes de la présence : la pastille de l'enfant marque l'arrivée, une perle claire marque le départ.
 */
function Cadran({ kids, day }: { kids: Contract[]; day: string }) {
  const t = today();
  const auj = day === t;
  const now = minutes(nowHHMM());
  const anneaux = kids.map((c) => {
    const di = dayInfo(ctxFor(c), day);
    const absent = di.kind === 'absent' || di.kind === 'am';
    const prevu: [number, number][] = absent ? [] : di.planned.map((p) => [minutes(p.start), minutes(p.end)]);
    // Absent ce jour-là (enfant ou AM) : les heures prévues restent visibles, en pointillé.
    const absents: [number, number][] = absent ? di.planned.map((p) => [minutes(p.start), minutes(p.end)]) : [];
    const faits: [number, number][] = [];
    const bornes: number[] = [];
    (di.rec?.pres ?? []).forEach((p, i) => {
      if (!p.a) return;
      const a = minutes(p.a);
      // Présence en cours : jusqu'à maintenant le jour même ; un autre jour, jusqu'à la fin prévue (heure retenue).
      const d = p.d ? minutes(p.d) : auj ? now : di.planned[i] ? minutes(di.planned[i].end) : a;
      if (d > a) faits.push([a, d]);
      // Bornes : arrivée d'une deuxième plage, et départ pointé (la pastille marque la première arrivée).
      if (faits.length > 1) bornes.push(a);
      if (p.d) bornes.push(d);
    });
    const textes: string[] = [];
    if (absent && di.rec?.abs) textes.push(CHILD_ABS_LABEL[di.rec.abs]);
    else if (absent && di.amLeave) textes.push(AM_ABS_LABEL[di.amLeave]);
    else textes.push(planText(di));
    (di.rec?.pres ?? []).forEach((p) => { if (p.a) textes.push(`arrivée ${fmtH(p.a)}${p.d ? `, départ ${fmtH(p.d)}` : ''}`); });
    return { c, prevu, absents, faits, bornes, texte: `${c.child} : ${textes.join(', ')}` };
  });
  // Début et fin du cadran : les heures possibles des contrats sur la semaine (même cadran d'un jour à l'autre), élargies si
  // une présence pointée en sort.
  const lundi = mondayOf(day);
  const semaine = kids.flatMap((c) => Array.from({ length: 7 }, (_, k) => dayInfo(ctxFor(c), addDays(lundi, k)).planned).flat().flatMap((p) => [minutes(p.start), minutes(p.end)]));
  const duJour = anneaux.flatMap((x) => [...x.prevu, ...x.absents, ...x.faits].flat());
  // Jour sans accueil prévu ni présence (week-end) : pas de cadran, comme avant.
  if (!duJour.length) return null;
  const toutes = [...semaine, ...duJour];
  const b = bornesCadran(toutes);
  if (!b) return null;
  const frac = (m: number) => Math.min(1, Math.max(0, (m - b.debut) / (b.fin - b.debut)));
  const point = (r: number, m: number) => {
    const a = Math.PI * (1 - frac(m));
    return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
  };
  const demi = (r: number) => `M${CX - r} ${CY} A${r} ${r} 0 0 1 ${CX + r} ${CY}`;
  // Un arc = le demi-cercle en pointillé d'un seul trait : il glisse en douceur d'une minute à l'autre.
  const arc = (r: number, [m1, m2]: [number, number], cls: string, g: string, k: string) => {
    const L = Math.PI * r;
    const a = frac(m1) * L, l = (frac(m2) - frac(m1)) * L;
    if (l <= 0.5) return null;
    return <path key={k} d={demi(r)} class={cls} style={{ '--g': g, strokeDasharray: `${l} ${2 * L}`, strokeDashoffset: -a } as any} />;
  };
  // Portion d'anneau tracée seule (pour le pointillé des heures d'absence).
  const portion = (r: number, [m1, m2]: [number, number], g: string, k: string) => {
    if (frac(m2) - frac(m1) <= 0.005) return null;
    const [x1, y1] = point(r, m1), [x2, y2] = point(r, m2);
    return <path key={k} d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} class="cad-absent" style={{ '--g': g } as any} />;
  };
  const heureTxt = heureLisible(nowHHMM());
  const ticks: number[] = [];
  for (let m = b.debut + 60; m < b.fin; m += 60) ticks.push(m);
  const etiquettes = ticks.filter((m) => (m - b.debut) % 120 === 0 && frac(m) > 0.19 && frac(m) < 0.81);
  const aiguille = auj && now >= b.debut && now <= b.fin;
  const label = `Cadran de la journée, de ${heureLisible(String(b.debut / 60).padStart(2, '0') + ':00')} à ${heureLisible(String(b.fin / 60).padStart(2, '0') + ':00')}. ${anneaux.map((x) => x.texte).join('. ')}.${auj ? ` Il est ${heureTxt}.` : ''}`;
  return (
    <div class="cadran">
      <svg viewBox="0 -18 340 222" role="img" aria-label={label}>
        <g fill="none" stroke-linecap="round" stroke-width="13">
          {anneaux.map((_, i) => <path d={demi(RAYONS[i])} class="cad-piste" />)}
          {anneaux.map((x, i) => x.prevu.map((p, j) => arc(RAYONS[i], p, 'cad-prevu', CHILD_COLORS[x.c.color % CHILD_COLORS.length], `p${i}-${j}`)))}
          {anneaux.map((x, i) => x.faits.map((p, j) => arc(RAYONS[i], p, 'cad-fait', CHILD_COLORS[x.c.color % CHILD_COLORS.length], `f${i}-${j}`)))}
          {anneaux.map((x, i) => x.absents.map((p, j) => portion(RAYONS[i], p, CHILD_COLORS[x.c.color % CHILD_COLORS.length], `a${i}-${j}`)))}
        </g>
        <g class="cad-bornes">
          {anneaux.map((x, i) => x.bornes.map((m) => { const [bx, by] = point(RAYONS[i], m); return <circle cx={bx} cy={by} r="4.5" style={{ '--g': CHILD_COLORS[x.c.color % CHILD_COLORS.length] } as any} />; }))}
        </g>
        <g class="cad-reperes" stroke-width="1.5" stroke-linecap="round">
          {ticks.map((m) => { const [x1, y1] = point(160, m); const [x2, y2] = point(168, m); return <line x1={x1} y1={y1} x2={x2} y2={y2} />; })}
        </g>
        <g class="cad-heures" text-anchor="middle">
          <text x={CX - 146} y="200">{b.debut / 60} h</text>
          {etiquettes.map((m) => { const [x, y] = point(184, m); return <text x={x} y={y + 4}>{m / 60}</text>; })}
          <text x={CX + 146} y="200">{b.fin / 60} h</text>
        </g>
        {aiguille && (
          <g class="cad-aiguille" style={{ transform: `rotate(${frac(now) * 180}deg)` }}>
            <line x1={CX} y1={CY} x2={CX - 158} y2={CY} stroke-width="2.5" stroke-linecap="round" />
          </g>
        )}
        {aiguille && <circle cx={CX} cy={CY} r="6" class="cad-centre" />}
        {auj && <text x={CX} y="150" text-anchor="middle" class="cad-maintenant">{heureTxt}</text>}
        <g class="cad-initiales" text-anchor="middle">
          {anneaux.map((x, i) => {
            // Pastille : à l'arrivée une fois l'enfant arrivé (borne de début), sinon au début prévu.
            const debuts = (x.faits.length ? x.faits : [...x.prevu, ...x.absents]).map((p) => p[0]);
            if (!debuts.length) return null;
            const [px, py] = point(RAYONS[i], Math.min(...debuts));
            const k = x.c.color % CHILD_COLORS.length;
            return (
              <>
                <circle cx={px} cy={py} r="10" fill={CHILD_COLORS[k]} class="cad-pastille" />
                <text x={px} y={py + 4} fill={CHILD_INKS[k]}>{(x.c.child.trim()[0] ?? '?').toUpperCase()}</text>
              </>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ---------- T-048 : heure vraie quand l'appui arrive loin de l'heure prévue ----------
// Seuils stricts, en minutes : au-delà, l'app demande quelle heure est vraie au lieu de noter l'heure de l'appui.
/** Arrivée : plus de 30 minutes après le début prévu (seuil fixé par le DG). */
export const SEUIL_ARRIVEE_MIN = 30;
/** Départ : plus de 15 minutes après la fin prévue (chaque minute après la fin prévue est payée en plus). */
export const SEUIL_DEPART_MIN = 15;
/**
 * T-118 (D-18) : arrivée plus de 60 minutes AVANT le début prévu (un appui à 3 h 19 pour un accueil à 7 h 30) : l'app demande
 * aussi quelle heure est vraie, au lieu de noter l'heure de l'appui sans question.
 */
export const SEUIL_AVANCE_MIN = 60;

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
  const tropTot = na.kind === 'a' && -ecartMin > SEUIL_AVANCE_MIN;
  if (ecartMin <= seuil && !tropTot) return null;
  return { kind: na.kind, idx: na.idx, prevue, maintenant, ecartMin };
}

/** Textes de la carte et de la fiche : ligne d'en-tête et libellés des trois boutons. */
export function textesChoix(ch: ChoixPointage): { titre: string; prevue: string; maintenant: string; autre: string } {
  const arr = ch.kind === 'a';
  return {
    titre: `${arr ? 'Arrivée' : 'Départ'} prévu${arr ? 'e' : ''} à ${heureLisible(ch.prevue)}${ch.ecartMin < 0 ? `, dans ${hoursLabel(-ch.ecartMin)}` : ''}`,
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

/**
 * Plage à pointer. Une plage sans arrivée est sautée quand une plage plus loin a déjà une arrivée, ou quand l'AM a
 * répondu « Non » à la question sur cette plage (`sautees`, mémoire de l'écran).
 */
export function nextAction(di: Pick<DayInfo, 'planned'>, rec: DayRec | undefined, sautees: readonly number[] = []): { idx: number; kind: 'a' | 'd' } | null {
  const pres = rec?.pres ?? [];
  const n = Math.max(di.planned.length, 1);
  for (let i = 0; i < n; i++) {
    const p = pres[i];
    if (!p?.a) {
      if (sautees.includes(i) || pres.slice(i + 1).some((x) => !!x?.a)) continue;
      return { idx: i, kind: 'a' };
    }
    if (!p.d) return { idx: i, kind: 'd' };
  }
  return null;
}

/** Question sur une plage passée sans pointage : « Plage de 7 h 30 à 8 h 30 : accueil comme prévu ? » */
export interface QuestionPlage { idx: number; debut: string; fin: string }

/**
 * Décision du DG du 21/11/2026 : la plage à pointer n'a pas d'arrivée, sa fin prévue est passée et une plage prévue
 * la suit : la carte demande d'abord si l'accueil a eu lieu comme prévu, au lieu des choix d'arrivée.
 */
export function questionPlage(planned: Plage[], na: { idx: number; kind: 'a' | 'd' } | null, pres: Presence[] | undefined, maintenant: string): QuestionPlage | null {
  if (!na || na.kind !== 'a') return null;
  const plage = planned[na.idx];
  if (!plage || !planned[na.idx + 1] || pres?.[na.idx]?.a) return null;
  if (minutes(maintenant) <= minutes(plage.end)) return null;
  return { idx: na.idx, debut: plage.start, fin: plage.end };
}

export function texteQuestion(q: QuestionPlage): string {
  return `Plage de ${heureLisible(q.debut)} à ${heureLisible(q.fin)} : accueil comme prévu ?`;
}

/** La question relue à l'appui est la même que celle affichée : sinon rien n'est enregistré et l'écran se réaffiche. */
export function memeQuestion(a: QuestionPlage | null, b: QuestionPlage | null): boolean {
  return !!a && !!b && a.idx === b.idx && a.debut === b.debut && a.fin === b.fin;
}

/** « Oui » : la plage est enregistrée aux heures prévues (même index, même champ extra que le pointage). */
export function pointerPlagePrevue(r: DayRec, idx: number, plage: Plage, avecPlanning: boolean): DayRec {
  const p: Presence[] = [...(r.pres ?? [])];
  while (p.length <= idx) p.push({});
  p[idx] = { a: plage.start, d: plage.end };
  return { ...r, pres: p, extra: avecPlanning ? r.extra : true };
}

function KidCard({ c, day, onEdit, compact, ligne, sautees = [], onNon }: { c: Contract; day: string; onEdit: () => void; compact?: boolean; ligne?: boolean; sautees?: number[]; onNon?: (idx: number) => void }) {
  // Heure lue à chaque rendu (l'écran se réévalue chaque minute, et après un appui).
  const maintenant = nowHHMM();
  const t = today();
  // T-048 : fiche ouverte : « choix » (vue en liste) ou « autre » (saisie de l'heure)
  const [fiche, setFiche] = useState<'choix' | 'autre' | null>(null);
  // Vision 1.1 (9.4) : raccourci « Absente » (feuille des motifs) tant que l'enfant n'est pas arrivé.
  const [absSheet, setAbsSheet] = useState(false);
  let choix: ChoixPointage | null = null;
  let pointer: ((heure: string, geste: GestePointage | null) => Promise<void>) | null = null;
  let arriveePlage: string | undefined;
  let question: QuestionPlage | null = null;
  let repondre: ((oui: boolean) => Promise<void>) | null = null;
  const [, setRelu] = useState(0);
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
  if (di.kind === 'ferie') tags.push({ tone: di.deducted ? 'warn' : 'info', text: libelleFerie(ctx, di) });
  if (di.kind === 'am' && di.amLeave) tags.push({ tone: 'info', text: AM_ABS_LABEL[di.amLeave] });
  if (di.kind === 'prevu' && day < t) tags.push({ tone: 'ok', text: 'Comme prévu' });

  const canPoint = day === t && (di.kind === 'prevu' || di.kind === 'present' || (di.kind === 'hors' && !di.planned.length));
  if (canPoint) {
    const na = nextAction(di, rec, sautees);
    // Question sur le matin : relue à l'appui (données et heure du moment)
    const relireQuestion = () => {
      const d2 = dayInfo(ctxFor(c), day);
      return questionPlage(d2.planned, nextAction(d2, d2.rec, sautees), d2.rec?.pres, nowHHMM());
    };
    question = questionPlage(di.planned, na, rec?.pres, maintenant);
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
      choix = question ? null : choixPointage(di.planned, na, maintenant);
      if (choix?.kind === 'd') choix = { ...choix, payeesMin: minutesPayeesEnPlus(ctx, day, choix.idx, choix.maintenant) };
      const enregistrer = pointer;
      action = {
        label: isArr ? (di.planned.length || pres.length ? 'Arrivée' : 'Imprévu') : 'Départ',
        quiet: !di.planned.length && !pres.length,
        icon: isArr ? 'in' : 'out',
        run: () => {
          // R1 : seuil passé depuis le dernier rendu : rien n'est noté, les trois choix s'ouvrent.
          const heure = nowHHMM();
          if (relireQuestion() || decisionAppui(di.planned, na, heure) === 'choix') { setFiche('choix'); return; }
          void enregistrer(heure, null);
        },
      };
    }
    if (question) {
      const q = question;
      repondre = async (oui: boolean) => {
        // Revérifié à l'appui : si la situation a changé, rien n'est enregistré et l'écran se réaffiche.
        if (!memeQuestion(q, relireQuestion())) { setRelu((x) => x + 1); return; }
        if (!oui) { onNon?.(q.idx); return; }
        setFiche(null);
        const plage = { start: q.debut, end: q.fin };
        const undo = await updateDay(c.id, day, (r) => pointerPlagePrevue(r, q.idx, plage, di.planned.length > 0));
        logUsage('arrivee', 'aujourdhui');
        logUsage('depart', 'aujourdhui');
        const annuler = async () => { await undo(); logUsage(evAnnulation(true), 'aujourdhui'); };
        toast(`Arrivée ${de(c.child)} à ${fmtH(q.debut)}, départ à ${fmtH(q.fin)}`, annuler);
      };
    }
  }

  // T-048 : les trois choix (carte, ou fiche de la vue en liste) et la fiche « Autre heure ».
  const choixVue = choix && pointer && (
    <ChoixHeure ch={choix} child={c.child} arrivee={arriveePlage} pointer={pointer} onAutre={() => setFiche('autre')} onFait={() => setFiche(null)} />
  );
  const questionVue = question && repondre && <QuestionPlageVue q={question} child={c.child} repondre={repondre} />;
  const fiches = question && repondre && fiche === 'choix'
    ? <Sheet title={`Accueil ${de(c.child)}`} onClose={() => setFiche(null)}>{questionVue}</Sheet>
    : choix && pointer && fiche && (
    fiche === 'choix'
      ? <Sheet title={`${choix.kind === 'a' ? 'Arrivée' : 'Départ'} ${de(c.child)}`} onClose={() => setFiche(null)}>{choixVue}</Sheet>
      : <AutreHeureSheet ch={choix} child={c.child} arrivee={arriveePlage} pointer={pointer} onClose={() => setFiche(null)} />
  );
  // Fiche demandée mais plus rien à y montrer (après « Non » sans choix à suivre, ou pointage fait ailleurs) :
  // on l'oublie, pour qu'elle ne s'ouvre pas toute seule plus tard.
  useEffect(() => { if (fiche && !fiches) setFiche(null); });

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
          <button class={action.quiet ? 'btn btn-outline' : 'btn btn-primary'} onClick={choix || question ? () => setFiche('choix') : action.run} aria-label={`${action.label} ${de(c.child)}`} aria-haspopup={choix || question ? 'dialog' : undefined}>
            <Icon name={action.icon} />{action.label}
          </button>
        )}
        {fiches}
      </article>
    );
  }

  // Vision 1.1 : carte « Maintenant » (bouton principal en encre) ou ligne (bouton contour). Le crayon ouvre la feuille Journée.
  const absente = day === t && di.kind === 'prevu' && di.planned.length > 0 && !pres.length;
  const nomFiche = <a href={`#/enfant/${c.id}`} aria-label={`Fiche ${de(c.child)}`}>{c.child}</a>;
  // Nom du crayon inchangé depuis la Vision 1.0 (« Modifier (X) » avec un pointage proposé, sinon « Modifier la journée (X) »).
  const libelleModifier = `${action ? 'Modifier' : day > t ? 'Prévoir une absence' : 'Modifier la journée'} (${c.child})`;
  const crayon = day > t
    ? <button class="btn btn-ghost btn-sm kid-prevoir" onClick={onEdit} aria-label={libelleModifier}>Prévoir une absence</button>
    : <button class="icon-btn kid-edit" onClick={onEdit} aria-label={libelleModifier}><Icon name="edit" size={22} /></button>;
  const bouton = action && !choix && !question && (
    <button class={action.quiet || ligne ? 'btn btn-outline' : 'btn btn-primary btn-lg btn-block'} onClick={action.run} aria-label={action.quiet ? `Accueil imprévu : arrivée ${de(c.child)}` : undefined}>
      {!ligne && <Icon name={action.icon} />}{action.label}
    </button>
  );
  const boutonAbsente = absente && <button class="btn btn-ghost btn-sm kid-absente" onClick={() => setAbsSheet(true)} aria-label={`Absente (${c.child})`} aria-haspopup="dialog">Absente</button>;
  const etiquettes = tags.length > 0 && <div class="kid-status">{tags.map((x) => <span class={`tag ${x.tone}`}>{x.text}</span>)}</div>;
  const feuilleAbsente = absSheet && <AbsenteSheet c={c} day={day} onClose={() => setAbsSheet(false)} />;

  if (ligne) {
    // Ligne d'un autre enfant : pastille, prénom (fiche), plan, étiquettes, crayon, bouton du moment, « Absente ».
    const deux = !!bouton && !!boutonAbsente;
    return (
      <article class="kid kid-line" style={{ '--g': color } as any} aria-label={c.child}>
        <div class="kl-main">
          <Gommette name={c.child} color={c.color} />
          <div class="kl-id">
            <div class="kid-name">{nomFiche}</div>
            <div class="kid-plan"><PlanLine di={di} /></div>
          </div>
          {crayon}
          {!deux && (bouton || boutonAbsente)}
        </div>
        {deux && <div class="kl-actions">{boutonAbsente}{bouton}</div>}
        {etiquettes}
        {questionVue || choixVue}
        {fiches}
        {feuilleAbsente}
      </article>
    );
  }

  return (
    <article class="kid kid-now" style={{ '--g': color } as any} aria-label={c.child}>
      <div class="kid-head">
        <Gommette name={c.child} color={c.color} />
        <div class="kl-id">
          <div class="kid-name">{nomFiche}</div>
          <div class="kid-plan"><PlanLine di={di} /></div>
        </div>
        {crayon}
      </div>
      {etiquettes}
      {questionVue || choixVue}
      {bouton}
      {boutonAbsente}
      {fiches}
      {feuilleAbsente}
    </article>
  );
}

type Pointer = (heure: string, geste: GestePointage | null) => Promise<void>;

/** Question sur une plage passée sans pointage, avant les choix de la plage suivante. Pas de « venu/venue ». */
function QuestionPlageVue({ q, child, repondre }: { q: QuestionPlage; child: string; repondre: (oui: boolean) => Promise<void> }) {
  const tx = texteQuestion(q);
  const plage = `plage de ${heureLisible(q.debut)} à ${heureLisible(q.fin)}`;
  return (
    <div class="pointage-choix question" role="group" aria-label={`${child} : ${tx}`}>
      <p class="pointage-choix-titre">{tx}</p>
      <button class="btn btn-primary btn-lg btn-block" onClick={() => void repondre(true)} aria-label={`Oui, ${plage} comme prévu (${child})`}>Oui</button>
      <button class="btn btn-secondary btn-lg btn-block" onClick={() => void repondre(false)} aria-label={`Non, pas d’accueil sur la ${plage} (${child})`}>Non</button>
    </div>
  );
}

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
      {/* T-118 (D-18) : arrivée bien avant l'heure prévue : l'heure prévue n'est pas encore passée, seuls « Maintenant » et « Autre heure » restent. */}
      {ch.ecartMin >= 0 && (
        <button class="btn btn-primary btn-lg btn-block" disabled={!!refusPrevue} onClick={() => choisir(ch.prevue, 'prevue')} aria-label={`${quoi} ${tx.prevue.replace(/^À/, 'à')}`}>
          <Icon name={ch.kind === 'a' ? 'in' : 'out'} />{tx.prevue}
        </button>
      )}
      {ch.ecartMin >= 0 && refusPrevue && <p class="err">{refusPrevue}</p>}
      <button class={`btn ${ch.ecartMin < 0 ? 'btn-primary' : 'btn-secondary'} btn-lg btn-block`} onClick={() => choisir(nowHHMM(), 'maintenant')} aria-label={`${quoi} : ${tx.maintenant}`}>
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
  // T-118 (D-18) : arrivée en avance, l'heure prévue n'est pas encore passée : l'heure du moment est proposée.
  const [heure, setHeure] = useState(ch.ecartMin < 0 ? ch.maintenant : ch.prevue);
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
  // T-079 : choix rédigés comme réponses à la question ; CHILD_ABS_LABEL reste le libellé court des écrans de lecture.
  { v: 'none', l: 'Oui, comme prévu' },
  { v: 'malade_certif', l: 'Non, malade, avec certificat médical', sub: 'Certificat médical ou bulletin d’hospitalisation. Déduit du salaire : 5 jours par année de contrat au plus, plus une absence de 14 jours calendaires consécutifs.' },
  { v: 'malade', l: 'Non, malade, sans certificat', sub: 'Payé normalement.' },
  { v: 'parents', l: 'Non, à la demande des parents', sub: 'Payé normalement.' },
];
// T-035b : l'absence « sans solde » de l'enfant n'est plus proposée (CCN art. 105 : absence non prévue = payée). Elle reste
// affichée seulement sur un jour déjà noté ainsi, pour pouvoir le corriger.
const OPTION_SANS_SOLDE_ENFANT = { v: 'sans_solde_enfant' as const, l: 'Non, noté « sans solde » (ancienne saisie)', sub: 'Payé : la convention ne permet pas de le retenir (article 105).' };

/**
 * Heures de départ de la fiche de la journée, plage par plage : celles pointées, sinon celles du planning.
 * T-048 (contrôle de la n° 53) : une plage sans arrivée alors qu'une plage plus loin a déjà une arrivée reste vide
 * (l'AM a répondu « Non » ou n'a pas pointé ce matin-là) : le planning ne la remplit pas, pour ne pas la noter présente.
 */
export function heuresInitiales(planned: Plage[], pres: Presence[] | undefined, slots: number, maintenant?: string): Presence[] {
  // T-068 (direction T-072) : le jour même (`maintenant`, HH:MM), seules les heures pointées sont reprises. Une plage non
  // pointée reste vide, même si son heure est passée, et aucun départ non pointé n'est proposé, même après l'heure prévue
  // (quatrième passe, B-3) : l'AM utilise le bouton Départ ou tape l'heure. « Enregistrer » n'écrit aucune heure sans geste.
  return Array.from({ length: slots }, (_, i) => {
    const vide = !pres?.[i]?.a && (pres ?? []).slice(i + 1).some((x) => !!x?.a);
    if (vide) return { a: '', d: '' };
    if (maintenant) {
      return { a: pres?.[i]?.a ?? '', d: pres?.[i]?.d ?? '' };
    }
    return { a: pres?.[i]?.a ?? planned[i]?.start ?? '', d: pres?.[i]?.d ?? planned[i]?.end ?? '' };
  });
}

/**
 * Relecture T-072 (B-2) : un départ saisi sans arrivée serait perdu (seules les plages avec arrivée sont gardées). La fiche
 * refuse alors « Enregistrer » avec ce message, qui rappelle l'arrivée prévue. Rend '' si chaque départ a son arrivée.
 */
export function departSansArrivee(pres: Presence[], planned: Plage[]): string {
  const i = pres.findIndex((p) => !p.a && !!p.d);
  if (i < 0) return '';
  const prevue = planned[i]?.start;
  return `Départ${pres.length > 1 ? ` (${i + 1})` : ''} sans arrivée : indique aussi l’heure d’arrivée${prevue ? ` (prévue à ${fmtH(prevue)})` : ''}.`;
}

/**
 * Contrôles des heures de la fiche avant « Enregistrer » : départ sans arrivée (B-2), départ avant l'arrivée. `heuresVisibles`
 * faux (absence choisie, jour à venir) : les heures ne sont pas enregistrées, aucun contrôle (sinon refus muet, le message
 * étant dans le bloc caché). Rend le message, ou ''.
 */
export function verifierFiche(pres: Presence[], planned: Plage[], heuresVisibles: boolean, maintenant?: string): string {
  if (!heuresVisibles) return '';
  const sansArrivee = departSansArrivee(pres, planned);
  if (sansArrivee) return sansArrivee;
  if (pres.some((p) => p.a && p.d && p.d <= p.a)) return 'L’heure de départ doit être après l’arrivée.';
  // T-109 (comparateur, correction 20) : le jour même, une heure pas encore passée est refusée, comme au pointage rapide.
  if (maintenant && pres.some((p) => (p.a && p.a > maintenant) || (p.d && p.d > maintenant))) return MSG_HEURE_FUTURE;
  return '';
}

/**
 * T-109 (correction 20) : le jour même, départ non pointé alors que la fin prévue de la plage commencée est passée de plus de
 * SEUIL_DEPART_MIN minutes : signalé comme les départs oubliés des jours passés.
 */
export function departOublieAujourdhui(planned: Plage[], pres: Presence[] | undefined, maintenant: string): boolean {
  return (pres ?? []).some((p) => {
    if (!p.a || p.d) return false;
    const plage = planned.find((x) => minutes(x.end) > minutes(p.a!));
    return !!plage && minutes(maintenant) > minutes(plage.end) + SEUIL_DEPART_MIN;
  });
}

/**
 * Présences écrites par « Enregistrer » de la fiche de la journée ; `undefined` : aucune présence (journée comme prévu,
 * ou jour à venir). Jour passé : des heures égales au planning ne sont pas écrites. Le jour même (T-068), seules les
 * heures saisies ou pointées sont écrites ; une fiche vide ne note rien (journée comme prévu).
 */
export function presencesAEnregistrer(planned: Plage[], pres: Presence[], future: boolean, maintenant?: string): Presence[] | undefined {
  if (future) return undefined;
  if (maintenant) { const r = presencesAGarder(pres); return r.length ? r : undefined; }
  const samePlan = pres.length === planned.length && pres.every((p, i) => planned[i] && p.a === planned[i].start && p.d === planned[i].end);
  return samePlan ? undefined : presencesAGarder(pres);
}

/**
 * Présences enregistrées par la fiche : chaque plage garde son rang (une plage vide devient {}), pour que la plage du
 * soir reste la deuxième ; les plages vides en fin de liste sont retirées. Le moteur ne lit que les plages avec arrivée.
 */
export function presencesAGarder(pres: Presence[]): Presence[] {
  const r: Presence[] = pres.map((p) => (p.a ? { a: p.a, d: p.d || undefined } : {}));
  while (r.length && !r[r.length - 1].a) r.pop();
  return r;
}

/**
 * T-103 (K1, C3) : réponses obligatoires de la fiche de la journée. Trajet partagé : nombre d'enfants dans la voiture
 * (CCN 113 : partage au prorata, au moins 2 enfants). Certificat : les deux dates ou aucune, la fin après le début.
 */
export function verifierSaisieT103(f: { abs: string; km: number; kmPartage: boolean; kmEnfants: number; certifDu: string; certifAu: string }): string {
  if (f.abs === 'none' && f.km > 0 && f.kmPartage && f.kmEnfants < 2) return 'Kilomètres : indique le nombre d’enfants dans la voiture (au moins 2 quand une autre famille a demandé le trajet).';
  if (f.abs === 'malade_certif') {
    if (!!f.certifDu !== !!f.certifAu) return 'Certificat : indique le premier et le dernier jour, ou laisse les deux vides.';
    if (f.certifDu && f.certifAu < f.certifDu) return 'Certificat : le dernier jour doit être après le premier.';
  }
  return '';
}

/** T-118 (D-09) : minutes entre la première arrivée et le dernier départ saisis dans la fiche (0 si incomplet) */
export function amplitudeFiche(pres: Presence[]): number {
  const a = pres.filter((p) => p.a && p.d);
  if (!a.length) return 0;
  return Math.max(...a.map((p) => minutes(p.d!))) - Math.min(...a.map((p) => minutes(p.a!)));
}

/** Réponses de la feuille Journée (T-126 : écriture commune à la feuille et au raccourci « Absente »). */
export interface FicheJournee {
  abs: ChildAbs | 'none'; gardees: Presence[] | undefined; repas: number; km: number; kmPartage: boolean; kmEnfants: number;
  ferieT: boolean; certifDu: string; certifAu: string;
}

/** Journée écrite par « Enregistrer » de la feuille Journée (règles inchangées depuis T-103, T-118). */
export function journeeFiche(r: DayRec, f: FicheJournee, repasParJour: number, avecPlanning: boolean): DayRec {
  const next: DayRec = { ...r };
  if (f.abs !== 'none') { next.abs = f.abs; delete next.pres; }
  else {
    delete next.abs;
    if (!f.gardees) delete next.pres;
    else next.pres = f.gardees;
    if (!avecPlanning && next.pres?.length) next.extra = true;
  }
  if (f.repas !== repasParJour) next.repas = f.repas; else delete next.repas;
  if (f.km) next.km = f.km; else delete next.km;
  if (f.km) next.kmPartage = f.kmPartage; else delete next.kmPartage;
  if (f.km && f.kmPartage && f.kmEnfants >= 1) next.kmEnfants = f.kmEnfants; else delete next.kmEnfants;
  if (f.ferieT) next.ferieTravaille = true; else delete next.ferieTravaille;
  if (f.abs === 'malade_certif' && f.certifDu && f.certifAu) { next.certifDu = f.certifDu; next.certifAu = f.certifAu; } else { delete next.certifDu; delete next.certifAu; }
  return next;
}

/**
 * Valeurs de départ de la feuille Journée, lues dans la journée enregistrée (mêmes règles que DaySheet). Le raccourci
 * « Absente » les reprend telles quelles : il n'écrit que le motif (et les dates du certificat), comme la feuille.
 */
export function ficheDepart(rec: DayRec | undefined, repasParJour: number): Omit<FicheJournee, 'abs' | 'gardees' | 'certifDu' | 'certifAu'> {
  return {
    repas: rec?.repas ?? repasParJour,
    km: rec?.km ?? 0,
    kmEnfants: rec?.kmEnfants ?? 0,
    kmPartage: rec?.kmPartage ?? (rec?.kmEnfants !== undefined && rec.kmEnfants > 1),
    ferieT: !!rec?.ferieTravaille,
  };
}

export function DaySheet({ c, day, onClose }: { c: Contract; day: string; onClose: () => void }) {
  const di = dayInfo(ctxFor(c), day);
  const rec = di.rec;
  const slots = Math.max(di.planned.length, rec?.pres?.length ?? 0, 1);
  const init = heuresInitiales(di.planned, rec?.pres, slots, day === today() ? nowHHMM() : undefined);
  const [pres, setPres] = useState<Presence[]>(init);
  const [abs, setAbs] = useState<ChildAbs | 'none'>(rec?.abs ?? 'none');
  // T-025 C-2 : saisie d'avant (champ absent) avec un seul enfant dans la voiture = une seule famille demandeuse (ficheDepart).
  const depart = ficheDepart(rec, c.repasParJour);
  const [repas, setRepas] = useState<number>(depart.repas);
  const [km, setKm] = useState<number>(depart.km);
  const [kmEnfants, setKmEnfants] = useState<number>(depart.kmEnfants);
  const [kmPartage, setKmPartage] = useState<boolean>(depart.kmPartage);
  const [ferieT, setFerieT] = useState<boolean>(depart.ferieT);
  // T-103 (C3) : dates du certificat médical (CCN 105 : « 14 jours calendaires consécutifs »).
  const [certifDu, setCertifDu] = useState<string>(rec?.certifDu ?? '');
  const [certifAu, setCertifAu] = useState<string>(rec?.certifAu ?? '');
  const [err, setErr] = useState('');
  const future = day > today();
  const errT103 = err.startsWith('Kilomètres') || err.startsWith('Certificat');
  useErreurAffichee('depart_avant_arrivee', !!err && !err.includes('sans arrivée') && !errT103);
  useErreurAffichee('saisie', !!err && (err.includes('sans arrivée') || errT103));

  async function save() {
    const erreur = verifierFiche(pres, di.planned, abs === 'none' && !future, day === today() ? nowHHMM() : undefined);
    if (erreur) { setErr(erreur); return; }
    const erreurT103 = verifierSaisieT103({ abs, km: abs === 'none' && !future && c.kmTaux > 0 ? km : 0, kmPartage, kmEnfants, certifDu, certifAu });
    if (erreurT103) { setErr(erreurT103); return; }
    const gardees = presencesAEnregistrer(di.planned, pres, future, day === today() ? nowHHMM() : undefined);
    const undo = await updateDay(c.id, day, (r) => journeeFiche(r, { abs, gardees, repas, km, kmPartage, kmEnfants, ferieT, certifDu, certifAu }, c.repasParJour, di.planned.length > 0));
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
      <Choices label="L’enfant est-il accueilli ce jour-là ?" value={abs} options={rec?.abs === 'sans_solde_enfant' ? [...CHILD_ABS_OPTIONS, OPTION_SANS_SOLDE_ENFANT] : CHILD_ABS_OPTIONS} onChange={(v) => { setAbs(v); setErr(''); }} />
      {abs === 'malade_certif' && (
        <>
          <div class="grid2">
            <DateInput label="Certificat : premier jour" value={certifDu} onChange={(v) => { setCertifDu(v); setErr(''); }} />
            <DateInput label="Certificat : dernier jour" value={certifAu} min={certifDu || undefined} onChange={(v) => { setCertifAu(v); setErr(''); }} />
          </div>
          <p class="hint">Les dates écrites sur le certificat médical ou le bulletin d’hospitalisation. La convention (article 105) compte une absence de 14 jours calendaires à part des 5 jours : l’app en a besoin quand l’absence approche 14 jours.</p>
          {err && <p class="err" role="alert">{err}</p>}
        </>
      )}
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
          {err && !errT103 && <p class="err" role="alert">{err}</p>}
          {/* T-118 (D-09) : journée de plus de 13 h saisie dans la fiche : alerte, sans blocage. */}
          {amplitudeFiche(pres) > AMPLITUDE_MAX_MIN && <Banner tone="warn">{messageAmplitude(amplitudeFiche(pres)).replace(', tous contrats notés dans l’app', '')}</Banner>}
          {pres.length < 2 && <button class="btn btn-ghost" onClick={() => setPres([...pres, { a: '', d: '' }])}><Icon name="plus" />Ajouter une plage</button>}
          {di.planned.length > 0 && (
            <button class="btn btn-ghost" onClick={() => setPres(di.planned.map((p) => ({ a: p.start, d: p.end })))}><Icon name="undo" />Revenir au planning</button>
          )}
        </fieldset>
      )}
      {abs === 'none' && !future && (
        <>
          {c.repasPrix > 0 && <Stepper label="Repas fournis par toi" value={repas} onChange={setRepas} max={4} />}
          {c.kmTaux > 0 && <Stepper label="Kilomètres parcourus avec l’enfant" value={km} onChange={setKm} max={500} unit="km" />}
          {c.kmTaux > 0 && km > 0 && <Switch label="Une autre famille a aussi demandé ce trajet" hint="Laisse éteint si cette famille est seule à l’avoir demandé : elle paie alors tous les km (article 113)." checked={kmPartage} onChange={setKmPartage} />}
          {c.kmTaux > 0 && km > 0 && kmPartage && <Stepper label="Enfants dans la voiture" value={kmEnfants} onChange={setKmEnfants} max={8} />}
          {c.kmTaux > 0 && km > 0 && kmPartage && <p class="hint">Compte tous les enfants dans la voiture, les tiens compris si le trajet est aussi pour eux. Chaque famille paie sa part, au prorata des enfants (article 113). L’app a besoin de ce nombre pour calculer le mois.</p>}
          {err && err.startsWith('Kilomètres') && <p class="err" role="alert">{err}</p>}
        </>
      )}
      <button class="btn btn-primary btn-block btn-lg" onClick={save}>Enregistrer</button>
    </Sheet>
  );
}

/**
 * Vision 1.1 (T-126, 9.4) : raccourci « Absente » d'un enfant pas encore arrivé. Motifs de la feuille Journée sans « Oui »,
 * dates du certificat facultatives ; même écriture que « Enregistrer » de la feuille (absence posée, présence retirée),
 * même message avec « Annuler ». Rien n'est choisi d'avance.
 */
function AbsenteSheet({ c, day, onClose }: { c: Contract; day: string; onClose: () => void }) {
  const di = dayInfo(ctxFor(c), day);
  const rec = di.rec;
  const [abs, setAbs] = useState<ChildAbs | ''>('');
  const [certifDu, setCertifDu] = useState('');
  const [certifAu, setCertifAu] = useState('');
  const [err, setErr] = useState('');
  useErreurAffichee('saisie', !!err);
  const options = (rec?.abs === 'sans_solde_enfant' ? [...CHILD_ABS_OPTIONS, OPTION_SANS_SOLDE_ENFANT] : CHILD_ABS_OPTIONS).filter((o) => o.v !== 'none') as { v: ChildAbs; l: string; sub?: string }[];
  async function save() {
    if (!abs) return;
    const depart = ficheDepart(rec, c.repasParJour);
    const e = verifierSaisieT103({ abs, km: 0, kmPartage: depart.kmPartage, kmEnfants: depart.kmEnfants, certifDu, certifAu });
    if (e) { setErr(e); return; }
    const undo = await updateDay(c.id, day, (r) => journeeFiche(r, { ...depart, abs, gardees: undefined, certifDu, certifAu }, c.repasParJour, di.planned.length > 0));
    logUsage('journee_modifiee', 'aujourdhui');
    for (const ev of evCorrections(day, today(), rec?.pres, [])) logUsage(ev, 'aujourdhui');
    onClose();
    toast(`Journée ${de(c.child)} enregistrée`, undo);
  }
  return (
    <Sheet title={`Absence ${de(c.child)}`} onClose={onClose}>
      <Choices label="L’enfant est-il accueilli ce jour-là ?" value={abs as ChildAbs} options={options} onChange={(v) => { setAbs(v); setErr(''); }} />
      {abs === 'malade_certif' && (
        <>
          <div class="grid2">
            <DateInput label="Certificat : premier jour" value={certifDu} onChange={(v) => { setCertifDu(v); setErr(''); }} />
            <DateInput label="Certificat : dernier jour" value={certifAu} min={certifDu || undefined} onChange={(v) => { setCertifAu(v); setErr(''); }} />
          </div>
          <p class="hint">Les dates écrites sur le certificat médical ou le bulletin d’hospitalisation. La convention (article 105) compte une absence de 14 jours calendaires à part des 5 jours : l’app en a besoin quand l’absence approche 14 jours.</p>
        </>
      )}
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn btn-primary btn-block btn-lg" disabled={!abs} onClick={save}>Enregistrer</button>
    </Sheet>
  );
}

const AM_OPTIONS: { v: ChoixAbsence; l: string; sub: string }[] = [
  // T-079 : une seule forme (le nom de l'absence) ; AM_ABS_LABEL reste le libellé des écrans de lecture et du relevé.
  { v: 'cp', l: 'Congés payés', sub: 'Décomptés de ton compteur de congés.' },
  { v: 'am_malade', l: 'Maladie', sub: 'Non payé par les parents : la Sécurité sociale te verse des indemnités.' },
  { v: 'am_enfant_malade', l: 'Enfant malade', sub: 'Ton enfant à toi. Non payé : 3 jours par an, 5 dans certains cas.' },
  { v: 'evenement', l: 'Événement familial', sub: 'Mariage, naissance, décès… Payé sur justificatif, pour la durée prévue.' },
  { v: 'sans_solde', l: 'Congé sans solde', sub: 'Non payé, avec l’accord des parents.' },
  // T-109 (correction 5) : absences payées par les parents.
  { v: 'formation', l: 'Formation obligatoire', sub: 'Ta formation d’assistante maternelle (code de l’action sociale, article L421-14). Payée par les parents (article L423-5).' },
  { v: 'examen_grossesse', l: 'Examen médical de grossesse', sub: 'Examens obligatoires de ta grossesse. Payés par les parents, sans retenue (code du travail, article L1225-16). Comptés comme du travail pour tes congés (même article). Le motif reste sur ce téléphone : en ligne, c’est une « absence payée ».' },
  { v: 'remuneree', l: 'Autre absence payée par les parents', sub: 'Une absence que les parents te paient. L’app ne garde pas sa raison.' },
  // T-104 (regles/t104-absences-protegees.md) : calculées par l'app ; non payées par les parents (indemnités de la Sécurité
  // sociale), sauf le jour de l'accident et, en Alsace-Moselle, le maintien du salaire.
  { v: 'maternite', l: 'Congé maternité', sub: 'Non payé par les parents : la Sécurité sociale te verse des indemnités. Compte pour tes congés et ton ancienneté.' },
  { v: 'paternite', l: 'Congé paternité et d’accueil de l’enfant', sub: 'Non payé par les parents : la Sécurité sociale te verse des indemnités. Compte pour tes congés et ton ancienneté.' },
  { v: 'naissance_supp', l: 'Congé supplémentaire de naissance', sub: 'Non payé par les parents : la Sécurité sociale te verse des indemnités. Compte pour ton ancienneté, pas pour tes congés.' },
  { v: 'at_mp', l: 'Accident du travail ou maladie professionnelle', sub: 'Non payé par les parents, sauf le jour de l’accident : la Sécurité sociale te verse des indemnités. Compte pour tes congés et ton ancienneté.' },
];

/** T-104 : nature d'un arrêt pour accident du travail ou maladie professionnelle (CCN 49 et 64.1 ; CSS L411-1, L411-2) */
const ATMP_OPTIONS: { v: NatureAtMp; l: string; sub: string }[] = [
  { v: 'accident', l: NATURE_ATMP_LABEL.accident, sub: 'Pendant ton travail, chez toi ou en sortie avec les enfants.' },
  { v: 'trajet', l: NATURE_ATMP_LABEL.trajet, sub: 'Sur le trajet entre chez toi et ton lieu de travail (une maison d’assistants maternels, par exemple).' },
  { v: 'maladie_pro', l: NATURE_ATMP_LABEL.maladie_pro, sub: 'Maladie reconnue comme liée à ton travail.' },
];

/**
 * T-103 (C9, R3) : l'absence demande-t-elle le montant des indemnités journalières ? Congé de deuil (CCN 48.1.3.1.2 et
 * 48.1.3.1.3), ou maladie de l'AM ou de son enfant quand un contrat en Alsace-Moselle couvre ces dates (L1226-23).
 */
export function demandeIJ(type: ChoixAbsence, nature: NatureEvenement | undefined, from: string, to: string, contrats: Contract[]): 'deuil' | 'local' | undefined {
  if (type === 'evenement' && nature === 'deuil') return 'deuil';
  if ((type === 'am_malade' || type === 'am_enfant_malade' || estSuspension(type)) && contrats.some((c) => regionDe(c) === 'alsaceMoselle' && c.start <= to && (!c.end || c.end >= from))) return 'local';
  return undefined;
}

export function AmAbsenceSheet({ start, onClose, remplace }: { start: string; onClose: () => void; remplace?: AmLeave }) {
  // T-135 : `remplace` : congés payés ouverts depuis le calendrier du Mois et modifiés ; l'ancienne absence est retirée à
  // l'enregistrement (un seul « Annuler » remet tout).
  const [type, setType] = useState<ChoixAbsence>('cp');
  const [nature, setNature] = useState<NatureEvenement | undefined>(undefined);
  const [from, setFrom] = useState(remplace?.from ?? start);
  const [to, setTo] = useState(remplace?.to ?? start);
  // Réponses liées à l'absence visée : remises à zéro quand une question change d'absence (dates changées).
  const [reponses, setReponses] = useState<Record<string, 'oui' | 'non'>>({});
  // T-103 (C9, R3) : indemnités journalières de la Sécurité sociale, en centimes nets (congé de deuil ; maladie en Alsace-Moselle).
  const [ij, setIj] = useState<number | undefined>(undefined);
  const [ijAutres, setIjAutres] = useState<number | undefined>(undefined);
  // T-104 : nature de l'arrêt et jour de l'accident (CSS L433-1), demandés une fois ici.
  const [atmp, setAtmp] = useState<NatureAtMp | undefined>(undefined);
  const [jourAccident, setJourAccident] = useState<'oui' | 'non' | undefined>(undefined);
  const atmpManque = type === 'at_mp' && (!atmp || (atmp !== 'maladie_pro' && !jourAccident));
  // T-109 (contrôle n° 4) : « Autre absence payée » : comptée pour les congés seulement si les parents l'acceptent.
  const [congesPayee, setCongesPayee] = useState<'oui' | 'non'>('non');
  const ijDemande = demandeIJ(type, nature, from, to, state.contracts);
  const err = to < from ? 'La date de fin doit être après le début.' : '';
  useErreurAffichee('dates_absence', !!err);
  // Décision du DG du 21/11/2026 : une autre absence « événement familial » à 15 jours au plus : l'app demande à l'AM.
  const autres = remplace ? state.leaves.filter((x) => x.id !== remplace.id) : state.leaves;
  const questions = type === 'evenement' && !err ? questionsSuite(from, to, autres) : [];
  const reps: Reponse[] = questions.map((q) => reponses[`${q.sens}|${q.autre.id}`]);
  const visibles = questionsVisibles(questions, reps);
  return (
    <Sheet title={remplace ? 'Modifier l’absence' : 'Je serai absente'} onClose={onClose}>
      <p class="muted">Pour tous les enfants. Pour une absence non payée, l’app fait seule la retenue sur le salaire.</p>
      <Choices label="Pourquoi seras-tu absente ?" value={type} options={AM_OPTIONS} onChange={setType} />
      {type === 'evenement' && (
        <Choices label="Quel événement familial ?" value={nature} onChange={setNature}
          options={(Object.keys(NATURE_EVENEMENT_LABEL) as NatureEvenement[]).map((v) => ({ v, l: NATURE_EVENEMENT_LABEL[v], sub: libelleDureeSaisie(v, from) }))} />
      )}
      {type === 'evenement' && <p class="hint">Déplacement de plus de 600 km aller-retour : le jour en plus est non rémunéré, saisis-le en congé sans solde.</p>}
      {type === 'at_mp' && <Choices label="C’est :" value={atmp} options={ATMP_OPTIONS} onChange={setAtmp} />}
      {type === 'at_mp' && atmp && atmp !== 'maladie_pro' && (
        <Choices label="Le premier jour de l’absence est-il le jour de l’accident ?" value={jourAccident} onChange={setJourAccident}
          options={[{ v: 'oui', l: 'Oui', sub: 'Ce jour-là est payé en entier par les parents (code de la sécurité sociale, article L433-1).' }, { v: 'non', l: 'Non, l’arrêt commence après', sub: 'Le jour de l’accident n’est pas dans cette absence : il reste payé comme prévu.' }]} />
      )}
      {type === 'remuneree' && (
        <Choices label="Les parents la comptent-ils comme du travail pour les congés ?" value={congesPayee} onChange={setCongesPayee}
          options={[{ v: 'non', l: 'Non', sub: 'La règle : aucun texte ne la compte comme du travail. Tes congés acquis baissent un peu si l’absence est longue (convention, article 48.1.1.2).' }, { v: 'oui', l: 'Oui, les parents l’acceptent', sub: 'Une règle plus favorable pour toi est permise si les parents sont d’accord.' }]} />
      )}
      {estSuspension(type) ? <p class="hint">{ABSENCES_PROTEGEES_DONNEES}</p> : <p class="hint">{ABSENCES_PROTEGEES_AIDE}</p>}
      {type === 'evenement' && <p class="hint">L’app garde seulement « événement familial » et le nombre de jours payés, pas l’événement choisi.</p>}
      <div class="grid2">
        <DateInput label="Premier jour d’absence" value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} />
        <DateInput label="Dernier jour d’absence" value={to} min={from} onChange={setTo} />
      </div>
      {visibles.map((q, i) => (
        <Choices key={`${q.sens}|${q.autre.id}`} label={texteQuestionSuite(q)} value={reps[i]}
          onChange={(rep) => setReponses({ ...Object.fromEntries(questions.slice(0, i).map((x, k) => [`${x.sens}|${x.autre.id}`, reps[k]!]).filter((e) => e[1])), [`${q.sens}|${q.autre.id}`]: rep })}
          options={[{ v: 'oui', l: 'Oui, c’est le même événement', sub: 'Les jours se cumulent pour la durée prévue' }, { v: 'non', l: 'Non, c’est un autre événement', sub: 'Chaque événement a sa propre durée' }]} />
      ))}
      {ijDemande && (
        <>
          <EuroInput label="Indemnités journalières de la Sécurité sociale pour cette absence (net)" cents={ij} allowEmpty onChange={setIj}
            hint={ijDemande === 'deuil' ? 'Le montant net versé par ta CPAM pour ce congé (relevé sur ameli.fr). 0 si tu n’en reçois pas. Les parents maintiennent ton salaire moins ce montant (convention, article 48.1.3.1.3).' : 'Le montant net versé par ta CPAM pour cette absence (relevé sur ameli.fr). 0 si tu n’en reçois pas. En Alsace-Moselle, les parents maintiennent ton salaire moins ce montant (code du travail, article L1226-23). Tu peux le saisir plus tard dans « Congés ».'} />
          <EuroInput label="Salaires bruts des 3 mois avant l’absence qui ne sont pas dans l’app" cents={ijAutres} allowEmpty onChange={setIjAutres}
            hint="Ceux de tes autres employeurs (et des mois d’avant le suivi par l’app), sur tes attestations Pajemploi. 0 si aucun. Les indemnités sont calculées sur tous tes salaires : chaque parent déduit seulement la part qui vient du sien (code de la sécurité sociale, article R323-4)." />
        </>
      )}
      {type === 'cp' && <p class="hint">Mets ton dernier jour de congé. L’app compte les jours du lundi au samedi jusqu’à la veille de ta reprise : le samedi avant un retour le lundi compte aussi.</p>}
      {err && <p class="err" role="alert">{err}</p>}
      <button
        class="btn btn-primary btn-block btn-lg"
        disabled={!!err || !from || !to || (type === 'evenement' && (!nature || !absenceSaisie(type, nature, 'x', from, to))) || !reponsesCompletes(questions, reps) || (ijDemande === 'deuil' && (ij === undefined || ijAutres === undefined)) || atmpManque}
        onClick={async () => {
          const l = absenceSaisie(type, nature, uid(), from, to);
          if (!l) return;
          if (ijDemande && ij !== undefined) l.ijSecu = ij;
          if (ijDemande && ijAutres !== undefined) l.ijSalairesAutres = ijAutres;
          if (l.type === 'remuneree') l.comptePourConges = congesPayee === 'oui';
          if (l.type === 'at_mp') { l.atmp = atmp; if (atmp !== 'maladie_pro') l.jourAccident = jourAccident === 'oui'; }
          const undos: (() => Promise<void>)[] = [];
          if (remplace) undos.push(await deleteLeave(remplace.id));
          for (const x of appliquerReponses(l, questions, reps)) undos.push(await putLeave(x));
          const undo = async () => { for (const u of undos.reverse()) await u(); };
          logUsage('absence_am', 'aujourdhui');
          onClose();
          toast(`${AM_ABS_LABEL[l.type]} enregistré${l.type === 'cp' ? 's' : ''}`, undo);
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}

export { state };
