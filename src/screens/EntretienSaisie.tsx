// T-044 : saisie de l'indemnité d'entretien du contrat, par heure ou par jour.
// CCN art. 114.1 : « versée en cas de travail effectif, par heure de travail. Le montant horaire de cette indemnité est
// prévu dans le contrat de travail. » Le tarif par jour reste possible pour les contrats déjà écrits ainsi : un jour d'une
// autre durée que le planning est alors en partie « à confirmer » (payroll.ts).
import { useState } from 'preact/hooks';
import { EuroInput, Seg } from '../ui/kit';

type Valeurs = { entretienJour: number; entretienHeure?: number };

export function EntretienSaisie({ t, set, hint }: { t: Valeurs; set: (p: Partial<Valeurs>) => void; hint?: string }) {
  const [mode, setMode] = useState<'heure' | 'jour'>(t.entretienHeure ? 'heure' : t.entretienJour ? 'jour' : 'heure');
  return (
    <>
      <Seg label="Indemnité d’entretien prévue au contrat" value={mode} options={[{ v: 'heure', l: 'Par heure' }, { v: 'jour', l: 'Par jour' }]}
        onChange={(v) => { setMode(v); set({ entretienJour: 0, entretienHeure: 0 }); }} />
      {mode === 'heure'
        ? <EuroInput key="h" label="Montant par heure de travail" hint={hint} cents={t.entretienHeure || undefined} allowEmpty onChange={(v) => set({ entretienHeure: v ?? 0, entretienJour: 0 })} />
        : <EuroInput key="j" label="Montant par jour" hint={`${hint ? `${hint} ` : ''}La convention prévoit un montant par heure : un jour plus long ou plus court que le planning sera en partie « à confirmer ».`} cents={t.entretienJour} onChange={(v) => set({ entretienJour: v ?? 0, entretienHeure: 0 })} />}
    </>
  );
}
