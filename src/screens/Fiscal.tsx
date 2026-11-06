import { useState } from 'preact/hooks';
import { ctxFor, useStore } from '../store';
import { monthOf, today } from '../engine/dates';
import { fiscalYears } from '../engine/fiscal';
import { plafondHS } from '../engine/rates';
import { euros, eurosArrondis } from '../engine/money';
import { Banner, Gommette, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

export function Fiscal() {
  const s = useStore();
  const cur = Number(today().slice(0, 4));
  const [year, setYear] = useState(cur);
  const upTo = year === cur ? monthOf(today()) : undefined;
  const cs = s.contracts.filter((c) => c.start <= `${year}-12-31` && (!c.end || c.end >= `${year}-01-01`));
  const fs = fiscalYears(cs.map((c) => ctxFor(c)), year, s.settings.enfantsACharge, upTo);
  const rows = cs.map((c, i) => ({ c, f: fs[i] }));
  const tot = rows.reduce((a, r) => ({ recu: a.recu + r.f.recu, abat: a.abat + r.f.abattement, imp: a.imp + r.f.imposable, hsExo: a.hsExo + r.f.hsExonere, hsImp: a.hsImp + r.f.hsImposable }), { recu: 0, abat: 0, imp: 0, hsExo: 0, hsImp: 0 });
  const partiel = rows.some((r) => r.f.partiel);
  const moisHisto = rows.reduce((a, r) => a + r.f.moisHistorique, 0);
  // Arrondis à l'euro d'abord, soustraction ensuite : la ligne affichée tombe juste.
  const e = (c: number) => Math.round(c / 100) * 100;
  const imposableAffiche = Math.max(0, e(tot.recu) - e(tot.abat));
  const reste = (r: { recu: number; abattement: number }) => e(r.recu) - e(r.abattement);
  const negatif = rows.some((r) => reste(r.f) < 0);
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
          <span class="total">{eurosArrondis(imposableAffiche)}</span>
          <dl class="kv">
            <dt>Sommes reçues (salaires, entretien, repas, kilomètres)</dt><dd>{eurosArrondis(tot.recu)}</dd>
            <dt>Abattement spécifique</dt><dd>−{eurosArrondis(tot.abat)}</dd>
          </dl>
          {tot.hsExo > 0 && <p class="hint">Heures complémentaires et majorées exonérées d’impôt : {eurosArrondis(tot.hsExo)}, à part, sur la ligne des heures supplémentaires exonérées (case 1GH). Elles ne sont pas imposées mais comptent dans le revenu fiscal de référence.{tot.hsImp > 0 ? ` Le plafond de ${eurosArrondis(plafondHS(year))} est dépassé : ${eurosArrondis(tot.hsImp)} restent imposables.` : ''}</p>}
          <p class="hint">Montants estimés, arrondis à l’euro comme sur la déclaration : le salaire imposable dépend d’un brut estimé à partir du net.</p>
          <p class="hint">Avec le régime spécial des assistantes maternelles, tu déclares ce montant au lieu du salaire pré-rempli. Compare avec le pré-rempli : le plus favorable est à retenir.</p>
        </section>
        {partiel && <Banner tone="warn">Des mois manquent dans l’historique : l’estimation est incomplète.</Banner>}
        {moisHisto > 0 && <Banner tone="warn">{moisHisto} mois viennent de bulletins saisis : l’app n’y connaît ni les heures complémentaires et majorées, ni les kilomètres. Le revenu imposable est donc un peu trop haut, et le montant exonéré trop bas : pour la case 1GH, garde celui que Pajemploi a pré-rempli.</Banner>}
        {rows.map(({ c, f }) => (
          <section class="card stack" aria-label={`Impôts, ${c.child}`}>
            <div class="row"><Gommette name={c.child} color={c.color} size="sm" /><h2>{c.child}</h2></div>
            <dl class="kv">
              <dt>Salaire net imposable estimé</dt><dd>{eurosArrondis(f.netImposable)}</dd>
              {f.hsValeur > 0 && (<><dt>Heures complémentaires et majorées exonérées (déjà retirées)</dt><dd>{eurosArrondis(f.hsExonere)}</dd></>)}
              <dt>Entretien et repas</dt><dd>{eurosArrondis(f.entretienRepas)}</dd>
              {f.km > 0 && (<><dt>Indemnités kilométriques</dt><dd>{eurosArrondis(f.km)}</dd></>)}
              {f.repasParents > 0 && (<><dt>Repas fournis par les parents (avantage en nature)</dt><dd>{eurosArrondis(f.repasParents)}</dd></>)}
              <dt>Jours d’accueil</dt><dd>{f.jours}{f.joursCourts ? ` (dont ${f.joursCourts} de moins de 8 h)` : ''}</dd>
              <dt>Abattement ({f.facteur} × SMIC {f.smics.length > 1 ? f.smics.map(euros).join(' puis ') : euros(f.smic)} par jour)</dt><dd>−{eurosArrondis(f.abattement)}</dd>
              <dt>Reste après abattement</dt><dd>{reste(f) < 0 ? `−${eurosArrondis(-reste(f))}` : eurosArrondis(reste(f))}</dd>
            </dl>
            {(f.abattement < f.abattementBrut || (negatif && reste(f) < 0)) && <p class="hint">L’abattement est plafonné au total des sommes reçues pour tous les enfants, pas enfant par enfant : le reste d’un enfant peut être négatif, seul le total compte.</p>}
          </section>
        ))}
        <details class="more">
          <summary>Comment c’est calculé</summary>
          <div class="more-body">
            <p>Article 80 sexies du code général des impôts : pour chaque enfant et chaque jour d’accueil, l’abattement vaut 3 fois le SMIC horaire (4 fois pour un enfant en situation de handicap ou de maladie), au prorata si la journée dure moins de 8 heures. Le SMIC retenu est celui en vigueur le jour de la garde.</p>
            <p>Quand les parents fournissent les repas, chaque jour d’accueil ajoute la valeur d’un repas aux sommes reçues (5,50 € en 2026, 5,45 € en 2025) : c’est un avantage en nature imposable, selon impots.gouv.</p>
            <p>Le salaire net imposable est estimé : net versé + CSG non déductible et CRDS (2,9 % de 98,25 % du brut estimé).</p>
            <p>Les heures complémentaires (au-delà du contrat, jusqu’à 45 h dans la semaine) et les heures majorées (au-delà de 45 h, prévues au contrat ou en plus) sont exonérées d’impôt jusqu’à {eurosArrondis(plafondHS(year))} par an, tous employeurs réunis (article 81 quater du code général des impôts). Elles sont retirées du salaire imposable avec la réduction de cotisations qui les accompagne (11,31 % de leur brut, article L241-17 du code de la sécurité sociale ; montant estimé, à comparer avec ton bulletin). Les mois repris d’un bulletin n’ont pas ce détail : leurs heures restent comptées comme imposables.</p>
            <p>Les indemnités kilométriques versées par les parents font partie des sommes reçues, comme l’entretien et les repas (bulletin officiel des impôts, BOI-RSA-CHAMP-10-20-10 § 440 et 460).</p>
          </div>
        </details>
      </main>
    </>
  );
}
