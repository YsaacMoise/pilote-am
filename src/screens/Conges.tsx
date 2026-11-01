import { termsAt } from '../engine/payroll';
import { useState } from 'preact/hooks';
import { ctxFor, deleteLeave, toast, useStore, state } from '../store';
import { cpPeriodStartYear, dayLabel, today, shortDate } from '../engine/dates';
import { compteur, indemnite, joursOuvrables } from '../engine/conges';
import { euros } from '../engine/money';
import { AM_ABS_LABEL } from '../engine/model';
import { Banner, Gommette, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { AmAbsenceSheet } from './Today';

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
        <p class="muted">Période en cours : du 1er juin {y} au 31 mai {y + 1}. Tu gagnes 2,5 jours ouvrables par mois d’accueil (30 au plus), à prendre l’année suivante.</p>
        {list.map((c) => {
          const ctx = ctxFor(c);
          const k = compteur(ctx, t, s.settings.enfantsACharge);
          const ind = indemnite(ctx, y, s.settings.enfantsACharge);
          return (
            <section class="card stack" aria-label={`Congés, contrat de ${c.child}`}>
              <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2></div>
              <div class="stat-grid">
                <div><b class="num">{k.aPrendre}</b><span>jours à prendre d’ici le 31 mai</span></div>
                <div><b class="num">{k.pris}</b><span>déjà pris</span></div>
                <div><b class="num">{Math.max(0, k.reste)}</b><span>restants</span></div>
              </div>
              <p>En cours d’acquisition : <b>{k.enCours.joursADate} jours</b> à ce jour, <b>{k.enCours.jours}</b> au 31 mai{k.enCours.enfantsBonus ? ` (dont ${k.enCours.enfantsBonus} pour tes propres enfants à charge)` : ''}.</p>
              {k.depassement && <Banner tone="warn">Tu as pris plus de jours que tes droits : les jours en trop sont normalement sans solde.</Banner>}
              <details class="more" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
                <summary>Indemnité estimée pour cette période</summary>
                <div class="more-body">
                  <dl class="kv">
                    <dt>Règle du dixième</dt><dd>{euros(ind.dixieme)}</dd>
                    <dt>Maintien du salaire</dt><dd>{euros(ind.maintien)}</dd>
                    <dt>Le plus favorable</dt><dd>{euros(ind.montant)}</dd>
                  </dl>
                  <p class="muted small">
                    {termsAt(c, today()).yearType === 'complete'
                      ? 'Année complète : tes congés sont payés dans le salaire mensualisé ; si le dixième est plus favorable, la différence est versée en juin.'
                      : c.cpMode === 'juin' ? 'Année incomplète : versée en juin.' : c.cpMode === 'principale' ? 'Année incomplète : versée avec ta prise principale de congés.' : 'Année incomplète : versée au fur et à mesure des congés pris.'}
                    {' '}Le dixième est calculé sur les salaires connus à ce jour.
                  </p>
                  {ind.manquants.length > 0 && <p class="err">Bulletins manquants dans l’historique : le dixième est sous-estimé.</p>}
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
                    <span class="li-sub">{l.from === l.to ? dayLabel(l.from, true) : `Du ${shortDate(l.from)} au ${shortDate(l.to)}`}{l.type === 'cp' ? `, ${joursOuvrables(l.from, l.to).length} jours ouvrables` : ''}</span>
                  </span>
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

export { state };
