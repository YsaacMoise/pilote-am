import { useState } from 'preact/hooks';
import { saveSettings, useStore } from '../store';
import { mesureActive, setMesure } from '../analytics';
import { isDemo } from '../db';
import { NumberInput, Seg, Stepper, Switch, TextInput, Topbar } from '../ui/kit';
import { getTheme, setTheme, type Theme } from '../theme';
import { paieToujoursVisible, setPaieToujoursVisible } from '../paie-visible';
import { cpPeriodStartYear, today } from '../engine/dates';
import { moinsDe21Ans } from '../engine/conges';

declare const __APP_VERSION__: string;

export function Reglages() {
  const s = useStore();
  const [mesure, setM] = useState(mesureActive());
  const [theme, setT] = useState<Theme>(getTheme());
  const [paie, setPaie] = useState(paieToujoursVisible());
  // Période de congés en cours (du 1er juin au 31 mai) : l'âge se lit au 30 avril de son année de début (C. trav. L3141-8)
  const anneeCP = cpPeriodStartYear(today());
  // T-103 (K2) : kilomètres de l'année civile, tous parents confondus, pour le contrôle du tarif kilométrique (CCN 57).
  const an = Number(today().slice(0, 4));
  const avecKm = s.contracts.some((c) => c.kmTaux > 0);
  const anneesKm = [an - 1, an].filter((y) => s.contracts.some((c) => c.kmTaux > 0 && c.start <= `${y}-12-31` && (!c.end || c.end >= `${y}-01-01`)));
  return (
    <>
      <Topbar title="Réglages" back="#/plus" screen="reglages" />
      <main>
        <section class="card">
          <fieldset>
            <legend>Toi</legend>
            <TextInput label="Ton prénom" hint="Pour signer les messages envoyés aux parents" value={s.settings.amName} onChange={(v) => saveSettings({ amName: v })} autoComplete="given-name" />
            <Stepper label="Tes propres enfants à charge" value={s.settings.enfantsACharge} onChange={(v) => saveSettings({ enfantsACharge: v })} max={10} />
            <p class="hint">Tes enfants à toi, pas ceux que tu gardes : moins de 15 ans au 30 avril, ou en situation de handicap quel que soit leur âge, et qui vivent chez toi. Chacun peut te donner 2 jours de congés en plus, sans dépasser 30 jours par an. Avant 21 ans, cette limite ne s’applique pas.</p>
            {s.settings.enfantsACharge > 0 && <Switch label={`J’avais moins de 21 ans le 30 avril ${anneeCP}`} hint="Avant 21 ans, chacun de tes enfants te donne 2 jours, même au-delà de 30 jours. Coche seulement si c’est ton cas." checked={moinsDe21Ans(s.settings.amMoins21Jusqu, anneeCP)} onChange={(v) => saveSettings({ amMoins21Jusqu: v ? anneeCP : (s.settings.amMoins21Jusqu !== undefined && s.settings.amMoins21Jusqu < anneeCP ? s.settings.amMoins21Jusqu : undefined) })} />}
          </fieldset>
        </section>
        {avecKm && (
          <section class="card">
            <fieldset>
              <legend>Kilomètres</legend>
              <p class="hint">Les kilomètres faits pour le travail avec ta voiture, tous parents confondus, sur l’année civile. Le tarif par km doit être entre le barème de l’administration et le barème fiscal (article 57 de la convention) ; ces deux barèmes dépendent des kilomètres de l’année. En cours d’année, une prévision suffit.</p>
              {anneesKm.map((y) => (
                <NumberInput label={`Kilomètres en ${y}`} value={s.settings.kmAnnee?.[String(y)]} min={0} max={100000} onChange={(v) => { const k = { ...(s.settings.kmAnnee ?? {}) }; if (v) k[String(y)] = v; else delete k[String(y)]; saveSettings({ kmAnnee: k }); }} />
              ))}
            </fieldset>
          </section>
        )}
        <section class="card">
          <fieldset>
            <legend>Apparence</legend>
            <Seg label="Couleurs de l’app" value={theme} options={[{ v: 'light', l: 'Jour' }, { v: 'dark', l: 'Nuit' }, { v: 'auto', l: 'Automatique' }]} onChange={(v) => { setTheme(v); setT(v); }} />
            <p class="hint">Jour par défaut. Automatique suit le réglage de ton téléphone : jour la journée, nuit le soir s’il est réglé ainsi.</p>
            {/* T-118 : la paie du mois est cachée d'emblée dans l'écran Mois ; ce choix est gardé sur ce téléphone. */}
            <Switch label="Toujours afficher ma paie" hint="Dans l’écran Mois, la paie s’affiche directement, sans toucher « Voir ma paie du mois ». Gardé sur ce téléphone." checked={paie} onChange={(v) => { setPaieToujoursVisible(v); setPaie(v); }} />
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
