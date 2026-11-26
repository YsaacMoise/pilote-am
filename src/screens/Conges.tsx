import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, deleteLeave, putLeave, toast, useStore, state } from '../store';
import { addMonths, cpPeriodStartYear, dayLabel, firstDay, monthLabel, monthOf, today, shortDate, weekday, type Month } from '../engine/dates';
import { compteursCP, joursCalendrier, regionDe } from '../engine/compteurs-cp';
import { decompteConge, indemnite, MESSAGE_SOLDE_CONGES, soldeCongesInconnu, soldesDepartAConfirmer } from '../engine/conges';
import { CongesDepart } from './CongesDepart';
import { euros } from '../engine/money';
import { EVENEMENTS_GERES_DEPUIS } from '../engine/evenements';
import { AM_ABS_LABEL, AM_SUSPENSIONS, NATURE_ATMP_LABEL, type AmLeave, type AmSuspension, type Contract, type NatureAtMp } from '../engine/model';
import { donneeSuspensionManquante } from '../engine/suspensions';
import { Banner, Choices, EuroInput, Gommette, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { AmAbsenceSheet, demandeIJ } from './Today';
import type { ChoixAbsence } from '../engine/absences';
import { de } from '../engine/texte';

export function Conges() {
  const s = useStore();
  const t = today();
  const [add, setAdd] = useState(false);
  const y = cpPeriodStartYear(t);
  const list = s.contracts.filter((c) => !c.end || c.end >= t);
  const suivis = list.filter((c) => !c.accueilOccasionnel);
  // T-118 : calendrier de suivi des congés, tous contrats réunis (« tous ») ou un contrat.
  const [vue, setVue] = useState<string>(suivis.length > 1 ? 'tous' : suivis[0]?.id ?? 'tous');
  const choisi = list.find((c) => c.id === vue);
  return (
    <>
      <Topbar title="Congés et absences" back="#/plus" screen="conges" />
      <main>
        <p class="muted">Période en cours : du 1er juin {y} au 31 mai {y + 1}. Tu acquiers 2,5 jours ouvrables par mois de travail (30 au plus), et 2 par mois d’arrêt maladie, à prendre l’année suivante.</p>
        {list.length > 1 && (
          <div class="chips" role="group" aria-label="Contrat">
            {suivis.length > 1 && <button class="chip" aria-pressed={vue === 'tous'} onClick={() => setVue('tous')}><Icon name="calendar" size={18} />Tous</button>}
            {list.map((k) => (
              <button class="chip" aria-pressed={k.id === vue} onClick={() => setVue(k.id)}><Gommette name={k.child} color={k.color} size="sm" />{k.child}</button>
            ))}
          </div>
        )}
        {/* Un seul contrat : le calendrier, puis les compteurs du contrat (pas de tableau « tous contrats »). */}
        {suivis.length <= 1 && <CongesTous contrats={suivis} t={t} enfants={s.settings.enfantsACharge} leaves={s.leaves} onChoisir={setVue} tableau={false} />}
        {(vue === 'tous' || !choisi) && suivis.length > 1
          ? <CongesTous contrats={suivis} t={t} enfants={s.settings.enfantsACharge} leaves={s.leaves} onChoisir={setVue} />
          : choisi && <CongesContrat c={choisi} t={t} enfants={s.settings.enfantsACharge} leaves={s.leaves} />}
        <section class="stack-sm" aria-labelledby="abs-t">
          <div class="spread"><h2 id="abs-t" class="section-title">Mes absences</h2></div>
          {s.leaves.length === 0 ? (
            <p class="muted">Aucune absence enregistrée.</p>
          ) : (
            <div class="list">
              {[...s.leaves].reverse().map((l) => (
                <div class="li">
                  <span class="li-main">
                    <span class="li-title">{AM_ABS_LABEL[l.type]}</span>
                    <span class="li-sub">{l.from === l.to ? dayLabel(l.from, true) : `Du ${shortDate(l.from)} au ${shortDate(l.to)}`}{l.type === 'cp' ? decompteTexte(l, list) : ''}{l.type === 'evenement' ? (l.joursEvenement === undefined ? '' : l.from < EVENEMENTS_GERES_DEPUIS ? ' · période non gérée (avant 2022, ancienne convention)' : l.joursEvenement ? ` · ${l.joursEvenement} jour${l.joursEvenement > 1 ? 's' : ''} payé${l.joursEvenement > 1 ? 's' : ''} prévu${l.joursEvenement > 1 ? 's' : ''}` : ' · durée non gérée par l’app') : ''}{l.type === 'evenement' && l.suiteDe ? (() => { const p = s.leaves.find((x) => x.id === l.suiteDe); return p ? ` · suite de l’absence du ${shortDate(p.from).slice(0, 5)}` : ''; })() : ''}</span>
                  </span>
                  {(l.type === 'evenement' ? l.ijSecu !== undefined : l.type !== 'non_gere' && !!demandeIJ(l.type as ChoixAbsence, undefined, l.from, l.to, s.contracts)) && <IjEdit l={l} />}
                  {donneeSuspensionManquante(l) && <PreciserAbsence l={l} />}
                  <button class="icon-btn" aria-label={`Supprimer : ${AM_ABS_LABEL[l.type]} du ${shortDate(l.from)}`} onClick={async () => { const u = await deleteLeave(l.id); toast('Absence supprimée', u); }}>
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button class="btn btn-primary btn-block btn-lg" onClick={() => setAdd(true)}><Icon name="plus" />Ajouter une absence</button>
        </section>
      </main>
      {add && <AmAbsenceSheet start={t} onClose={() => setAdd(false)} />}
    </>
  );
}

const JJ = (d: string) => `${Number(d.slice(8, 10))} ${MOIS_NOMS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const nb = (n: number | undefined) => (n === undefined ? '—' : String(n));

/** T-118 : calendrier des congés de l'AM (tous contrats) et compteurs de chaque contrat */
function CongesTous({ contrats, t, enfants, leaves, onChoisir, tableau = true }: { contrats: Contract[]; t: string; enfants: number; leaves: AmLeave[]; onChoisir: (id: string) => void; tableau?: boolean }) {
  const y = cpPeriodStartYear(t);
  const [m, setM] = useState<Month>(monthOf(t));
  const debut = `${y}-06` as Month, fin = `${y + 1}-05` as Month;
  const jours = joursCalendrier(m, leaves, t, contrats[0] ? regionDe(contrats[0]) : undefined);
  const decalage = (weekday(firstDay(m)) + 6) % 7;
  const lignes = tableau ? contrats.map((c) => ({ c, x: compteursCP(ctxFor(c), t, enfants) })) : [];
  return (
    <>
      <section class="card stack" aria-labelledby="cal-t">
        <span class="tm-eyebrow" id="cal-t">Tes congés payés, du 1er juin {y} au 31 mai {y + 1}</span>
        <div class="month-nav">
          <button class="icon-btn" aria-label="Mois précédent" disabled={m <= debut} onClick={() => setM(addMonths(m, -1))}><Icon name="left" /></button>
          <h2 aria-live="polite">{monthLabel(m).replace(/^./, (x) => x.toUpperCase())}</h2>
          <button class="icon-btn" aria-label="Mois suivant" disabled={m >= fin} onClick={() => setM(addMonths(m, 1))}><Icon name="right" /></button>
        </div>
        <div class="cal-cp" role="grid" aria-label={`Congés de ${monthLabel(m)}`}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => <span class="cal-h" aria-hidden="true">{x}</span>)}
          {Array.from({ length: decalage }, () => <span class="cal-d vide" aria-hidden="true" />)}
          {jours.map((j) => (
            <span class={`cal-d ${j.type}${j.d === t ? ' auj' : ''}`} role="gridcell"
              aria-label={`${dayLabel(j.d)}${j.type === 'pris' ? ', congé pris' : j.type === 'pose' ? ', congé posé' : j.type === 'ferie' ? `, férié (${j.ferie})` : ''}${j.d === t ? ', aujourd’hui' : ''}`}>
              {Number(j.d.slice(8, 10))}
            </span>
          ))}
        </div>
        <div class="cal-legende" aria-hidden="true">
          <span><i class="l-pris" />pris</span><span><i class="l-pose" />posé, à venir</span><span><i class="l-auj" />aujourd’hui</span><span><i class="l-ferie" />férié</span>
        </div>
        <p class="hint">Décompte en jours ouvrables : du lundi au samedi, hors fériés. Pour poser des congés : « Ajouter une absence ».</p>
      </section>
      {tableau && lignes.length > 0 && (
        <section class="card stack" aria-labelledby="cpt-t">
          <span class="tm-eyebrow" id="cpt-t">Tes compteurs, contrat par contrat</span>
          <table class="cp-table">
            <thead><tr><th scope="col">Contrat</th><th scope="col">Droits</th><th scope="col">Pris</th><th scope="col">Posés</th><th scope="col">Reste</th></tr></thead>
            <tbody>
              {lignes.map(({ c, x }) => (
                <tr>
                  <th scope="row"><button class="btn-link" type="button" onClick={() => onChoisir(c.id)}>{c.child}</button></th>
                  <td>{nb(x.droits)}</td><td>{nb(x.pris)}</td><td>{nb(x.poses)}</td><td class={x.reste !== undefined && x.reste < 0 ? 'neg' : undefined}>{nb(x.reste)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="hint">Droits acquis du 1er juin {y - 1} au 31 mai {y}, à prendre avant le {JJ(lignes[0].x.dateLimite)}. Chaque contrat a ses propres droits : un jour de congé compte pour chaque contrat où c’est un jour ouvrable. « — » : nombre non calculé faute d’une donnée ; le détail est sur la fiche du contrat (touche le prénom).</p>
          <details class="more" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
            <summary>Comment c’est calculé</summary>
            <div class="more-body">
              <p><b>Droits</b> : jours acquis pendant la période précédente, du 1er juin {y - 1} au 31 mai {y} : 2,5 jours ouvrables par mois de travail, arrondis au jour supérieur, 30 au plus, plus les jours pour tes enfants à charge (convention, articles 48.1.1.2 et 48.1.3.3). Pour un contrat commencé avant l’app : le solde de départ.</p>
              <p><b>Pris</b> et <b>posés</b> : jours ouvrables (lundi au samedi, sans les fériés) de tes congés payés, du premier jour qui aurait été travaillé à la veille de la reprise (article 48.1.1.3). Pris : jusqu’à aujourd’hui ; posés : après aujourd’hui, jusqu’au 31 mai {y + 1}.</p>
              <p><b>Reste</b> = droits − pris − posés. Un reste négatif : les jours en trop sont normalement des congés sans solde.</p>
              <p>Le congé principal se prend entre le 1er mai et le 31 octobre : au moins 12 jours ouvrables de suite si tu as plus de 12 jours de droits (article 48.1.1.3).</p>
            </div>
          </details>
        </section>
      )}
    </>
  );
}

/** T-118 : compteurs d'un contrat, acquis mois par mois, chaque chiffre avec son « comment c'est calculé » */
function CongesContrat({ c, t, enfants, leaves }: { c: Contract; t: string; enfants: number; leaves: AmLeave[] }) {
  const y = cpPeriodStartYear(t);
  // T-104 (cas 2) : accueil occasionnel, pas de compteur : 10 % des salaires versés à la fin de chaque accueil (CCN 102.1.2.3).
  if (c.accueilOccasionnel) return (
    <section class="card stack" aria-label={`Congés, contrat ${de(c.child)}`}>
      <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2></div>
      <p>Accueil occasionnel : tes congés payés valent 10 % des salaires de chaque accueil. Ils te sont versés à la fin de l’accueil, avec le salaire du mois (convention, article 102.1.2.3).</p>
    </section>
  );
  const ctx = ctxFor(c);
  const x = compteursCP(ctx, t, enfants);
  const k = x.k;
  const ind = indemnite(ctx, y, enfants);
  const maxMois = Math.max(2.5, ...x.mois.map((a) => a.duMois));
  const finAcquis = x.mois.filter((a) => a.passe && !a.avantSuivi).pop();
  const debutSuivi = y === cpPeriodStartYear(c.trackedFrom) && c.trackedFrom > c.start;
  const congesPeriode = leaves.filter((l) => l.type === 'cp' && l.to >= `${y}-06-01` && l.from <= x.dateLimite);
  return (
    <section class="card stack" aria-label={`Congés, contrat ${de(c.child)}`}>
      <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2>{c.family && <span class="muted">famille {c.family}</span>}</div>
      {/* T-119 : congés de départ calculés par l'app, en attente de la réponse de l'AM (un geste). */}
      {soldesDepartAConfirmer(ctx.c) && <details class="more" open style={{ boxShadow: 'none', border: '1px solid var(--line)' }}><summary>Tes congés au début du suivi</summary><div class="more-body"><CongesDepart c={c} /></div></details>}
      <div class="cp-tuiles">
        {/* T-103 : un nombre qui dépend d'une donnée à saisir n'est pas affiché ; la donnée est demandée plus bas. */}
        <div><b class="num">{nb(x.droits)}</b><span>droits à prendre</span></div>
        <div><b class="num">{nb(x.pris)}</b><span>déjà pris</span></div>
        <div><b class="num">{nb(x.poses)}</b><span>posés, à venir</span></div>
        <div><b class={`num${x.reste !== undefined && x.reste < 0 ? ' neg' : ''}`}>{nb(x.reste)}</b><span>reste à poser avant le {JJ(x.dateLimite)}</span></div>
      </div>
      {[...new Set([k.enCours.aConfirmer?.message, k.aPrendreAConfirmer?.message, ...k.decompteAConfirmer].filter(Boolean))].map((m) => <Banner tone="warn">{m}</Banner>)}
      {k.fractionnementNonGere && <Banner tone="warn">{k.fractionnementNonGere}</Banner>}
      {/* T-116 (A2) : solde de départ jamais donné : une invite, pas d'alerte de retenue. */}
      {k.depassement && !soldesDepartAConfirmer(ctx.c) && (soldeCongesInconnu(ctx.c)
        ? <Banner tone="info"><span>{MESSAGE_SOLDE_CONGES}</span><a class="btn btn-outline" href={`#/contrat/${c.id}`}>Indiquer mon solde</a></Banner>
        : <Banner tone="warn">Tu as pris plus de jours que tes droits : les jours en trop sont normalement sans solde.</Banner>)}
      <details class="more" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
        <summary>Comment ces chiffres sont calculés</summary>
        <div class="more-body">
          <p><b>Droits à prendre ({nb(x.droits)})</b> : {y === cpPeriodStartYear(c.trackedFrom)
            ? (c.trackedFrom > c.start ? `solde de départ du contrat : congés acquis avant le 1er juin ${y} et pas encore pris au début du suivi par l’app.` : `contrat commencé pendant cette période : aucun droit de la période précédente.`)
            : `jours acquis du 1er juin ${y - 1} au 31 mai ${y} : 2,5 jours ouvrables par mois de travail, arrondis au jour supérieur, 30 au plus${enfants ? ', plus 2 jours par enfant à charge' : ''} (convention, articles 48.1.1.2 et 48.1.3.3).`}</p>
          <p><b>Déjà pris ({nb(x.pris)})</b> et <b>posés ({nb(x.poses)})</b> : jours ouvrables (lundi au samedi, sans les fériés) de tes congés payés, du premier jour qui aurait été travaillé à la veille de la reprise (article 48.1.1.3){congesPeriode.length ? ` ; congés de la période : ${congesPeriode.map((l) => `du ${shortDate(l.from)} au ${shortDate(l.to)}`).join(', ')}` : ''}.</p>
          <p><b>Reste ({nb(x.reste)})</b> = droits − pris − posés{x.reste !== undefined ? ` = ${nb(x.droits)} − ${nb(x.pris)} − ${nb(x.poses)}` : ''}. Date limite : le {JJ(x.dateLimite)}, fin de la période suivie par l’app. Le congé principal se prend entre le 1er mai et le 31 octobre (article 48.1.1.3).</p>
        </div>
      </details>
      {k.enCours.aConfirmer
        ? <p>En cours d’acquisition : <b>non calculé</b> (voir ci-dessus).</p>
        : (
          <div class="stack-sm">
            <span class="tm-eyebrow">Acquis du 1er juin {y} au 31 mai {y + 1}, mois par mois</span>
            <div class="cp-barres" aria-hidden="true">
              {x.mois.map((a) => <div class={a.avantSuivi ? 'avant' : a.passe ? 'passe' : 'futur'} style={{ height: `${Math.round((a.duMois / maxMois) * 100)}%` }} />)}
            </div>
            <div class="cp-barres-l" aria-hidden="true">{x.mois.map((a) => <span>{MOIS_NOMS[Number(a.m.slice(5, 7)) - 1][0].toUpperCase()}</span>)}</div>
            <p><b>{k.enCours.joursADate} jours</b> acquis à ce jour{finAcquis ? ` (${finAcquis.jours} à la fin de ${MOIS_NOMS[Number(finAcquis.m.slice(5, 7)) - 1]})` : ''}, <b>{k.enCours.jours}</b> au 31 mai {y + 1}{k.enCours.enfantsBonus ? ` (dont ${k.enCours.enfantsBonus} pour tes propres enfants à charge)` : ''}, à prendre à partir du 1er juin {y + 1}.</p>
            <details class="more" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
              <summary>Détail mois par mois</summary>
              <div class="more-body">
                <table class="cp-table">
                  <thead><tr><th scope="col">Mois</th><th scope="col">Acquis (jours)</th><th scope="col">Cumul</th></tr></thead>
                  <tbody>
                    {debutSuivi && <tr><th scope="row">Avant l’app (solde de départ)</th><td>{c.balances.cpEnCours.toLocaleString('fr-FR')}</td><td></td></tr>}
                    {x.mois.filter((a) => !a.avantSuivi).map((a) => (
                      <tr class={a.passe ? undefined : 'futur'}>
                        <th scope="row">{monthLabel(a.m)}{a.passe ? '' : ' (prévu)'}</th>
                        <td>{(Math.round(a.duMois * 100) / 100).toLocaleString('fr-FR')}</td>
                        <td>{a.jours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p class="muted small">Cumul : jours acquis du 1er juin au dernier jour du mois, arrondis au jour supérieur (convention, article 48.1.1.2). Méthode de la Cour de cassation (10 janvier 1980) : mois complets de travail, puis semaines, puis jours, au prorata. Avec une absence dans la période, l’app retient le décompte le plus favorable (par mois, par semaines ou par jours ; code du travail, L3141-4). Mois à venir : si le contrat continue comme prévu. {debutSuivi ? `Le cumul comprend le solde de départ (${c.balances.cpEnCours.toLocaleString('fr-FR')} jours acquis avant l’app, depuis le 1er juin).` : ''} Les jours pour tes enfants à charge s’ajoutent au 31 mai (article 48.1.3.3).</p>
              </div>
            </details>
          </div>
        )}
      <details class="more" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
        <summary>Indemnité de cette période, si le contrat continue comme prévu</summary>
        <div class="more-body">
          {ind.aConfirmer ? <p>{ind.aConfirmer.message}</p> : ind.manquants.length > 0 ? <p class="err">Bulletins manquants dans l’historique : ajoute-les. Le dixième n’est pas calculé sans eux.</p> : <dl class="kv">
            <dt>Règle du dixième</dt><dd>{euros(ind.dixieme)}</dd>
            <dt>Maintien du salaire</dt><dd>{euros(ind.maintien)}</dd>
            <dt>Le plus favorable</dt><dd>{euros(ind.montant)}</dd>
          </dl>}
          <p class="muted small">
            {termsAt(c, today()).yearType === 'complete'
              ? 'Année complète : tes congés sont payés dans le salaire mensualisé ; si le dixième est plus favorable, la différence est versée en juin.'
              : c.cpMode === 'juin' ? 'Année incomplète : versée en juin.' : c.cpMode === 'principale' ? 'Année incomplète : versée avec ta prise principale de congés.' : 'Année incomplète : versée au fur et à mesure des congés pris.'}
            {' '}Le dixième compte les salaires de toute la période, ceux à venir selon ton planning.
          </p>
        </div>
      </details>
    </section>
  );
}

/**
 * T-104 : donnée qui manque à une absence (saisie d'avant « non gérée » sans sa raison ; arrêt pour accident sans sa nature
 * ou sans le jour de l'accident). Demandée une fois ici ; le mois est calculé dès que c'est enregistré.
 */
function PreciserAbsence({ l }: { l: AmLeave }) {
  const [type, setType] = useState<AmSuspension | undefined>(l.type === 'non_gere' ? undefined : (l.type as AmSuspension));
  const [atmp, setAtmp] = useState<NatureAtMp | undefined>(l.atmp);
  const [jour, setJour] = useState<'oui' | 'non' | undefined>(l.jourAccident === undefined ? undefined : l.jourAccident ? 'oui' : 'non');
  const complet = !!type && (type !== 'at_mp' || (!!atmp && (atmp === 'maladie_pro' || !!jour)));
  return (
    <div class="stack-sm">
      <Banner tone="info">{donneeSuspensionManquante(l)}</Banner>
      {l.type === 'non_gere' && (
        <Choices label="C’était :" value={type} onChange={setType}
          options={AM_SUSPENSIONS.map((v) => ({ v, l: AM_ABS_LABEL[v] }))} />
      )}
      {type === 'at_mp' && <Choices label="C’est :" value={atmp} onChange={setAtmp} options={(Object.keys(NATURE_ATMP_LABEL) as NatureAtMp[]).map((v) => ({ v, l: NATURE_ATMP_LABEL[v] }))} />}
      {type === 'at_mp' && atmp && atmp !== 'maladie_pro' && (
        <Choices label="Le premier jour de l’absence est-il le jour de l’accident ?" value={jour} onChange={setJour}
          options={[{ v: 'oui', l: 'Oui', sub: 'Ce jour-là est payé en entier par les parents (code de la sécurité sociale, article L433-1).' }, { v: 'non', l: 'Non, l’arrêt commence après' }]} />
      )}
      {complet && (
        <button class="btn btn-outline" onClick={async () => {
          const { atmp: _a, jourAccident: _j, ...reste } = l;
          const n: AmLeave = { ...reste, type: type! };
          if (type === 'at_mp') { n.atmp = atmp; if (atmp !== 'maladie_pro') n.jourAccident = jour === 'oui'; }
          const u = await putLeave(n);
          toast('Absence précisée', u);
        }}>Enregistrer</button>
      )}
    </div>
  );
}

/** T-103 (C9, R3) : montant net des indemnités journalières d'une absence, saisi ou corrigé après coup */
function IjEdit({ l }: { l: AmLeave }) {
  const [v, setV] = useState<number | undefined>(l.ijSecu);
  const [a, setA] = useState<number | undefined>(l.ijSalairesAutres);
  const change = (v !== l.ijSecu || a !== l.ijSalairesAutres) && v !== undefined && a !== undefined;
  return (
    <div class="stack-sm">
      <EuroInput label="Indemnités journalières reçues (net)" cents={v} allowEmpty onChange={setV} hint={l.ijSecu === undefined ? 'Pas encore saisi : le mois de cette absence attend ce montant (0 si tu n’en as pas reçu).' : undefined} />
      <EuroInput label="Salaires bruts des 3 mois avant l’absence, hors de l’app" cents={a} allowEmpty onChange={setA} hint="Autres employeurs, et mois d’avant le suivi par l’app (attestations Pajemploi). 0 si aucun." />
      {change && <button class="btn btn-outline" onClick={async () => { const u = await putLeave({ ...l, ijSecu: v, ijSalairesAutres: a }); toast('Montants enregistrés', u); }}>Enregistrer</button>}
    </div>
  );
}

/** Jours décomptés d'un congé, contrat par contrat (chaque planning donne son décompte, R-CP-09) */
function decompteTexte(l: AmLeave, contrats: Contract[]): string {
  const res = contrats.map((c) => ({ c, d: decompteConge(ctxFor(c), l) }));
  if (!res.length) return '';
  if (res.some((r) => r.d.demande)) return ', une autre absence est saisie sur ces jours';
  const n = res[0].d.jours;
  if (res.every((r) => r.d.jours === n)) return `, ${n} jour${n > 1 ? 's' : ''} ouvrable${n > 1 ? 's' : ''} décompté${n > 1 ? 's' : ''}`;
  return `, ${res.map((r) => `${r.d.jours} jour${r.d.jours > 1 ? 's' : ''} pour ${r.c.child}`).join(', ')}`;
}

export { state };
