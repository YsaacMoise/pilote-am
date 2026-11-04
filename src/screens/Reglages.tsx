import { useState } from 'preact/hooks';
import { saveSettings, useStore } from '../store';
import { mesureActive, setMesure } from '../analytics';
import { isDemo } from '../db';
import { Seg, Stepper, Switch, TextInput, Topbar } from '../ui/kit';
import { getTheme, setTheme, type Theme } from '../theme';

declare const __APP_VERSION__: string;

export function Reglages() {
  const s = useStore();
  const [mesure, setM] = useState(mesureActive());
  const [theme, setT] = useState<Theme>(getTheme());
  return (
    <>
      <Topbar title="Réglages" back="#/plus" screen="reglages" />
      <main>
        <section class="card">
          <fieldset>
            <legend>Toi</legend>
            <TextInput label="Ton prénom" hint="Pour signer les messages envoyés aux parents" value={s.settings.amName} onChange={(v) => saveSettings({ amName: v })} autoComplete="given-name" />
            <Stepper label="Tes propres enfants à charge" value={s.settings.enfantsACharge} onChange={(v) => saveSettings({ enfantsACharge: v })} max={10} />
            <p class="hint">Tes enfants à toi, pas ceux que tu gardes : moins de 15 ans au 30 avril, ou en situation de handicap quel que soit leur âge, et qui vivent chez toi. Chacun peut te donner 2 jours de congés en plus, sans dépasser 30 jours par an.</p>
          </fieldset>
        </section>
        <section class="card">
          <fieldset>
            <legend>Apparence</legend>
            <Seg label="Couleurs de l’app" value={theme} options={[{ v: 'light', l: 'Jour' }, { v: 'dark', l: 'Nuit' }, { v: 'auto', l: 'Automatique' }]} onChange={(v) => { setTheme(v); setT(v); }} />
            <p class="hint">Jour par défaut. Automatique suit le réglage de ton téléphone : jour la journée, nuit le soir s’il est réglé ainsi.</p>
          </fieldset>
        </section>
        <section class="card">
          <fieldset>
            <legend>Mesure d’usage</legend>
            {isDemo() ? <p class="hint">Dans l’exemple, la mesure d’usage est toujours coupée : rien n’est envoyé.</p> : <Switch label="Aider à améliorer l’app" hint="Allumé par défaut, tu peux l’éteindre à tout moment. L’app envoie à PostHog (serveurs en Europe) le nom des écrans ouverts et des gestes faits (par exemple « arrivée pointée », « mois envoyé »), avec un identifiant tiré au hasard, renouvelé au moins tous les 13 mois, et les caractéristiques techniques du téléphone (modèle, système, navigateur, taille d’écran, langue, fuseau horaire). Ces données servent seulement à compter ce qui est utilisé et ce qui coince ; elles ne sont jamais reliées à ton compte." checked={mesure} onChange={(v) => { setMesure(v); setM(v); }} />}
            <p class="hint">Rien de ce que tu écris ou choisis n’est envoyé : ni prénoms, ni noms, ni horaires, ni montants, ni carnet, ni motifs d’absence. Pas d’enregistrement de l’écran, pas d’adresse internet gardée, pas de localisation. Si tu éteins, l’envoi s’arrête et l’identifiant est effacé du téléphone.</p>
            <p class="hint"><a href="#/confidentialite">Lire la politique de confidentialité</a></p>
          </fieldset>
        </section>
        <p class="footer-note">Tes données (contrats, journées, carnet) sont rangées sur ce téléphone. Avec un compte, une copie va en ligne : voir Plus › Compte.</p>
        <p class="footer-note">Version de l’app <span class="mono-chip">{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue'}</span></p>
      </main>
    </>
  );
}
