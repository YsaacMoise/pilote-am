import { useEffect, useState } from 'preact/hooks';
import { saveSettings, logUsage, state, useStore } from '../store';
import { AccountForm } from './Compte';
import { useCloud } from '../cloud-state';
import { MODE_KEY } from '../db';
import { Banner, Sheet, Stepper, TextInput, Topbar } from '../ui/kit';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/icons';

export function isStandalone(): boolean {
  return (navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function enterDemo() {
  try { localStorage.setItem(MODE_KEY, 'demo'); } catch { /* stockage indisponible */ }
  location.hash = '#/';
  location.reload();
}

export function InstallSteps() {
  return (
    <ol class="steps">
      <li><span>Touche le bouton <b>Partager</b> <span class="kbd-ico"><Icon name="share" size={20} label="Partager" /></span> : en bas dans Safari, en haut à droite dans Chrome.</span></li>
      <li><span>Choisis <b>Sur l’écran d’accueil</b> <span class="kbd-ico"><Icon name="square_plus" size={20} /></span>, puis <b>Ajouter</b>.</span></li>
      <li><span>Ouvre <b>Arvela</b> depuis la nouvelle icône et connecte-toi avec ton adresse e-mail. Tu y retrouves tout.</span></li>
    </ol>
  );
}

/**
 * Bouton « Installer » : vraie installation quand le navigateur le permet (Android, Chrome, Edge).
 * Sur iPhone et iPad, Apple ne laisse aucun site s'installer lui-même : le bouton ouvre un guide pas à pas.
 */
export function InstallButton({ label = 'Installer l’app sur l’écran d’accueil' }: { label?: string }) {
  const [evt, setEvt] = useState<any>(() => (window as any).__pamInstall);
  const [guide, setGuide] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const f = () => setEvt((window as any).__pamInstall);
    const g = () => setDone(true);
    window.addEventListener('pam-install-ready', f);
    window.addEventListener('appinstalled', g);
    return () => { window.removeEventListener('pam-install-ready', f); window.removeEventListener('appinstalled', g); };
  }, []);
  if (isStandalone() || done) return <Banner tone="ok">L’app est installée : ouvre-la depuis son icône.</Banner>;
  const ios = isIOS();
  return (
    <>
      <button class="btn btn-primary btn-lg btn-block" onClick={async () => {
        logUsage('installer_bouton', ios ? 'ios' : evt ? 'natif' : 'autre');
        if (evt) {
          evt.prompt();
          const r = await evt.userChoice.catch(() => null);
          if (r?.outcome === 'accepted') setDone(true);
          (window as any).__pamInstall = null;
          setEvt(null);
        } else setGuide(true);
      }}><Icon name="square_plus" />{label}</button>
      {guide && (
        <Sheet title="Installer l’app" onClose={() => setGuide(false)}>
          {ios ? (
            <>
              <InstallSteps />
              <p class="hint">Apple ne permet pas à un site de s’installer tout seul sur iPhone  : ces gestes sont le seul chemin, et une seule fois suffit.</p>
              <div class="install-arrow" aria-hidden="true"><Icon name="share" size={28} /><span>Partager : en bas dans Safari, en haut à droite dans Chrome</span></div>
            </>
          ) : (
            <p>Ouvre le menu du navigateur (les trois points ⋮ en haut à droite) et choisis <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</p>
          )}
        </Sheet>
      )}
    </>
  );
}

export function Welcome() {
  const s = useStore();
  const [step, setStep] = useState<'hello' | 'installer' | 'me'>('hello');
  const standalone = isStandalone();
  const cloud = useCloud();
  const signedIn = !!cloud.email && cloud.status !== 'off';
  if (step === 'me') {
    return (
      <div class="welcome">
        <h1 class="hero-title">Faisons connaissance</h1>
        <TextInput label="Ton prénom" hint="Pour signer les messages aux parents. Facultatif." value={s.settings.amName} onChange={(v) => saveSettings({ amName: v })} autoComplete="given-name" />
        <Stepper label="Tes enfants de moins de 15 ans" value={s.settings.enfantsACharge} onChange={(v) => saveSettings({ enfantsACharge: v })} max={10} />
        <p class="hint">Ils te donnent des jours de congés en plus.</p>
        <button class="btn btn-primary btn-lg btn-block" onClick={async () => {
          await saveSettings({ onboarded: true });
          try { const ok = await navigator.storage?.persist?.(); await saveSettings({ persisted: !!ok }); } catch { /* pas grave */ }
          logUsage('onboarding_fini');
          location.hash = '#/contrat/nouveau';
        }}>Ajouter mon premier enfant</button>
      </div>
    );
  }
  if (step === 'installer') {
    return (
      <div class="welcome">
        <h1 class="hero-title">Ton compte est prêt</h1>
        <section class="card stack" aria-labelledby="inst">
          <h2 id="inst">Installe l’app sur ton téléphone</h2>
          <p>Avec son icône sur l’écran d’accueil, l’app s’ouvre en un geste, en plein écran, même sans réseau.</p>
          <InstallButton />
          <p class="hint">Ouvre ensuite l’app depuis son icône et connecte-toi avec la même adresse e-mail.</p>
        </section>
        <button class="btn btn-secondary btn-lg btn-block" onClick={() => setStep('me')}>Continuer ici pour l’instant</button>
      </div>
    );
  }
  return (
    <div class="welcome">
      <div class="brand">
        <Logo />
        <h1 class="brand-name">Arvela</h1>
        <p class="brand-url" aria-hidden="true">arvela.fr</p>
      </div>
      <p class="brand-tagline">Ton carnet de bord d’assistante maternelle : les arrivées et départs en un geste, le carnet pour les parents, le salaire à déclarer sur Pajemploi, tes congés.</p>
      {signedIn ? (
        <section class="card stack">
          <p class="row"><Icon name="cloud" />Connectée avec <strong>{cloud.email}</strong></p>
          <button class="btn btn-primary btn-lg btn-block" onClick={() => setStep(standalone ? 'me' : 'installer')}>Continuer</button>
        </section>
      ) : <section class="card">
        <AccountForm onDone={() => {
          // Données retrouvées d'un autre appareil : l'accueil est déjà fait, l'app s'ouvre directement.
          if (state.settings.onboarded) { location.hash = '#/'; return; }
          setStep(standalone ? 'me' : 'installer');
        }} />
      </section>}
      <div class="stack">
        <button class="btn btn-secondary btn-lg btn-block" onClick={() => { logUsage('demo'); enterDemo(); }}>Découvrir avec des enfants fictifs</button>
      </div>
    </div>
  );
}

export function Installer() {
  return (
    <>
      <Topbar title="Installer l’app" back="#/plus" screen="installer" />
      <main>
        {isStandalone() ? <Banner tone="ok">L’app est déjà installée : tu l’utilises depuis son icône.</Banner> : <><InstallButton /><InstallSteps /></>}
        <section class="card stack-sm">
          <h2>Hors ligne</h2>
          <p>Une fois installée, l’app marche sans réseau : à la maison, au parc, en sortie.</p>
        </section>
      </main>
    </>
  );
}
