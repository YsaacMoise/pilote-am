import { useEffect, useState } from 'preact/hooks';
import { saveSettings, logUsage, state, useStore } from '../store';
import { AccountForm } from './Compte';
import { useCloud } from '../cloud-state';
import { MODE_KEY } from '../db';
import { Banner, Sheet, Stepper, TextInput, Topbar } from '../ui/kit';
import { Logo } from '../ui/Logo';
import { VIDEOS_PRETES, VideoClip, VideoGuide, isIOS } from '../ui/VideoGuide';
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
  const [formMode, setFormMode] = useState<'create' | 'login'>('create');
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
  // Page d'accueil façon site (charte « Les Galets d'Équilibre ») : en-tête, accroche, aperçu de l'app, compte, exemple.
  const goCompte = (mode: 'create' | 'login') => {
    setFormMode(mode);
    requestAnimationFrame(() => {
      const el = document.getElementById('compte');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  };
  return (
    <div class="landing">
      <header class="site-nav">
        <a class="site-brand" href="#/" aria-label="Arvela, accueil">
          <Logo size={36} />
          <span class="site-brand-text" aria-hidden="true">
            <span class="site-brand-name">Arvela</span>
            <span class="site-brand-sub">Gestion & suivi de l’accueil</span>
          </span>
        </a>
        <nav class="site-links" aria-label="Sur cette page">
          <a href="#fonctions" onClick={(e) => { e.preventDefault(); document.getElementById('fonctions')?.scrollIntoView({ behavior: 'smooth' }); }}>Fonctionnalités</a>
          <a href="#/confidentialite">Tes données</a>
          <a href="#/mentions">Mentions légales</a>
        </nav>
        {!signedIn && (
          <div class="site-actions">
            <button class="btn btn-outline btn-sm" type="button" onClick={() => goCompte('login')}>Connexion</button>
            <button class="btn btn-accent btn-sm site-cta" type="button" onClick={() => goCompte('create')}>Créer un compte gratuit</button>
          </div>
        )}
      </header>

      <div class="hero">
        <div class="hero-copy">
          <p class="hero-badge"><span class="dot" aria-hidden="true" />Gratuit pendant la phase de test</p>
          <h1 class="hero-title">L’équilibre entre <em>l’accueil de l’enfant</em> et la rigueur du contrat.</h1>
          <p class="hero-lead">Conçu pour les assistantes maternelles agréées. Les arrivées et départs en un geste, le carnet pour les parents, le salaire à déclarer sur Pajemploi et tes congés, au même endroit.</p>
          <div class="hero-cta">
            <button class="btn btn-primary btn-lg" type="button" onClick={() => (signedIn ? setStep(standalone ? 'me' : 'installer') : goCompte('create'))}>{signedIn ? 'Continuer' : 'Démarrer avec Arvela'} <span aria-hidden="true">→</span></button>
            <button class="btn btn-secondary btn-lg" type="button" onClick={() => { logUsage('demo'); enterDemo(); }}>Voir un exemple</button>
          </div>
          <dl class="hero-facts" id={VIDEOS_PRETES ? undefined : 'fonctions'}>
            <div><dt>Paris</dt><dd>Données hébergées en France</dd></div>
            <div><dt>Hors ligne</dt><dd>Marche sans réseau</dd></div>
            <div><dt>Mobile</dt><dd>et ordinateur, sans store</dd></div>
          </dl>
        </div>

        <figure class="hero-preview">
          <figcaption class="sr-only">Aperçu de l’app avec des enfants fictifs</figcaption>
          <div class="preview-card" aria-hidden="true">
            <div class="preview-head">
              <Logo size={28} />
              <div class="preview-head-text">
                <b>Aujourd’hui</b>
                <span>3 enfants accueillis, tout est à jour</span>
              </div>
              <span class="preview-tag ok">En cours</span>
            </div>
            <div class="preview-row">
              <span class="gommette sm" style={{ '--g': '#C87D55' } as any}>L</span>
              <div class="preview-row-text"><b>Léo</b><span>Arrivé à 08h15 · repas et goûter</span></div>
              <div class="preview-row-end"><span class="num">08h15</span><span class="preview-tag ok">Présent</span></div>
            </div>
            <div class="preview-row">
              <span class="gommette sm" style={{ '--g': '#5E7165' } as any}>I</span>
              <div class="preview-row-text"><b>Inès</b><span>Prévue 08h30 → 18h00</span></div>
              <div class="preview-row-end"><span class="num">08h30</span><span class="preview-tag warn">À venir</span></div>
            </div>
            <div class="preview-total">
              <div><span class="preview-total-label">À déclarer ce mois</span><b class="num">856,54 €</b></div>
              <span class="preview-total-note">Provisoire</span>
            </div>
          </div>
        </figure>
      </div>

      {VIDEOS_PRETES && (
        <section id="fonctions" class="landing-video" aria-labelledby="video-t">
          <div class="landing-video-text">
            <span class="eyebrow">Comment ça marche</span>
            <h2 id="video-t" class="hero-subtitle">Deux vidéos courtes, pas une de plus.</h2>
            <p class="hero-lead">Moins d’une minute pour voir une journée avec Arvela. Une demi-minute pour l’installer, avec les gestes de ton téléphone. Commentées à voix haute, avec le texte à l’écran.</p>
          </div>
          <VideoGuide />
        </section>
      )}

      <section id="compte" class="landing-compte card">
        {signedIn ? (
          <div class="stack">
            <p class="row"><Icon name="cloud" />Connectée avec <strong>{cloud.email}</strong></p>
            <button class="btn btn-primary btn-lg btn-block" onClick={() => setStep(standalone ? 'me' : 'installer')}>Continuer</button>
          </div>
        ) : (
          <AccountForm key={formMode} initial={formMode} onDone={() => {
            // Données retrouvées d'un autre appareil : l'accueil est déjà fait, l'app s'ouvre directement.
            if (state.settings.onboarded) { location.hash = '#/'; return; }
            setStep(standalone ? 'me' : 'installer');
          }} />
        )}
      </section>

      <blockquote class="landing-quote">« La gestion sereine de l’accueil, élevée au rang d’art de vivre. »</blockquote>

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
