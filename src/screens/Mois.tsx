import { useState } from 'preact/hooks';
import { ctxFor, logUsage, toast, useStore, state } from '../store';
import { addMonths, dayLabel, eachDay, firstDay, lastDay, monthLabel, monthOf, today, type Month } from '../engine/dates';
import { computeMonth, declarationLines, declarationText } from '../engine/month';
import { dayInfo, termsAt } from '../engine/payroll';
import { euros, hoursLabel } from '../engine/money';
import { CHILD_ABS_LABEL, AM_ABS_LABEL, type Contract } from '../engine/model';
import { Banner, Gommette, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { shareText } from '../share';
import { DaySheet } from './Today';

export function Mois({ month: m0, cid: c0 }: { month?: string; cid?: string }) {
  const s = useStore();
  const [month, setMonth] = useState<Month>((m0 as Month) ?? monthOf(today()));
  const list = s.contracts.filter((c) => c.start <= lastDay(month) && (!c.end || c.end >= firstDay(month)));
  const [cid, setCid] = useState<string | undefined>(c0);
  const c = list.find((x) => x.id === cid) ?? list[0];
  const [edit, setEdit] = useState<string | null>(null);

  return (
    <>
      <Topbar title="Mois" sub="Déclaration Pajemploi" screen="mois" />
      <main>
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
          <MonthView c={c} month={month} onEdit={setEdit} />
        )}
      </main>
      {edit && c && <DaySheet c={c} day={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MonthView({ c, month, onEdit }: { c: Contract; month: Month; onEdit: (d: string) => void }) {
  const ctx = ctxFor(c);
  const r = computeMonth(ctx, month, state.settings.enfantsACharge);
  const lines = declarationLines(ctx, r);
  const current = month === monthOf(today());
  const totalVerse = r.netTotal + r.entretien + r.repas + r.km;

  if (r.fromHistory) {
    return (
      <div class="card stack">
        <h2>Mois repris de l’historique</h2>
        {r.missing ? <p>Aucun bulletin pour ce mois. Ajoute-le dans l’historique du contrat pour fiabiliser les congés et la fin de contrat.</p> : <p>Salaire net déclaré : <b>{euros(r.net)}</b></p>}
        <a class="btn btn-outline" href={`#/historique/${c.id}`}>Ouvrir l’historique</a>
      </div>
    );
  }

  const exceptions = eachDay(firstDay(month), lastDay(month))
    .map((d) => dayInfo(ctx, d))
    .filter((di) => di.rec || di.kind === 'am' || di.kind === 'ferie' || di.departOublie);

  return (
    <>
      <section class="card stack" aria-labelledby="tot">
        <span class="muted" id="tot">À verser par la famille {c.family ? `(${c.family})` : ''}</span>
        <span class="total">{euros(totalVerse)}</span>
        <span class="muted small">dont salaire net {euros(r.netTotal)}, soit environ {euros(r.brutEstime)} brut</span>
        {current && <span class="tag info" style={{ alignSelf: 'flex-start' }}>Provisoire jusqu’à la fin du mois</span>}
      </section>

      {r.alerts.map((a) => <Banner tone="warn">{a}</Banner>)}
      {r.cpNote && <Banner tone="info" icon="sun">{r.cpNote}</Banner>}

      <section class="card" aria-labelledby="decl-t">
        <h2 id="decl-t" style={{ marginBottom: '4px' }}>À déclarer sur Pajemploi</h2>
        <p class="muted small" style={{ marginBottom: '8px' }}>Une déclaration par enfant, faite par le parent, dans cet ordre.</p>
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
        <a class="btn btn-outline btn-lg" href={`#/controle/${c.id}/${month}`}><Icon name="receipt" />Contrôler le bulletin</a>
      </div>

      <details class="more">
        <summary>Comment c’est calculé</summary>
        <div class="more-body">
          <dl class="kv">
            <dt>Salaire de base (le même chaque mois)</dt><dd>{euros(r.salaireMens)}</dd>
            <dt>{termsAt(c, `${month}-01`).yearType === 'complete' ? 'Heures prévues ce mois' : 'Jours prévus ce mois'}</dt>
            <dd>{termsAt(c, `${month}-01`).yearType === 'complete' ? hoursLabel(r.divisorMin) : r.divisorDays}</dd>
            {r.retenue > 0 && (<><dt>Retenue ({termsAt(c, `${month}-01`).yearType === 'complete' ? hoursLabel(r.deductedMin) : `${r.deductedDays} j`} non payés)</dt><dd>−{euros(r.retenue)}</dd></>)}
            {!!r.regulAvenant && (<><dt>Régularisation à l’avenant</dt><dd>{euros(r.regulAvenant)}</dd></>)}
            {r.complAmount > 0 && (<><dt>Heures complémentaires ({hoursLabel(r.complMin)})</dt><dd>{euros(r.complAmount)}</dd></>)}
            {r.majAmount > 0 && (<><dt>Heures majorées en plus ({hoursLabel(r.majMin)})</dt><dd>{euros(r.majAmount)}</dd></>)}
            {r.ferieAmount > 0 && (<><dt>Fériés travaillés</dt><dd>{euros(r.ferieAmount)}</dd></>)}
            {r.cpIndemnite > 0 && (<><dt>Congés payés</dt><dd>{euros(r.cpIndemnite)}</dd></>)}
            {r.cpComplement > 0 && (<><dt>Complément congés</dt><dd>{euros(r.cpComplement)}</dd></>)}
            <dt>Salaire net</dt><dd>{euros(r.netTotal)}</dd>
            <dt>Entretien ({r.presenceDays} j)</dt><dd>{euros(r.entretien)}</dd>
            {r.repas > 0 && (<><dt>Repas</dt><dd>{euros(r.repas)}</dd></>)}
            {r.km > 0 && (<><dt>Kilomètres</dt><dd>{euros(r.km)}</dd></>)}
          </dl>
          <p class="muted small">
            {termsAt(c, `${month}-01`).yearType === 'complete'
              ? 'Année complète : retenue = salaire mensualisé × heures non payées ÷ heures prévues dans le mois (art. 111).'
              : 'Année incomplète : retenue = salaire mensualisé × jours non payés ÷ jours prévus dans le mois (art. 111).'}
          </p>
        </div>
      </details>

      <div class="row">
        <label for="other-day" class="label" style={{ flex: 1 }}>Corriger un autre jour</label>
        <input id="other-day" class="input" style={{ width: 'auto' }} type="date" min={firstDay(month)} max={lastDay(month) < today() ? lastDay(month) : today()}
          onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onEdit(v); (e.target as HTMLInputElement).value = ''; }} />
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
              else if (di.kind === 'ferie') sub = `Férié : ${di.ferie}`;
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
