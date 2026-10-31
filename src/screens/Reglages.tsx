import { useState } from 'preact/hooks';
import { saveSettings, useStore } from '../store';
import { mesureActive, setMesure } from '../analytics';
import { Stepper, Switch, TextInput, Topbar } from '../ui/kit';

declare const __APP_VERSION__: string;

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
            <Switch label="J’accepte d’aider à améliorer l’app" hint="Éteint tant que tu ne l’allumes pas. Si tu l’allumes, l’app envoie à PostHog (serveurs en Europe) le nom des écrans ouverts et des gestes faits (par exemple « arrivée pointée », « mois envoyé »), avec un identifiant au hasard." checked={mesure} onChange={(v) => { setMesure(v); setM(v); }} />
            <p class="hint">Rien de ce que tu écris ou choisis n’est envoyé : ni prénoms, ni noms, ni horaires, ni montants, ni carnet, ni motifs d’absence. Pas d’enregistrement de l’écran. Si tu éteins, l’envoi s’arrête et l’identifiant est effacé du téléphone.</p>
            <p class="hint"><a href="#/confidentialite">Lire la politique de confidentialité</a></p>
          </fieldset>
        </section>
        <p class="footer-note">Tes données (contrats, journées, carnet) sont rangées sur ce téléphone. Avec un compte, une copie va en ligne : voir Plus › Compte.</p>
        <p class="footer-note">Version de l’app : {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue'}</p>
      </main>
    </>
  );
}
