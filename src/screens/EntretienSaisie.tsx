// T-044 et T-044b : saisie de l'indemnité d'entretien du contrat, par heure ou par jour, sans choix présélectionné.
// CCN art. 114.1 : « versée en cas de travail effectif, par heure de travail. Le montant horaire de cette indemnité est
// prévu dans le contrat de travail. » Un montant par jour reste possible : un jour d'une autre durée que le planning est
// alors en partie « à confirmer » (payroll.ts).
import { Banner, Choices, EuroInput } from '../ui/kit';
import { euros } from '../engine/money';
import { MESSAGE_MOIS_DEJA_DECLARE } from '../engine/payroll';
import { entretienPlancher } from '../engine/rates';
import { today, type ISODate } from '../engine/dates';

type Valeurs = { entretienJour: number; entretienHeure?: number; entretienMode?: 'heure' | 'jour' };

export const modeEntretien = (t: Valeurs): 'heure' | 'jour' | undefined =>
  t.entretienMode ?? (t.entretienHeure ? 'heure' : t.entretienJour ? 'jour' : undefined);

/** T-116 (A1) : montant vide = minimum légal de la convention (article 114.1), appliqué d'office. */
export const libelleMinimumEntretien = (d: ISODate = today()): string => {
  const neuf = entretienPlancher(d, 540), jour = entretienPlancher(d, 0);
  return neuf !== undefined && jour !== undefined ? `minimum légal (${euros(neuf)} pour une journée de 9 h, ${euros(jour)} au moins par jour)` : 'minimum légal';
};

export const libelleEntretien = (t: Valeurs): string => {
  const m = modeEntretien(t);
  if (m === 'heure') return t.entretienHeure ? `${euros(t.entretienHeure)} par heure` : libelleMinimumEntretien();
  if (m === 'jour') return t.entretienJour ? `${euros(t.entretienJour)} par jour` : libelleMinimumEntretien();
  return t.entretienMode === undefined && !t.entretienJour && !t.entretienHeure ? libelleMinimumEntretien() : 'mode non choisi';
};

const AIDE_VIDE = 'Laisse vide si le contrat ne fixe pas de montant : l’app applique le minimum légal.';

export function EntretienSaisie({ t, set, hint, passe }: { t: Valeurs; set: (p: Partial<Valeurs>) => void; hint?: string; passe?: boolean }) {
  const mode = modeEntretien(t);
  return (
    <>
      <Choices label="Comment ton contrat fixe-t-il l’indemnité d’entretien ?" value={mode}
        options={[
          { v: 'heure', l: 'Par heure d’accueil' },
          { v: 'jour', l: 'Par jour d’accueil', sub: 'Au moins le minimum conventionnel selon la durée du jour.' },
        ]}
        onChange={(v) => set({ entretienMode: v, entretienJour: 0, entretienHeure: 0 })} />
      {mode === 'heure' && <EuroInput key="h" label="Montant par heure d’accueil" hint={hint ?? AIDE_VIDE} cents={t.entretienHeure || undefined} allowEmpty onChange={(v) => set({ entretienHeure: v ?? 0, entretienJour: 0 })} />}
      {mode === 'jour' && <EuroInput key="j" label="Montant par jour d’accueil" hint={hint ?? AIDE_VIDE} cents={t.entretienJour || undefined} allowEmpty onChange={(v) => set({ entretienJour: v ?? 0, entretienHeure: 0 })} />}
      {mode && !(mode === 'heure' ? t.entretienHeure : t.entretienJour) && <p class="hint">Montant laissé vide : l’app applique le {libelleMinimumEntretien()}.</p>}
      {passe && <Banner tone="warn">Ce changement touche des mois déjà passés : leur indemnité d’entretien sera recalculée. {MESSAGE_MOIS_DEJA_DECLARE}</Banner>}
    </>
  );
}
