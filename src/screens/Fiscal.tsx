import { useState } from 'preact/hooks';
import { ctxFor, useStore } from '../store';
import { monthOf, today } from '../engine/dates';
import { fiscalYear } from '../engine/fiscal';
import { euros } from '../engine/money';
import { Banner, Gommette, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

export function Fiscal() {
  const s = useStore();
  const cur = Number(today().slice(0, 4));
  const [year, setYear] = useState(cur);
  const upTo = year === cur ? monthOf(today()) : undefined;
  const rows = s.contracts
    .filter((c) => c.start <= `${year}-12-31` && (!c.end || c.end >= `${year}-01-01`))
    .map((c) => ({ c, f: fiscalYear(ctxFor(c), year, s.settings.enfantsACharge, upTo) }));
  const tot = rows.reduce((a, r) => ({ recu: a.recu + r.f.recu, abat: a.abat + r.f.abattement, imp: a.imp + r.f.imposable }), { recu: 0, abat: 0, imp: 0 });
  const partiel = rows.some((r) => r.f.partiel);
  return (
    <>
      <Topbar title="Impôts" back="#/plus" screen="fiscal" />
      <main>
        <div class="month-nav">
          <button class="icon-btn" aria-label="Année précédente" onClick={() => setYear(year - 1)}><Icon name="left" /></button>
          <h2 aria-live="polite">Revenus {year}</h2>
          <button class="icon-btn" aria-label="Année suivante" disabled={year >= cur} onClick={() => setYear(year + 1)}><Icon name="right" /></button>
        </div>
        <section class="card stack" aria-labelledby="imp">
          <span class="muted" id="imp">Revenu imposable estimé{year === cur ? ' à ce jour' : ''}</span>
          <span class="total">{euros(tot.imp)}</span>
          <dl class="kv">
            <dt>Sommes reçues (salaires, entretien, repas)</dt><dd>{euros(tot.recu)}</dd>
            <dt>Abattement spécifique</dt><dd>−{euros(tot.abat)}</dd>
          </dl>
          <p class="hint">Avec le régime spécial des assistantes maternelles, tu déclares ce montant au lieu du salaire pré-rempli. Compare avec le pré-rempli : le plus favorable est à retenir.</p>
        </section>
        {partiel && <Banner tone="warn">Des mois manquent dans l’historique : l’estimation est incomplète.</Banner>}
        {rows.map(({ c, f }) => (
          <section class="card stack" aria-label={`Impôts, ${c.child}`}>
            <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2></div>
            <dl class="kv">
              <dt>Salaire net imposable estimé</dt><dd>{euros(f.netImposable)}</dd>
              <dt>Entretien et repas</dt><dd>{euros(f.entretienRepas)}</dd>
              <dt>Jours d’accueil</dt><dd>{f.jours}{f.joursCourts ? ` (dont ${f.joursCourts} de moins de 8 h)` : ''}</dd>
              <dt>Abattement ({f.facteur} × SMIC {euros(f.smic)} par jour)</dt><dd>−{euros(f.abattement)}</dd>
              <dt>Imposable</dt><dd>{euros(f.imposable)}</dd>
            </dl>
            {f.abattement < f.abattementBrut && <p class="hint">L’abattement est plafonné aux sommes reçues.</p>}
          </section>
        ))}
        <details class="more">
          <summary>Comment c’est calculé</summary>
          <div class="more-body">
            <p>Article 80 sexies du code général des impôts : pour chaque enfant et chaque jour d’accueil, l’abattement vaut 3 fois le SMIC horaire (4 fois pour un enfant en situation de handicap ou de maladie), au prorata si la journée dure moins de 8 heures. Le SMIC retenu est celui du 1er janvier de l’année des revenus.</p>
            <p>Le salaire net imposable est estimé : net versé + CSG non déductible et CRDS (2,9 % de 98,25 % du brut estimé). Les frais kilométriques ne sont pas comptés.</p>
          </div>
        </details>
      </main>
    </>
  );
}
