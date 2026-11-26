// T-115 (R3) : l'AM saisit seulement le net ; le brut est calculé et affiché à côté. Un lien discret ouvre le champ brut pour
// écrire celui du contrat s'il est différent (il prime alors). Règle : calculateur-arvela, regles/t115-net-brut.md.
// Relecture T-115 (m5) : « brut calculé » s'enregistre 0 (et non une valeur vide, qui disparaît d'une sauvegarde JSON et ferait
// revenir le brut écrit d'avant dans un avenant) ; 0 veut dire « brut calculé depuis le net » partout (payroll.ts, brutDuNet).
import { useState } from 'preact/hooks';
import { BRUT_CALCULE_DEPUIS, brutHoraireDepuisNet } from '../engine/brut';
import type { ISODate } from '../engine/dates';
import { euros } from '../engine/money';
import type { Region } from '../engine/regions';
import { Banner, EuroInput } from '../ui/kit';

export function BrutSaisie({ net, brut, date, region, set, ecrit = 'ton contrat', debut }: {
  net: number; brut?: number; date: ISODate; region: Region; set: (b: number) => void; ecrit?: string;
  /** Premier jour couvert par ces conditions (début du contrat, date de l'avenant) */
  debut?: ISODate;
}) {
  const [ouvert, setOuvert] = useState(!!brut);
  const calcule = net > 0 ? brutHoraireDepuisNet(net, date, region) : undefined;
  // Mayotte (aucun brut sûr au centime) : pas de brut calculé, le champ est montré tout de suite.
  const sansCalcul = region === 'mayotte';
  const ferme = !ouvert && !brut && !sansCalcul;
  // Relecture T-115 (m7) : conditions qui commencent avant 2024 : les mois d'avant n'ont pas de taux vérifiés.
  const avant2024 = !!debut && debut < BRUT_CALCULE_DEPUIS && region !== 'mayotte';
  return (
    <div class="brut-saisie">
      {ferme && calcule !== undefined && <p class="brut-calcule">Soit <b>{euros(calcule)}</b> brut de l’heure.</p>}
      {ferme && avant2024 && !brut && <p class="hint">Pour les mois d’avant 2024, l’app n’a pas les taux des cotisations : pour les calculer en brut, écris le brut de {ecrit}.</p>}
      {ferme
        ? <button type="button" class="btn btn-ghost brut-lien" onClick={() => setOuvert(true)}>{ecrit === 'ton contrat' ? 'Mon contrat indique un autre brut' : 'L’avenant indique un autre brut'}</button>
        : (
          <>
            <EuroInput label="Taux horaire brut" hint={sansCalcul ? `À Mayotte, l’app ne peut pas calculer le brut au centime près : écris celui de ${ecrit}, à côté du net.` : `Remplace le brut calculé${calcule !== undefined ? ` (${euros(calcule)})` : ''}.`} cents={brut || undefined} allowEmpty onChange={(v) => set(v ?? 0)} />
            {brut != null && brut > 0 && brut < net && <Banner tone="warn">Le brut ne peut pas être plus bas que le net. Vérifie {ecrit}.</Banner>}
            {!sansCalcul && calcule !== undefined && <button type="button" class="btn btn-ghost brut-lien" onClick={() => { set(0); setOuvert(false); }}>Revenir au brut calculé</button>}
          </>
        )}
    </div>
  );
}
