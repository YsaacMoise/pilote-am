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
import { Banner, DateInput, Gommette, ListLink, Sheet, TextInput, Topbar } from '../ui/kit';
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
          <p class="hint">Premier mois suivi par Arvela, depuis le {shortDate(c.trackedFrom > `${m}-01` ? c.trackedFrom : `${m}-01`)}.</p>
          <dl class="kv">
            <dt>Accueil prévu</dt><dd>{prevus.length} jour{prevus.length > 1 ? 's' : ''}, {hoursLabel(minPrevues)}</dd>
            {feries.length > 0 && <><dt>Jour{feries.length > 1 ? 's' : ''} férié{feries.length > 1 ? 's' : ''}</dt><dd>{feries.map((di) => `${Number(di.date.slice(8))} ${MOIS_NOMS[Number(di.date.slice(5, 7)) - 1]}`).join(', ')}</dd></>}
            {!c.accueilOccasionnel && <><dt>Mensualisation</dt><dd>{hoursLabel(Math.round(b.mensuelMin))}, {joursMensualises(termsAt(c, today()))} jours</dd></>}
            {!c.accueilOccasionnel && <><dt>Salaire de base</dt><dd>{euros(b.salaireMens)} net</dd></>}
          </dl>
          <p class="hint">Les journées suivent le planning : note seulement les écarts dans Aujourd’hui.</p>
          <a class="btn btn-primary btn-block" href={`#/mois/${m}/${c.id}`}>Voir {monthLabel(m)} dans Mois</a>
        </section>
        <h2 class="section-title">Ensuite</h2>
        <div class="list">
          <ListLink href={`#/enfant/${c.id}/parents`} icon="users" title="Créer le lien des parents" sub={`Ils suivent la journée ${de(c.child)}`} />
          {avant && <ListLink href={`#/historique/${c.id}`} icon="file" title="Bulletins d’avant Arvela" sub={`Avant le ${shortDate(c.trackedFrom)}`} end={<span class="tag">Facultatif</span>} />}
          <ListLink href={`#/enfant/${c.id}`} icon={<Gommette name={c.child} color={c.color} />} title={`La fiche ${de(c.child)}`} sub="Contrat, planning, parents, absences, carnet" />
        </div>
      </main>
    </>
  );
}

/** Écran 12 : fiche de l'enfant */
export function FicheEnfant({ id }: { id: string }) {
  const s = useStore();
  const c = s.contracts.find((x) => x.id === id);
  if (!c) return <Introuvable titre="Fiche" />;
  const t = today();
  const tc = termsAt(c, t);
  const cp = c.accueilOccasionnel ? undefined : compteursCP(ctxFor(c), t, s.settings.enfantsACharge);
  const avant = c.trackedFrom > c.start;
  const journee = s.journal.filter((j) => j.cid === c.id && j.date === t).length;
  return (
    <>
      <Topbar title={c.child} sub={libelleDebut(c, t)} back="#/plus" screen="fiche" />
      <main>
        <div class="stat-grid">
          <div><b class="num">{c.accueilOccasionnel ? '—' : tc.planningVariable ? 'Variable' : hoursLabel(weeklyMinutes(tc.planning))}</b><span>{c.accueilOccasionnel ? 'accueil occasionnel' : 'par semaine'}</span></div>
          <div><b class="num">{euros(tc.rateNet)}</b><span>net de l’heure</span></div>
          <div><b class="num">{cp ? nb(cp.reste) : '10 %'}</b><span>{cp ? 'jours de congés à poser' : 'congés versés à chaque accueil'}</span></div>
        </div>
        <div class="list">
          <ListLink href={`#/contrat/${c.id}`} icon="file" title="Le contrat" sub={libelleContrat(c, t)} />
          {!c.accueilOccasionnel && <ListLink href={`#/contrat/${c.id}`} icon="clock" title="Le planning" sub={tc.planningVariable ? 'Horaires qui changent' : `${hoursLabel(weeklyMinutes(tc.planning))} par semaine`} />}
          <ListLink href={`#/enfant/${c.id}/parents`} icon="users" title="Les parents et leur lien" sub={c.partage ? 'Lien actif' : 'Lien pas encore créé'} end={c.partage ? undefined : <span class="tag">À faire</span>} />
          <ListLink href={`#/enfant/${c.id}/absences`} icon="sun" title="Absences et congés" sub="Les siennes, les tiennes, le compteur" />
          <ListLink href="#/carnet" icon="book" title="Son carnet" sub={journee ? `${journee} note${journee > 1 ? 's' : ''} aujourd’hui` : 'Aucune note aujourd’hui'} />
          {avant && <ListLink href={`#/historique/${c.id}`} icon="receipt" title="Bulletins d’avant Arvela" sub={`Avant le ${shortDate(c.trackedFrom)} · ${c.history.length} saisi${c.history.length > 1 ? 's' : ''}`} end={<span class="tag">Facultatif</span>} />}
        </div>
        <div class="list">
          <ListLink href={`#/avenant/${c.id}/nouveau`} icon="plus" title="Changer le contrat (avenant)" sub={c.avenants?.length ? `${c.avenants.length} avenant${c.avenants.length > 1 ? 's' : ''} déjà enregistré${c.avenants.length > 1 ? 's' : ''}` : undefined} />
          <ListLink href={`#/fin/${c.id}`} icon="door" title="Fin du contrat" sub={c.end ? `Dernier jour : ${shortDate(c.end)}` : undefined} />
        </div>
      </main>
    </>
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
          <TextInput label="Téléphone du parent employeur (facultatif)" type="tel" inputMode="tel" value={tel} onChange={setTel} hint="Gardés avec le contrat, sur ce téléphone et dans ton compte. Jamais sur la page des parents." />
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
            <a class="btn btn-ghost" href="#/conges">Comment c’est calculé, et tous mes contrats</a>
          </section>
        ) : <p class="hint">Accueil occasionnel : congés payés de 10 % des salaires, versés à la fin de chaque accueil (convention, article 102.1.2.3).</p>}
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
