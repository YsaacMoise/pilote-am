// T-044 et T-044b : saisie de l'indemnité d'entretien du contrat, par heure ou par jour, sans choix présélectionné.
// CCN art. 114.1 : « versée en cas de travail effectif, par heure de travail. Le montant horaire de cette indemnité est
// prévu dans le contrat de travail. » Un montant par jour reste possible : un jour d'une autre durée que le planning est
// alors en partie « à confirmer » (payroll.ts).
import { Banner, Choices, EuroInput } from '../ui/kit';
import { euros } from '../engine/money';
import { MESSAGE_MOIS_DEJA_DECLARE } from '../engine/payroll';

type Valeurs = { entretienJour: number; entretienHeure?: number; entretienMode?: 'heure' | 'jour' };

export const modeEntretien = (t: Valeurs): 'heure' | 'jour' | undefined =>
  t.entretienMode ?? (t.entretienHeure ? 'heure' : t.entretienJour ? 'jour' : undefined);

export const libelleEntretien = (t: Valeurs): string => {
  const m = modeEntretien(t);
  return m === 'heure' ? `${euros(t.entretienHeure ?? 0)} par heure` : m === 'jour' ? `${euros(t.entretienJour)} par jour` : 'mode non choisi';
};

export function EntretienSaisie({ t, set, hint, passe }: { t: Valeurs; set: (p: Partial<Valeurs>) => void; hint?: string; passe?: boolean }) {
  const mode = modeEntretien(t);
  return (
    <>
      <Choices label="Comment ton contrat fixe-t-il l’indemnité d’entretien ?" value={mode}
        options={[
          { v: 'heure', l: 'Par heure d’accueil', sub: 'Le montant suit la durée réelle de chaque journée, comme le prévoit la convention (article 114.1).' },
          { v: 'jour', l: 'Par jour d’accueil', sub: 'Un montant fixe par journée. Si une journée est plus longue ou plus courte que le planning, une partie du montant reste « à confirmer ».' },
        ]}
        onChange={(v) => set({ entretienMode: v, entretienJour: 0, entretienHeure: 0 })} />
      {mode === 'heure' && <EuroInput key="h" label="Montant par heure d’accueil" hint={hint} cents={t.entretienHeure || undefined} allowEmpty onChange={(v) => set({ entretienHeure: v ?? 0, entretienJour: 0 })} />}
      {mode === 'jour' && <EuroInput key="j" label="Montant par jour d’accueil" hint={hint} cents={t.entretienJour} onChange={(v) => set({ entretienJour: v ?? 0, entretienHeure: 0 })} />}
      {passe && <Banner tone="warn">Ce changement touche des mois déjà passés : leur indemnité d’entretien sera recalculée. {MESSAGE_MOIS_DEJA_DECLARE}</Banner>}
    </>
  );
}
