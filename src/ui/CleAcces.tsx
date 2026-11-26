// T-125 : boutons « Protéger avec Face ID » et « Ouvrir avec Face ID » (clé d'accès, extension PRF ; sync/cleacces.ts).
// Le libellé dit Face ID ou empreinte : le téléphone choisit. Rien ne s'affiche si le navigateur dit ne pas gérer PRF.
import { useEffect, useState } from 'preact/hooks';
import { useCloud } from '../cloud-state';
import { toast } from '../store';
import { PrfAbsent, supportPrf, type Support } from '../sync/cleacces';

const cloud = () => import('../cloud');

export const TEXTE_SANS_PRF = 'Face ID indisponible sur ce navigateur.';

export function useSupportPrf(): Support {
  const [s, setS] = useState<Support>('inconnu');
  useEffect(() => { void supportPrf().then(setS); }, []);
  return s;
}

export function BoutonCleAcces({ mode, block }: { mode: 'proteger' | 'ouvrir'; block?: boolean }) {
  const cl = useCloud();
  const support = useSupportPrf();
  const [busy, setBusy] = useState(false);
  if (support === 'non') return null;
  if (mode === 'ouvrir' && !cl.paquets) return null;
  const run = async () => {
    setBusy(true);
    try {
      const c = await cloud();
      if (mode === 'proteger') {
        await c.protegerParCleAcces();
        toast('Clé protégée.', undefined, 'ok');
      } else {
        await c.ouvrirParCleAcces();
      }
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err.name === 'NotAllowedError') toast('Annulé.');
      else if (err.name === 'InvalidStateError') toast('Déjà protégée sur ce trousseau.');
      else if (e instanceof PrfAbsent || err.name === 'NotSupportedError') toast(TEXTE_SANS_PRF, undefined, 'warn');
      else toast(err.message || 'Ça n’a pas marché. Réessaie.', undefined, 'warn');
    } finally { setBusy(false); }
  };
  return (
    <button class={`btn ${mode === 'ouvrir' ? 'btn-primary' : 'btn-outline'}${block ? ' btn-block' : ''}`} disabled={busy} onClick={() => void run()}>
      {busy ? 'Un instant…' : mode === 'proteger' ? 'Protéger avec Face ID' : 'Ouvrir avec Face ID'}
    </button>
  );
}
