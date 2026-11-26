// T-122 (phase C) : après la création (maquette 23), fiche de l'enfant (12), ses parents et leur lien (13), ses absences et
// congés (14), et les contrats en cours de saisie à reprendre (22, 24). Aucun calcul nouveau : les chiffres viennent du moteur.
import { useState } from 'preact/hooks';
import { ctxFor, logUsage, putContract, toast, useStore } from '../store';
import { addDays, eachDay, lastDay, monthLabel, monthOf, shortDate, today, MOIS_NOMS } from '../engine/dates';
import { dayInfo, joursMensualises, monthBase, termsAt, weeklyMinutes } from '../engine/payroll';
import { compteursCP } from '../engine/compteurs-cp';
import { euros, hoursLabel } from '../engine/money';
import { AM_ABS_LABEL, CHILD_ABS_LABEL, type Contract } from '../engine/model';
import { de } from '../engine/texte';
import { Banner, CHILD_COLORS, COLOR_NAMES, couleursPrises, DateInput, Gommette, ListLink, Sheet, TextInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { PartageCard } from './PartageCard';
import { AmAbsenceSheet, DaySheet } from './Today';
import { NOMS_ETAPES } from './AjoutEnfant';
import { nbEtapes, useBrouillons } from '../brouillons';
import { SupprimerBrouillon } from './BrouillonSuppression';

// Relecture m3 : jamais « -0 » (un reste nul s'affiche 0).
const nb = (x: number | undefined) => (x === undefined ? '—' : (Math.abs(x) < 0.05 ? 0 : x).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
const Maj = (x: string) => x.replace(/^./, (y) => y.toUpperCase());

function Introuvable({ titre }: { titre: string }) {
  return <><Topbar title={titre} back="#/plus" screen="fiche" /><main><Banner tone="warn">Contrat introuvable.</Banner></main></>;
}

/** « CDI, régulier, année complète » */
export function libelleContrat(c: Contract, d = today()): string {
  const t = termsAt(c, d);
  return [c.cdd ? 'CDD' : 'CDI', c.accueilOccasionnel ? 'occasionnel' : 'régulier', c.accueilOccasionnel ? '' : t.yearType === 'complete' ? 'année complète' : `année incomplète (${t.weeks} semaines)`].filter(Boolean).join(', ');
}

export const libelleDebut = (c: Contract, t = today()) =>
  `${c.family ? `Famille ${c.family} · ` : ''}${c.end && c.end < t ? `terminé le ${shortDate(c.end)}` : `${c.cdd ? 'CDD' : 'CDI'} depuis le ${shortDate(c.start)}`}`;

/** Écran 23 : contrat créé, le mois en cours tel que le moteur le prévoit */
export function ContratCree({ id }: { id: string }) {
  const s = useStore();
  const c = s.contracts.find((x) => x.id === id);
  if (!c) return <Introuvable titre="Contrat créé" />;
  const m = monthOf(today());
  const ctx = ctxFor(c);
  const b = monthBase(ctx, m);
  // Relecture M2 : jours et heures prévus comme l'écran Mois, jour par jour (dayInfo) : fériés chômés retirés et nommés.
  const debutMois = c.trackedFrom > `${m}-01` ? c.trackedFrom : `${m}-01`;
  const jours = eachDay(debutMois, lastDay(m)).filter((d) => !c.end || d <= c.end).map((d) => dayInfo(ctx, d));
  const prevus = jours.filter((di) => di.kind !== 'hors' && di.kind !== 'ferie' && di.plannedMin > 0);
  const feries = jours.filter((di) => di.kind === 'ferie');
  const minPrevues = prevus.reduce((t, di) => t + di.plannedMin, 0);
  const avant = c.trackedFrom > c.start;
  return (
    <>
      <Topbar title={`Contrat ${de(c.child)} créé`} back={`#/enfant/${c.id}`} screen="contrat-cree" />
      <main>
        <section class="card stack">
          <h2>{Maj(monthLabel(m))}</h2>
          <p class="hint">Suivi depuis le {shortDate(c.trackedFrom > `${m}-01` ? c.trackedFrom : `${m}-01`)}.</p>
          <dl class="kv">
            <dt>Accueil prévu</dt><dd>{prevus.length} jour{prevus.length > 1 ? 's' : ''}, {hoursLabel(minPrevues)}</dd>
            {feries.length > 0 && <><dt>Jour{feries.length > 1 ? 's' : ''} férié{feries.length > 1 ? 's' : ''}</dt><dd>{feries.map((di) => `${Number(di.date.slice(8))} ${MOIS_NOMS[Number(di.date.slice(5, 7)) - 1]}`).join(', ')}</dd></>}
            {!c.accueilOccasionnel && <><dt>Mensualisation</dt><dd>{hoursLabel(Math.round(b.mensuelMin))}, {joursMensualises(termsAt(c, today()))} jours</dd></>}
            {!c.accueilOccasionnel && <><dt>Salaire de base</dt><dd>{euros(b.salaireMens)} net</dd></>}
          </dl>
          <a class="btn btn-primary btn-block" href={`#/mois/${m}/${c.id}`}>Voir {monthLabel(m)} dans Mois</a>
        </section>
        <h2 class="section-title">Ensuite</h2>
        <div class="list">
          <ListLink href={`#/enfant/${c.id}/parents`} icon="users" title="Créer le lien des parents" />
          {avant && <ListLink href={`#/historique/${c.id}`} icon="file" title="Bulletins d’avant Arvela (facultatif)" sub={`Avant le ${shortDate(c.trackedFrom)}`} />}
          <ListLink href={`#/enfant/${c.id}`} icon={<Gommette name={c.child} color={c.color} />} title={`La fiche ${de(c.child)}`} />
        </div>
      </main>
    </>
  );
}

/** Écran 12 : fiche de l'enfant (Vision 1.1, T-126 : en-tête, onglets-liens, cadran du contrat, lignes, couleur) */
export function FicheEnfant({ id }: { id: string }) {
  const s = useStore();
  const c = s.contracts.find((x) => x.id === id);
  const [couleur, setCouleur] = useState(false);
  if (!c) return <Introuvable titre="Fiche" />;
  const t = today();
  const tc = termsAt(c, t);
  const cp = c.accueilOccasionnel ? undefined : compteursCP(ctxFor(c), t, s.settings.enfantsACharge);
  const avant = c.trackedFrom > c.start;
  const journee = s.journal.filter((j) => j.cid === c.id && j.date === t).length;
  return (
    <>
      <Topbar title={c.child} back="#/plus" screen="fiche" />
      <main class="fiche">
        <div class="fiche-tete">
          <Gommette name={c.child} color={c.color} size="lg" />
          <span class="fiche-debut">{libelleDebut(c, t)}</span>
        </div>
        <nav class="seg fiche-onglets" aria-label={`Contrat ${de(c.child)}`}>
          {/* Noms lus : ceux des lignes de la Vision 1.0 (« Le contrat… », « Le planning… »), le mot visible y est compris. */}
          <a href={`#/contrat/${c.id}`} aria-label={`Le contrat : ${libelleContrat(c, t)}`}>Contrat</a>
          {!c.accueilOccasionnel && <a href={`#/contrat/${c.id}`} aria-label={`Le planning : ${tc.planningVariable ? 'horaires qui changent' : `${hoursLabel(weeklyMinutes(tc.planning))} par semaine`}`}>Planning</a>}
          <a href={`#/enfant/${c.id}/parents`}>Parents</a>
        </nav>
        <CadranContrat c={c} />
        <p class="fiche-contrat">{libelleContrat(c, t)}</p>
        <div class="list">
          <div class="li"><span class="li-main"><span class="li-title">Net de l’heure</span></span><span class="li-end fiche-valeur">{euros(tc.rateNet)}</span></div>
          <ListLink href={`#/enfant/${c.id}/absences`} title="Absences et congés"
            end={<span class="fiche-valeur-sous">{cp ? `${nb(cp.reste)} j à poser` : '10 %'}</span>}
            sub={cp ? undefined : 'congés versés à chaque accueil'} />
          <ListLink href={`#/enfant/${c.id}/parents`} title="Les parents et leur lien" sub={c.partage ? 'Lien actif' : 'Lien pas encore créé'} end={c.partage ? undefined : <span class="tag afaire">À faire</span>} />
          <ListLink href="#/carnet" title="Son carnet" sub={journee ? `${journee} note${journee > 1 ? 's' : ''} aujourd’hui` : 'Aucune note aujourd’hui'} />
          {/* 9.8 : « Historique » et « Bulletins d'avant Arvela » sont le même écran : une seule ligne. */}
          {avant && <ListLink href={`#/historique/${c.id}`} title="Bulletins d’avant Arvela" end={<span>Facultatif</span>} sub={`Avant le ${shortDate(c.trackedFrom)} · ${c.history.length} saisi${c.history.length > 1 ? 's' : ''}`} />}
          <ListLink title="Couleur" onClick={() => setCouleur(true)} end={<Gommette name={c.child} color={c.color} size="sm" />} />
        </div>
        <div class="fiche-actions">
          <a class="btn btn-outline" href={`#/avenant/${c.id}/nouveau`}><span class="sr-only">Changer le contrat (</span>Avenant<span class="sr-only">)</span></a>
          <a class="btn btn-ghost" href={`#/fin/${c.id}`}>Fin du contrat</a>
        </div>
        {(c.avenants?.length || c.end) && (
          <p class="hint fiche-notes">
            {c.avenants?.length ? `${c.avenants.length} avenant${c.avenants.length > 1 ? 's' : ''} déjà enregistré${c.avenants.length > 1 ? 's' : ''}` : ''}
            {c.avenants?.length && c.end ? ' · ' : ''}
            {c.end ? `Dernier jour : ${shortDate(c.end)}` : ''}
          </p>
        )}
      </main>
      {couleur && <CouleurSheet c={c} onClose={() => setCouleur(false)} />}
    </>
  );
}

/**
 * Cadran du contrat (consigne T-126, 4 et 9.8) : une graduation par semaine de l'année du contrat en cours, semaines sans
 * accueil (`weeksOff` du contrat et de ses avenants) claires, semaine en cours en or, heures par semaine au centre.
 * Graphique : il double les textes de la fiche ; son aria-label dit tout.
 */
export function semainesContrat(c: Contract, t: string): { lundis: string[]; sansAccueil: Set<string>; courante: string } {
  const lundi = (d: string) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
  // Année du contrat en cours : du dernier anniversaire du début du contrat, 52 semaines.
  const y = Number(t.slice(0, 4));
  let debut = `${y}${c.start.slice(4)}`;
  if (debut > t) debut = `${y - 1}${c.start.slice(4)}`;
  if (debut < c.start) debut = c.start;
  const premier = lundi(debut);
  const lundis = Array.from({ length: 52 }, (_, i) => addDays(premier, i * 7));
  const sansAccueil = new Set<string>([...(c.weeksOff ?? []), ...(c.avenants ?? []).flatMap((a) => a.changes.weeksOff ?? [])].map(lundi));
  return { lundis, sansAccueil, courante: lundi(t) };
}

function CadranContrat({ c }: { c: Contract }) {
  const t = today();
  const tc = termsAt(c, t);
  if (c.accueilOccasionnel) return <p class="fiche-occasionnel">Accueil occasionnel</p>;
  const { lundis, sansAccueil, courante } = semainesContrat(c, t);
  const heures = tc.planningVariable ? 'Variable' : hoursLabel(weeklyMinutes(tc.planning));
  const semaines = tc.yearType === 'complete' ? 52 : tc.weeks;
  const off = lundis.filter((l) => sansAccueil.has(l));
  const label = `${heures === 'Variable' ? 'Horaires qui changent' : `${heures} par semaine`}, ${semaines} semaines d’accueil par an.${off.length ? ` Semaines sans accueil cette année : ${off.map((l) => `celle du ${shortDate(l)}`).join(', ')}.` : ''} Semaine en cours : celle du ${shortDate(courante)}.`;
  const C = 80, R1 = 62, R2 = 74;
  return (
    <div class="cadran-contrat">
      <svg viewBox="0 0 160 160" role="img" aria-label={label}>
        {lundis.map((l, i) => {
          const a = (i / 52) * 2 * Math.PI - Math.PI / 2;
          const cls = l === courante ? 'cc-courante' : sansAccueil.has(l) ? 'cc-off' : 'cc-sem';
          return <line x1={C + R1 * Math.cos(a)} y1={C + R1 * Math.sin(a)} x2={C + R2 * Math.cos(a)} y2={C + R2 * Math.sin(a)} class={cls} />;
        })}
        <text x={C} y={C + 6} text-anchor="middle" class="cc-heures">{heures}</text>
        <text x={C} y={C + 26} text-anchor="middle" class="cc-semaines">{semaines} semaines</text>
      </svg>
    </div>
  );
}

/**
 * Couleur de l'enfant en feuille du bas (Vision 1.1) : même règle que l'écran Contrat (`Contrat.tsx`) : couleurs des autres
 * enfants en cours grisées avec leur prénom ; toutes prises : choix libre. Le numéro de couleur est le seul champ écrit.
 */
function CouleurSheet({ c, onClose }: { c: Contract; onClose: () => void }) {
  const s = useStore();
  const [color, setColor] = useState(c.color % CHILD_COLORS.length);
  const prises = couleursPrises(s.contracts, c.id, today());
  return (
    <Sheet title={`Couleur ${de(c.child)}`} onClose={onClose}>
      <div class="couleurs couleurs-feuille" role="radiogroup" aria-label="Sa couleur">
        {CHILD_COLORS.map((_, i) => {
          // Toutes prises (plus de 8 enfants en cours) : on laisse choisir librement.
          const par = prises.size < CHILD_COLORS.length ? prises.get(i) : undefined;
          return (
            <span class="couleur-case">
              <button class="couleur" role="radio" aria-checked={color === i} disabled={!!par && color !== i} onClick={() => setColor(i)} aria-label={par ? `${COLOR_NAMES[i]}, déjà prise par ${par}` : COLOR_NAMES[i]}>
                <Gommette name={par ?? (c.child || '?')} color={i} />
              </button>
              <span class="couleur-nom" aria-hidden="true">{par ?? COLOR_NAMES[i]}</span>
            </span>
          );
        })}
      </div>
      <span class="hint">
        <b>{COLOR_NAMES[color]}</b>
        {prises.size > 0 && prises.size < CHILD_COLORS.length && ` · grisées : déjà prises par ${[...new Set(prises.values())].join(', ')}`}
      </span>
      {prises.get(color) && prises.size < CHILD_COLORS.length && (
        <span class="hint warn">Même couleur que {prises.get(color)} : choisis-en une libre pour les distinguer d’un coup d’œil.</span>
      )}
      <button class="btn btn-primary btn-block btn-lg" onClick={async () => {
        if (color !== c.color % CHILD_COLORS.length) await putContract({ ...(s.contracts.find((x) => x.id === c.id) ?? c), color });
        onClose();
      }}>Enregistrer</button>
    </Sheet>
  );
}

/** Écran 13 : les parents et leur lien */
export function ParentsEnfant({ id }: { id: string }) {
  const s = useStore();
  const c = s.contracts.find((x) => x.id === id);
  const [email, setEmail] = useState(c?.parentEmail ?? '');
  const [tel, setTel] = useState(c?.parentTel ?? '');
  if (!c) return <Introuvable titre="Les parents" />;
  const change = email.trim() !== (c.parentEmail ?? '') || tel.trim() !== (c.parentTel ?? '');
  return (
    <>
      <Topbar title={`Les parents ${de(c.child)}`} back={`#/enfant/${c.id}`} screen="parents" />
      <main>
        <section class="card stack">
          <dl class="kv"><dt>Employeur</dt><dd>{c.family ? `Famille ${c.family}` : 'non indiqué'}</dd></dl>
          <TextInput label="E-mail du parent employeur (facultatif)" type="email" inputMode="email" value={email} onChange={setEmail} />
          <TextInput label="Téléphone du parent employeur (facultatif)" type="tel" inputMode="tel" value={tel} onChange={setTel} />
          {change && <button class="btn btn-secondary" onClick={async () => {
            const n: Contract = { ...c, parentEmail: email.trim() || undefined, parentTel: tel.trim() || undefined };
            if (!n.parentEmail) delete n.parentEmail;
            if (!n.parentTel) delete n.parentTel;
            const prev = await putContract(n);
            logUsage('contact_parent_modifie', 'parents');
            toast('Contact enregistré', prev ? async () => { await putContract(prev); } : undefined);
          }}>Enregistrer le contact</button>}
        </section>
        <PartageCard cid={c.id} />
      </main>
    </>
  );
}

/** Écran 14 : absences et congés de l'enfant */
export function AbsencesEnfant({ id }: { id: string }) {
  const s = useStore();
  const c = s.contracts.find((x) => x.id === id);
  const [sheet, setSheet] = useState<null | 'jour' | 'enfant' | 'am'>(null);
  const [jourAbs, setJourAbs] = useState('');
  if (!c) return <Introuvable titre="Absences et congés" />;
  const t = today();
  const cp = c.accueilOccasionnel ? undefined : compteursCP(ctxFor(c), t, s.settings.enfantsACharge);
  const depuis = addDays(t, -90);
  const siennes = [...s.days.values()].filter((d) => d.cid === c.id && d.abs && d.date >= depuis).sort((a, b) => (a.date < b.date ? -1 : 1));
  const tiennes = s.leaves.filter((l) => l.to >= depuis && l.from <= (c.end ?? '9999-12-31') && l.to >= c.start).sort((a, b) => (a.from < b.from ? -1 : 1));
  const ligne = (texte: string, quand: string) => <ListLink title={texte} sub={quand} />;
  const aVenir = [...siennes.filter((d) => d.date > t).map((d) => ligne(`${c.child} : ${CHILD_ABS_LABEL[d.abs!]}`, shortDate(d.date))), ...tiennes.filter((l) => l.to >= t).map((l) => ligne(`Toi : ${AM_ABS_LABEL[l.type]}`, l.from === l.to ? shortDate(l.from) : `du ${shortDate(l.from)} au ${shortDate(l.to)}`))];
  const passees = [...siennes.filter((d) => d.date <= t).map((d) => ligne(`${c.child} : ${CHILD_ABS_LABEL[d.abs!]}`, shortDate(d.date))), ...tiennes.filter((l) => l.to < t).map((l) => ligne(`Toi : ${AM_ABS_LABEL[l.type]}`, l.from === l.to ? shortDate(l.from) : `du ${shortDate(l.from)} au ${shortDate(l.to)}`))];
  return (
    <>
      <Topbar title={`Absences et congés ${de(c.child)}`} back={`#/enfant/${c.id}`} screen="absences-enfant" />
      <main>
        {cp ? (
          <section class="card stack">
            <div class="cp-tuiles">
              <div><b class="num">{nb(cp.droits)}</b><span>droits à prendre</span></div>
              <div><b class="num">{nb(cp.pris)}</b><span>déjà pris</span></div>
              <div><b class="num">{nb(cp.poses)}</b><span>posés, à venir</span></div>
              <div><b class="num">{nb(cp.reste)}</b><span>reste à poser d’ici le {shortDate(cp.dateLimite)}</span></div>
            </div>
            <a class="btn btn-ghost" href="#/conges">Tous mes congés</a>
          </section>
        ) : null}
        <h2 class="section-title">À venir</h2>
        {aVenir.length ? <div class="list">{aVenir}</div> : <p class="hint">Aucune absence prévue.</p>}
        <h2 class="section-title">Passées (3 derniers mois)</h2>
        {passees.length ? <div class="list">{passees}</div> : <p class="hint">Aucune absence.</p>}
        <button class="btn btn-primary btn-block" onClick={() => { setJourAbs(''); setSheet('jour'); }}>Déclarer une absence {de(c.child)}</button>
        <button class="btn btn-outline btn-block" onClick={() => setSheet('am')}><Icon name="calendar" />Déclarer mon absence (tous mes contrats)</button>
      </main>
      {/* Relecture m2 : le jour d'abord (passé ou à venir), puis la feuille existante de ce jour. */}
      {sheet === 'jour' && (
        <Sheet title={`Absence ${de(c.child)}`} onClose={() => setSheet(null)}>
          <DateInput label="Jour de l’absence" value={jourAbs} min={c.start} max={c.end} onChange={setJourAbs} />
          <button class="btn btn-primary btn-block" disabled={!jourAbs} onClick={() => setSheet('enfant')}>Continuer</button>
        </Sheet>
      )}
      {sheet === 'enfant' && jourAbs && <DaySheet c={c} day={jourAbs} onClose={() => setSheet(null)} />}
      {sheet === 'am' && <AmAbsenceSheet start={t} onClose={() => setSheet(null)} />}
    </>
  );
}

/** Contrats en cours de saisie (Plus, Aujourd'hui) : « étape N sur 6 · Reprendre » */
export function BrouillonsEnCours({ liste = false }: { liste?: boolean }) {
  const ls = useBrouillons();
  if (!ls.length) return null;
  const debut = `${monthOf(today())}-01`;
  const etat = (b: (typeof ls)[number]) => (b.etape >= 7 ? 'récapitulatif' : `étape ${b.etape} sur ${nbEtapes(b.c, debut)}, ${NOMS_ETAPES[b.etape - 1].toLowerCase()}`);
  const texte = (b: (typeof ls)[number]) => `Contrat ${de(b.c.child || 'sans prénom')} en cours de saisie : ${etat(b)}`;
  if (liste) return (
    <>
      {ls.map((b) => (
        <ListLink href={`#/ajout/${b.id}`} icon={<Gommette name={b.c.child || '?'} color={b.c.color} />} title={b.c.child || 'Sans prénom'} sub={`Contrat en cours de saisie : ${etat(b)}`} end={<span class="tag">Reprendre</span>} />
      ))}
    </>
  );
  return (
    <>
      {ls.map((b) => (
        <Banner tone="info" icon="file">
          <span>{texte(b)}.</span>
          <div class="btn-row">
            <a class="btn btn-outline" href={`#/ajout/${b.id}`}>Reprendre</a>
            <SupprimerBrouillon b={b} ecran="aujourdhui" />
          </div>
        </Banner>
      ))}
    </>
  );
}
