// T-115 (R3) : l'AM saisit seulement le net ; le brut est calculé comme Pajemploi et affiché à côté. Un lien discret ouvre le
// champ brut pour écrire celui du contrat s'il est différent (il prime alors). Règle : calculateur-arvela, regles/t115-net-brut.md.
import { useState } from 'preact/hooks';
import { brutHoraireDepuisNet } from '../engine/brut';
import type { ISODate } from '../engine/dates';
import { euros } from '../engine/money';
import type { Region } from '../engine/regions';
import { Banner, EuroInput } from '../ui/kit';

export function BrutSaisie({ net, brut, date, region, set, ecrit = 'ton contrat' }: {
  net: number; brut?: number; date: ISODate; region: Region; set: (b: number | undefined) => void; ecrit?: string;
}) {
  const [ouvert, setOuvert] = useState(!!brut);
  const calcule = net > 0 ? brutHoraireDepuisNet(net, date, region) : undefined;
  const ferme = !ouvert && !brut;
  return (
    <div class="brut-saisie">
      {ferme && calcule !== undefined && <p class="brut-calcule">Soit <b>{euros(calcule)}</b> brut de l’heure, calculé par l’app avec les taux de l’Urssaf.</p>}
      {ferme && calcule === undefined && net > 0 && <p class="hint">{region === 'mayotte' ? 'À Mayotte' : 'Pour cette période'}, l’app ne peut pas calculer le brut au centime près : écris celui de {ecrit}.</p>}
      {ferme
        ? <button type="button" class="btn btn-ghost brut-lien" onClick={() => setOuvert(true)}>{ecrit === 'ton contrat' ? 'Mon contrat indique un autre brut' : 'L’avenant indique un autre brut'}</button>
        : (
          <>
            <EuroInput label="Taux horaire brut" hint={`Celui écrit dans ${ecrit}, à côté du net. Il remplace le brut calculé${calcule !== undefined ? ` (${euros(calcule)})` : ''}.`} cents={brut} allowEmpty onChange={(v) => set(v ?? undefined)} />
            {brut != null && brut > 0 && brut < net && <Banner tone="warn">Le brut ne peut pas être plus bas que le net. Vérifie {ecrit}.</Banner>}
            {calcule !== undefined && <button type="button" class="btn btn-ghost brut-lien" onClick={() => { set(undefined); setOuvert(false); }}>Revenir au brut calculé</button>}
          </>
        )}
    </div>
  );
}
