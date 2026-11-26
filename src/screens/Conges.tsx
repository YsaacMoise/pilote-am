import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, deleteLeave, putLeave, toast, useStore, state } from '../store';
import { cpPeriodStartYear, dayLabel, today, shortDate } from '../engine/dates';
import { compteur, decompteConge, indemnite, MESSAGE_SOLDE_CONGES, soldeCongesInconnu, soldesDepartAConfirmer } from '../engine/conges';
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
  return (
    <>
      <Topbar title="Congés et absences" back="#/plus" screen="conges" />
      <main>
        <p class="muted">Période en cours : du 1er juin {y} au 31 mai {y + 1}. Tu gagnes 2,5 jours ouvrables par mois d’accueil (30 au plus), et 2 par mois pendant un arrêt maladie, à prendre l’année suivante.</p>
        {list.map((c) => {
          // T-104 (cas 2) : accueil occasionnel, pas de compteur : 10 % des salaires versés à la fin de chaque accueil (CCN 102.1.2.3).
          if (c.accueilOccasionnel) return (
            <section class="card stack" aria-label={`Congés, contrat ${de(c.child)}`}>
              <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2></div>
              <p>Accueil occasionnel : tes congés payés valent 10 % des salaires de chaque accueil. Ils te sont versés à la fin de l’accueil, avec le salaire du mois (convention, article 102.1.2.3).</p>
            </section>
          );
          const ctx = ctxFor(c);
          const k = compteur(ctx, t, s.settings.enfantsACharge);
          const ind = indemnite(ctx, y, s.settings.enfantsACharge);
          return (
            <section class="card stack" aria-label={`Congés, contrat ${de(c.child)}`}>
              <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2></div>
              {/* T-119 : congés de départ calculés par l'app, en attente de la réponse de l'AM (un geste). */}
              {soldesDepartAConfirmer(ctx.c) && <details class="more" open style={{ boxShadow: 'none', border: '1px solid var(--line)' }}><summary>Tes congés au début du suivi</summary><div class="more-body"><CongesDepart c={c} /></div></details>}
              <div class="stat-grid">
                {/* T-103 : un nombre qui dépend d'une donnée à saisir n'est pas affiché ; la donnée est demandée plus bas. */}
                <div><b class="num">{k.aPrendreAConfirmer ? '—' : k.aPrendre}</b><span>jours à prendre d’ici le 31 mai</span></div>
                <div><b class="num">{k.decompteAConfirmer.length ? '—' : k.pris}</b><span>déjà pris</span></div>
                <div><b class="num">{k.aPrendreAConfirmer || k.decompteAConfirmer.length ? '—' : Math.max(0, k.reste)}</b><span>restants</span></div>
              </div>
              {k.enCours.aConfirmer
                ? <p>En cours d’acquisition : <b>non calculé</b> (voir ci-dessous).</p>
                : <p>En cours d’acquisition : <b>{k.enCours.joursADate} jours</b> à ce jour, <b>{k.enCours.jours}</b> au 31 mai{k.enCours.enfantsBonus ? ` (dont ${k.enCours.enfantsBonus} pour tes propres enfants à charge)` : ''}.</p>}
              {[...new Set([k.enCours.aConfirmer?.message, k.aPrendreAConfirmer?.message, ...k.decompteAConfirmer].filter(Boolean))].map((m) => <Banner tone="warn">{m}</Banner>)}
              {k.fractionnementNonGere && <Banner tone="warn">{k.fractionnementNonGere}</Banner>}
              {/* T-116 (A2) : solde de départ jamais donné : une invite, pas d'alerte de retenue. */}
              {k.depassement && !soldesDepartAConfirmer(ctx.c) && (soldeCongesInconnu(ctx.c)
                ? <Banner tone="info"><span>{MESSAGE_SOLDE_CONGES}</span><a class="btn btn-outline" href={`#/contrat/${c.id}`}>Indiquer mon solde</a></Banner>
                : <Banner tone="warn">Tu as pris plus de jours que tes droits : les jours en trop sont normalement sans solde.</Banner>)}
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
        })}
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
