import { useState, type ReactElement } from 'react';
import { requestPersistence } from '../storage';
import { demoState } from '../demo';
import { logEvent, nowMinutes, replaceState, todayISO, update } from '../state';
import { Icon } from './icons';
import { Banner, Group, TextField, Toggle, useNav } from './kit';

export function InstallSteps(): ReactElement {
  return (
    <ol>
      <li>
        <span>
          Dans Safari, touche le bouton Partager{' '}
          <span className="share-glyph"><Icon name="share" size={20} /></span> en bas de l’écran.
        </span>
      </li>
      <li><span>Fais défiler et choisis <strong>Sur l’écran d’accueil</strong>.</span></li>
      <li><span>Touche <strong>Ajouter</strong>, puis ouvre le site depuis la nouvelle icône.</span></li>
    </ol>
  );
}

/** Page d'accueil quand le site est ouvert dans Safari et non depuis l'icône. */
export function Welcome({ onContinue }: { onContinue: () => void }): ReactElement {
  return (
    <main className="welcome">
      <div className="welcome-magnets" aria-hidden="true">
        <span className="magnet kid-1">A</span>
        <span className="magnet kid-2">M</span>
        <span className="magnet waiting kid-3">♥</span>
      </div>
      <h1>Bonjour !</h1>
      <p>Ce site s’utilise comme une app, depuis une icône sur l’écran d’accueil de ton iPhone. Tout reste sur ton téléphone : pas de compte, rien n’est envoyé ailleurs.</p>
      <InstallSteps />
      <Banner tone="warn">
        <p><strong>Important :</strong> ce que tu saisis dans Safari ne se retrouve pas dans l’icône. Commence directement depuis l’icône.</p>
      </Banner>
      <div className="actions" style={{ padding: '20px 0 0' }}>
        <button className="btn btn-plain" onClick={onContinue}>Continuer dans le navigateur pour essayer</button>
      </div>
    </main>
  );
}

/** Premier lancement : le profil de l'assistante maternelle, en une seule page. */
export function Onboarding(): ReactElement {
  const nav = useNav();
  const [firstName, setFirstName] = useState('');
  const [title, setTitle] = useState(false);
  const [adult, setAdult] = useState(true);
  const ok = firstName.trim().length > 0;
  return (
    <main className="screen" style={{ paddingBottom: 'calc(var(--safe-bottom) + 32px)' }}>
      <div className="bar"><span /></div>
      <h1 className="large-title">Bienvenue</h1>
      <p className="subtitle">Trois réponses et on passe au premier contrat.</p>
      <Group title="Toi">
        <TextField label="Ton prénom" value={firstName} onChange={setFirstName} placeholder="Prénom" autoComplete="given-name" />
        <Toggle label="J’ai le titre d’assistante maternelle" hint="CAP AEPE ou titre professionnel : le salaire minimum est un peu plus haut" checked={title} onChange={setTitle} />
        <Toggle label="J’avais 21 ans ou plus au 30 avril" hint="Sert au calcul des congés si tu as des enfants" checked={adult} onChange={setAdult} />
      </Group>
      <p className="group-note">Tu pourras tout changer dans Réglages, et y ajouter tes propres enfants (ils donnent des jours de congés en plus).</p>
      <div className="actions">
        <button
          className="btn btn-primary btn-block"
          disabled={!ok}
          onClick={() => {
            update((s) => ({
              ...s,
              profile: { firstName: firstName.trim(), hasProfessionalTitle: title, childrenBirthDates: [], atLeast21: adult },
            }));
            void requestPersistence();
            logEvent('accueil', 'profil-cree');
            nav.push({ name: 'contract' });
          }}
        >
          Continuer
        </button>
      </div>
    </main>
  );
}

/** Aperçu publié pour découvrir l'app avant l'installation : exemples ou départ à vide. */
export function PreviewStart(): ReactElement {
  const [blank, setBlank] = useState(false);
  if (blank) return <Onboarding />;
  return (
    <main className="welcome">
      <div className="welcome-magnets" aria-hidden="true">
        <span className="magnet kid-1">L</span>
        <span className="magnet kid-2">M</span>
        <span className="magnet waiting kid-3">N</span>
      </div>
      <h1>Aperçu de Pilote AM</h1>
      <p>Tu peux tout toucher : pointer, noter, envoyer, simuler une fin de contrat. Ce que tu fais ici reste dans ce navigateur et ne sert qu’à essayer.</p>
      <Banner>
        <p>La vraie app s’installera sur l’écran d’accueil de l’iPhone, depuis une adresse à elle. Les données d’essai d’ici n’y seront pas.</p>
      </Banner>
      <div className="actions" style={{ padding: '20px 0 0' }}>
        <button className="btn btn-primary btn-block" onClick={() => { replaceState(demoState(todayISO(), nowMinutes())); logEvent('apercu', 'exemples'); }}>
          Voir avec quatre enfants d’exemple
        </button>
        <button className="btn btn-soft btn-block" onClick={() => setBlank(true)}>Commencer à vide</button>
      </div>
    </main>
  );
}
