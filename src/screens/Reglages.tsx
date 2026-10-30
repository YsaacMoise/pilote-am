import { useState } from 'preact/hooks';
import { saveSettings, useStore } from '../store';
import { mesureActive, setMesure } from '../analytics';
import { Stepper, Switch, TextInput, Topbar } from '../ui/kit';

export function Reglages() {
  const s = useStore();
  const [mesure, setM] = useState(mesureActive());
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
        <section class="card">
          <fieldset>
            <legend>Mesure d’usage du pilote</legend>
            <Switch label="Aider à améliorer l’app" hint="Les écrans ouverts, les gestes et les erreurs sont envoyés à PostHog (serveurs en Europe), pour améliorer l’app pendant le test." checked={mesure} onChange={(v) => { setMesure(v); setM(v); }} />
            <p class="hint"><a href="#/confidentialite">Lire la politique de confidentialité</a></p>
            <p class="hint">Les prénoms des enfants et les noms des familles sont remplacés par « Enfant 1 », « Famille 1 » avant tout envoi. Les notes libres du carnet et ce que tu tapes dans les champs ne sont pas envoyés. Aucune adresse internet n’est gardée.</p>
          </fieldset>
        </section>
        <p class="footer-note">Tes données (contrats, journées, carnet) sont rangées sur ce téléphone. Avec un compte, une copie va en ligne : voir Plus › Compte.</p>
      </main>
    </>
  );
}
