import { saveSettings, useStore } from '../store';
import { Stepper, TextInput, Topbar } from '../ui/kit';

export function Reglages() {
  const s = useStore();
  return (
    <>
      <Topbar title="Réglages" back="#/plus" screen="reglages" />
      <main>
        <section class="card">
          <fieldset>
            <legend>Toi</legend>
            <TextInput label="Ton prénom" hint="Pour signer les messages envoyés aux parents" value={s.settings.amName} onChange={(v) => saveSettings({ amName: v })} autoComplete="given-name" />
            <Stepper label="Tes enfants de moins de 15 ans" value={s.settings.enfantsACharge} onChange={(v) => saveSettings({ enfantsACharge: v })} max={10} />
            <p class="hint">Chaque enfant à charge te donne 2 jours de congés en plus, sans dépasser 30 jours.</p>
          </fieldset>
        </section>
        <p class="footer-note">Version Claude Code du pilote. Aucune donnée ne quitte ce téléphone sans ton geste.</p>
      </main>
    </>
  );
}
