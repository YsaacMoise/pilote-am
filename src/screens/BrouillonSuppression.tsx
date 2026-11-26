// T-122 (relecture, m4) : supprimer un contrat en cours de saisie demande une confirmation, puis propose « Annuler ».
import { useState } from 'preact/hooks';
import { logUsage, toast } from '../store';
import { de } from '../engine/texte';
import { Icon } from '../ui/icons';
import { enregistrerBrouillon, supprimerBrouillon, type Brouillon } from '../brouillons';

export function SupprimerBrouillon({ b, ecran, apres, bloc = false }: { b: Brouillon; ecran: string; apres?: () => void; bloc?: boolean }) {
  const [confirmer, setConfirmer] = useState(false);
  const nom = `le contrat ${de(b.c.child || 'sans prénom')} en cours de saisie`;
  if (!confirmer) return <button type="button" class={`btn btn-ghost${bloc ? ' btn-block' : ''}`} onClick={() => setConfirmer(true)}><Icon name="trash" />Supprimer</button>;
  return (
    <div class="stack-sm" role="group" aria-label="Confirmer la suppression">
      <p class="hint">Supprimer {nom} ? Ses réponses sont effacées de ce téléphone.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-danger" onClick={() => {
          supprimerBrouillon(b.id);
          logUsage('brouillon_supprime', ecran);
          toast(`${nom.replace(/^l/, 'L')} : supprimé`, async () => { enregistrerBrouillon(b); });
          apres?.();
        }}>Supprimer</button>
        <button type="button" class="btn btn-outline" onClick={() => setConfirmer(false)}>Garder</button>
      </div>
    </div>
  );
}
