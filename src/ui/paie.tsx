// T-135 : montants de la paie de l'AM cachés tant que la paie n'est pas montrée (« Voir ma paie »), sur tous les écrans.
import { useEffect, useState } from 'preact/hooks';
import { abonnerPaie, paieVue, setPaieVue } from '../paie-visible';
import { logUsage } from '../store';

export const MONTANT_CACHE = '•••• €';

/** État partagé « paie vue » : tout composant qui l'utilise se redessine quand il change. */
export function usePaieVue(): [boolean, (v: boolean) => void] {
  const [, maj] = useState(0);
  useEffect(() => abonnerPaie(() => maj((x) => x + 1)), []);
  return [paieVue(), setPaieVue];
}

/** Un montant de la paie : « •••• € » tant qu'elle est cachée (le lecteur d'écran lit « Montant caché »). */
export function Montant({ v }: { v: string }) {
  const [vu] = usePaieVue();
  return vu ? <>{v}</> : <span class="montant-cache"><span aria-hidden="true">{MONTANT_CACHE}</span><span class="sr-only">Montant caché</span></span>;
}

/** Montants d'un texte remplacés quand la paie est cachée ; le reste du texte ne change pas. */
export function masquerMontants(t: string): string {
  return t.replace(/−?\d[\d   ]*(?:,\d+)?[   ]?€/g, MONTANT_CACHE);
}
export function TexteMontants({ t }: { t?: string }) {
  const [vu] = usePaieVue();
  return <>{vu || !t ? t : masquerMontants(t)}</>;
}

/** Le geste qui montre ou recache la paie, sur place. */
export function BoutonPaie({ ecran }: { ecran: string }) {
  const [vu, set] = usePaieVue();
  return (
    <button class="btn btn-outline btn-sm bouton-paie" type="button" aria-pressed={vu}
      onClick={() => { if (!vu) logUsage('paie_vue', ecran); set(!vu); }}>
      {vu ? 'Cacher ma paie' : 'Voir ma paie'}
    </button>
  );
}
