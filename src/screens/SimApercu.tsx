// Aperçu du simulateur sur la page d'accueil : trois curseurs, le résultat tout de suite,
// puis « Affiner » ouvre le simulateur complet avec les mêmes valeurs.
import { useState } from 'preact/hooks';
import { simuler, simulationParDefaut } from '../engine/simulation';
import { today } from '../engine/dates';
import { euros } from '../engine/money';
import { ratesAt } from '../engine/rates';
import { logUsage } from '../store';
import { Icon } from '../ui/icons';

/** Revenus choisis sur l'accueil, repris une fois par le simulateur (jamais mis dans l'adresse) */
export const SIM_RESSOURCES = 'pam-sim-ressources';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function SimApercu() {
  const d = today();
  // Curseur par pas de 5 centimes : on part du minimum conventionnel brut arrondi au-dessus, jusqu'à 13,00 € brut.
  const min = Math.ceil(ratesAt(d).minConvBrut / 5) * 5;
  const [heures, setHeures] = useState(40);
  const [taux, setTaux] = useState(Math.max(min, 510));
  // La CAF compte le revenu imposable de l'année N-2 (avis d'impôt), divisé par 12.
  const anneeRevenus = Number(d.slice(0, 4)) - 2;
  const [revenusAn, setRevenusAn] = useState(42000);
  const revenus = Math.round(revenusAn / 12);
  const r = simuler({ ...simulationParDefaut(d), jours: 5, heures, tauxBrut: taux, ressourcesMois: revenus }, d);
  const lien = `#/simulateur?jours=5&heures=${heures}&tauxBrut=${taux}`;

  return (
    <section class="sim-apercu" aria-labelledby="sim-t">
      <div class="sim-apercu-txt">
        <span class="eyebrow">Simulateur · règles 2026</span>
        <h2 id="sim-t">Combien coûte ton accueil à une famille ?</h2>
        <p>Bouge les curseurs. Le salaire, l’aide de la CAF et le crédit d’impôt sont calculés tout de suite. Pratique pour répondre aux parents que tu rencontres.</p>
      </div>
      <div class="sim-apercu-box">
        <div class="sim-sliders">
          <Curseur id="sa-h" label="Heures d’accueil par semaine" value={heures} min={10} max={47} step={1} onChange={setHeures} affiche={`${heures} h`} />
          <Curseur id="sa-t" label="Ton tarif horaire" value={taux} min={min} max={1300} step={5} onChange={setTaux} affiche={`${euros(taux)} brut`} />
          <Curseur id="sa-r" label={`Revenu imposable de la famille en ${anneeRevenus}`} value={revenusAn} min={0} max={120000} step={1000} onChange={setRevenusAn} affiche={`${nf.format(revenusAn)} €`} />
          <p class="hint">Le montant « revenu imposable » de l’avis d’impôt. C’est ce que la CAF retient pour son aide, pas l’impôt payé.</p>
        </div>
        <div class="sim-apercu-res" aria-live="polite">
          <span class="summary-label">Reste à payer par la famille</span>
          <span class="total">{euros(r.reste)}<small> / mois</small></span>
          <span class="summary-sub">À verser {euros(r.verse)}, aide de la CAF −{euros(r.cmg.montant)}{r.cotisationsReste > 0 ? `, cotisations +${euros(r.cotisationsReste)}` : ''}</span>
          {r.creditAnnuel > 0 && <span class="summary-sub">Avec le crédit d’impôt : <b>{euros(r.reel)}</b> par mois en réalité</span>}
        </div>
        <a class="btn btn-primary btn-lg btn-block" href={lien} onClick={() => {
          try { sessionStorage.setItem(SIM_RESSOURCES, String(revenus)); } catch { /* navigation privée */ }
          logUsage('accueil_simulateur');
        }}>Affiner la simulation<Icon name="right" size={20} /></a>
        <p class="hint">Entretien, repas, semaines de congés, enfants à charge : à régler dans le simulateur complet.</p>
      </div>
    </section>
  );
}

function Curseur({ id, label, value, min, max, step, onChange, affiche }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; affiche: string }) {
  return (
    <div class="curseur">
      <label for={id}><span>{label}</span><output for={id}>{affiche}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={affiche}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} />
    </div>
  );
}
