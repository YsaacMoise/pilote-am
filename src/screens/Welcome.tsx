import { useEffect, useState } from 'preact/hooks';
import { saveSettings, logUsage, state, useStore } from '../store';
import { AccountForm } from './Compte';
import { useCloud } from '../cloud-state';
import { MODE_KEY } from '../db';
import { Banner, Sheet, Stepper, TextInput, Topbar } from '../ui/kit';
import { Logo } from '../ui/Logo';
import { VIDEOS_PRETES, VideoClip, isIOS } from '../ui/VideoGuide';
import { Icon } from '../ui/icons';

/** Logo vertical empilé de la charte (déclinaison 02 « Page connexion & accueil ») */
function LockupStacked() {
  return (
    <div class="brand" aria-hidden="true">
      <Logo />
      <span class="brand-name">Arvela</span>
      <span class="brand-url">arvela.fr</span>
    </div>
  );
}

export function isStandalone(): boolean {
  return (navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
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
  const [form, setForm] = useState<null | 'create' | 'login'>(null);
  const [video, setVideo] = useState(false);
  const standalone = isStandalone();
  const cloud = useCloud();
  const signedIn = !!cloud.email && cloud.status !== 'off';
  if (step === 'me') {
    return (
      <div class="welcome">
        <LockupStacked />
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
        <LockupStacked />
        <h1 class="hero-title">Ton compte est prêt</h1>
        <section class="card stack" aria-labelledby="inst">
          <h2 id="inst">Installe l’app sur ton téléphone</h2>
          <p>Avec son icône sur l’écran d’accueil, l’app s’ouvre en un geste, en plein écran, même sans réseau.</p>
          <InstallButton />
          {VIDEOS_PRETES && <VideoClip clip="installer" />}
          <p class="hint">Ouvre ensuite l’app depuis son icône et connecte-toi avec la même adresse e-mail.</p>
        </section>
        <button class="btn btn-secondary btn-lg btn-block" onClick={() => setStep('me')}>Continuer ici pour l’instant</button>
      </div>
    );
  }
  // Fin de connexion ou de création : données retrouvées d'un autre appareil → l'app s'ouvre directement.
  const done = () => {
    if (state.settings.onboarded) { location.hash = '#/'; return; }
    setStep(standalone ? 'me' : 'installer');
  };
  const essayer = () => { logUsage('demo'); enterDemo(); };

  // App installée (ouverte depuis son icône) : un écran de connexion, pas le site.
  if (standalone) {
    return (
      <main class="welcome">
        <h1 class="sr-only">Connexion à Arvela</h1>
        <LockupStacked />
        <section class="card">
          {signedIn ? (
            <div class="stack">
              <p class="row"><Icon name="cloud" />Connectée avec <strong>{cloud.email}</strong></p>
              <button class="btn btn-primary btn-lg btn-block" onClick={() => setStep('me')}>Continuer</button>
            </div>
          ) : <AccountForm initial="login" onDone={done} />}
        </section>
        <p class="hero-login center"><button class="btn-link" type="button" onClick={essayer}>Voir un exemple</button></p>
      </main>
    );
  }

  // Page d'accueil (piste B « l'action d'abord ») : tout ce qui sert à décider tient dans le premier écran du téléphone.
  const ouvrir = (mode: 'create' | 'login') => {
    logUsage(mode === 'create' ? 'accueil_creer' : 'accueil_connexion');
    setForm(mode);
    requestAnimationFrame(() => {
      const el = document.getElementById('compte');
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  };
  return (
    <div class="landing">
      <header class="site-nav">
        <a class="site-brand" href="#/" aria-label="Arvela, accueil">
          <Logo size={36} />
          <span class="site-brand-text" aria-hidden="true"><span class="site-brand-name">Arvela</span></span>
        </a>
        <nav class="site-links" aria-label="Liens">
          <a href="#/confidentialite">Tes données</a>
          <a href="#/mentions">Mentions légales</a>
        </nav>
        {!signedIn && form !== 'login' && (
          <div class="site-actions">
            <button class="btn-link" type="button" onClick={() => ouvrir('login')}>Me connecter</button>
          </div>
        )}
      </header>

      <main class="landing-main">
      <div class="hero">
        <div class="hero-copy">
          <h1 class="hero-title">L’équilibre entre <em>l’accueil de l’enfant</em> et la rigueur du contrat.</h1>
          <p class="hero-lead">L’app des assistantes maternelles : arrivées et départs, carnet des parents, montants Pajemploi et congés.</p>
          {signedIn ? (
            <div class="hero-form stack">
              <p class="row"><Icon name="cloud" />Connectée avec <strong>{cloud.email}</strong></p>
              <button class="btn btn-primary btn-lg btn-block" onClick={() => setStep('installer')}>Continuer</button>
            </div>
          ) : form ? (
            <>
              <section id="compte" class="hero-form" aria-label="Compte">
                <AccountForm key={form} initial={form} onDone={done} />
              </section>
              <p class="hero-login">Pas encore décidée ? <button class="btn-link" type="button" onClick={essayer}>Essayer sans compte</button></p>
            </>
          ) : (
            <>
              <div class="hero-cta">
                <button class="btn btn-primary btn-lg" type="button" onClick={() => ouvrir('create')}>Créer mon compte gratuit</button>
                <button class="btn btn-secondary btn-lg" type="button" onClick={essayer}>Essayer sans compte</button>
              </div>
              <p class="hero-login">Déjà inscrite ? <button class="btn-link" type="button" onClick={() => ouvrir('login')}>Me connecter</button></p>
            </>
          )}
          <p class="hero-meta"><span>Gratuit pendant le test</span><span>Hébergé à Paris</span><span>Sans App Store</span></p>
        </div>
        {VIDEOS_PRETES && <div class="hero-video"><VideoClip clip="quotidien" /></div>}
      </div>

      {VIDEOS_PRETES && (
        <button class="vid-row" type="button" onClick={() => { logUsage('accueil_video'); setVideo(true); }}>
          <span class="vid-thumb" aria-hidden="true"><span class="video-play"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span></span>
          <span>
            <b>Une journée avec Arvela</b>
            <small>Pointer, noter un repas, préparer le mois.</small>
            <span class="dur">VIDÉO · 1:00</span>
          </span>
        </button>
      )}
      </main>
      {video && <Sheet title="Une journée avec Arvela" onClose={() => setVideo(false)}><VideoClip clip="quotidien" autoStart /></Sheet>}

      <footer class="site-footer">
        <Logo size={24} />
        <span class="site-footer-url">arvela.fr</span>
        <a href="#/confidentialite">Confidentialité</a>
        <a href="#/mentions">Mentions légales</a>
      </footer>
    </div>
  );
}

export function Installer() {
  return (
    <>
      <Topbar title="Installer l’app" back="#/plus" screen="installer" />
      <main>
        {isStandalone() ? <Banner tone="ok">L’app est déjà installée : tu l’utilises depuis son icône.</Banner> : <><InstallButton /><InstallSteps />{VIDEOS_PRETES && <VideoClip clip="installer" />}</>}
        <section class="card stack-sm">
          <h2>Hors ligne</h2>
          <p>Une fois installée, l’app marche sans réseau : à la maison, au parc, en sortie.</p>
        </section>
      </main>
    </>
  );
}
