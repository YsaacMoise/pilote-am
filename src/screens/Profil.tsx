// T-122 : profil de l'AM (« Toi ») : prénom, département où elle accueille, enfants à charge. Valable pour tous ses contrats.
import { useId, useState } from 'preact/hooks';
import { saveSettings, state, useStore } from '../store';
import { DEPARTEMENTS, libelleDepartement, trouverDepartement } from '../engine/departements';
import { Stepper, TextInput } from '../ui/kit';

export const AIDE_DEPARTEMENT = '';
export const AIDE_ENFANTS_A_CHARGE = 'Moins de 15 ans au 30 avril, ou en situation de handicap, et vivant chez toi.';

/** Département choisi dans la liste (numéro ou nom). `onChange(undefined)` tant que la saisie ne mène à aucun département. */
export function DepartementSaisie({ value, onChange, label = 'Département où tu accueilles', hint = AIDE_DEPARTEMENT, error }: {
  value?: string; onChange: (code: string | undefined) => void; label?: string; hint?: string; error?: string;
}) {
  const id = useId();
  const [saisie, setSaisie] = useState(value ? libelleDepartement(value) : '');
  const inconnu = saisie.trim() !== '' && !trouverDepartement(saisie);
  const msg = inconnu ? 'Choisis un département dans la liste.' : error;
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input id={id} class="input" list={`${id}-l`} value={saisie} autoComplete="off" placeholder="Numéro ou nom : 31 ou Haute-Garonne"
        aria-invalid={msg ? 'true' : undefined} aria-describedby={[hint && `${id}-h`, msg && `${id}-e`].filter(Boolean).join(' ') || undefined}
        onInput={(e) => { const v = (e.target as HTMLInputElement).value; setSaisie(v); onChange(trouverDepartement(v)); }} />
      <datalist id={`${id}-l`}>{DEPARTEMENTS.map((d) => <option value={`${d.code} – ${d.nom}`} />)}</datalist>
      {hint && <span class="hint" id={`${id}-h`}>{hint}</span>}
      {msg && <span class="err" id={`${id}-e`} aria-live="polite">{msg}</span>}
    </div>
  );
}

/** Les trois champs du profil, enregistrés à chaque saisie */
export function ProfilChamps() {
  const s = useStore();
  return (
    <>
      <TextInput label="Ton prénom (facultatif)" value={s.settings.amName} onChange={(v) => saveSettings({ amName: v })} autoComplete="given-name" />
      <DepartementSaisie value={s.settings.departement} onChange={(d) => { if (d !== state.settings.departement) void saveSettings({ departement: d }); }} />
      <Stepper label="Tes propres enfants à charge" value={s.settings.enfantsACharge} onChange={(v) => saveSettings({ enfantsACharge: v })} max={10} />
      <p class="hint">{AIDE_ENFANTS_A_CHARGE}</p>
    </>
  );
}
