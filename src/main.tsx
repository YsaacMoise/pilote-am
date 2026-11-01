import { render } from 'preact';
import './styles.css';
import { App } from './app';
import { load, state, toast } from './store';
import { clearLegacyDemo, getAll, isDemo } from './db';
import { seedDemo } from './demo';
import { hasCloudAccount } from './cloud-state';
import { authAction } from './auth-action';
import { MotDePasse } from './screens/MotDePasse';
import { Parent } from './screens/Parent';
import { applyTheme } from './theme';

applyTheme();

/** Lien parent « #/p/{id}.{secret} » : la fin du lien, ou null */
function parentLink(): string | null {
  const m = /^#\/p\/([^/?]+)/.exec(location.hash);
  return m ? m[1] : null;
}

// Android, Chrome et Edge proposent une vraie installation : on garde l'événement pour le bouton « Installer ».
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__pamInstall = e;
  window.dispatchEvent(new Event('pam-install-ready'));
});

async function start() {
  // Lien « nouveau mot de passe » reçu par e-mail : page seule, sans données locales (marche aussi en navigation privée).
  if (authAction) { render(<MotDePasse action={authAction} />, document.getElementById('app')!); return; }
  // Lien privé des parents : page seule, sans les données du téléphone ni mesure d'usage.
  const pl = parentLink();
  if (pl) {
    render(<Parent link={pl} />, document.getElementById('app')!);
    window.addEventListener('hashchange', () => { if (parentLink() !== pl) location.reload(); });
    return;
  }
  try {
    await clearLegacyDemo();
    if (isDemo()) {
      const cs = await getAll('contracts');
      if (!cs.length) await seedDemo();
    }
    await load();
  } catch (e) {
    document.getElementById('app')!.innerHTML =
      '<div class="welcome"><h1 class="hero-title">Oups</h1><p>Le stockage du téléphone n’est pas accessible. En navigation privée, Safari bloque les données : ouvre l’app normalement.</p></div>';
    console.warn(e);
    return;
  }
  render(<App />, document.getElementById('app')!);
  // Compte en ligne déjà branché sur ce téléphone : on reprend la copie (Firebase chargé seulement dans ce cas).
  if (!isDemo() && hasCloudAccount()) import('./cloud').then((c) => c.startCloud()).catch(() => {});
  // Mesure d'usage du pilote : seulement après accord dans Réglages ; sinon, on efface toute trace laissée par une ancienne version.
  setTimeout(() => {
    import('./analytics').then((a) => (a.mesureActive() ? a.initAnalytics() : a.effacerTracesMesure())).catch(() => {});
  }, 1500);
  if (state.contracts.length && !state.settings.persisted) {
    navigator.storage?.persist?.().then((ok) => { if (ok) state.settings.persisted = true; }).catch(() => {});
  }
}

start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let asked = false;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const offer = (w: ServiceWorker) => {
      toast('Une nouvelle version est prête.', async () => { asked = true; w.postMessage('pam-skip-waiting'); }, undefined, 'Mettre à jour');
    };
    // Audit C-042 : chercher une nouvelle version à chaque retour dans l'app, et la reproposer si elle attend.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {});
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Premier passage (clients.claim) : pas de rechargement. Seulement après « Mettre à jour ».
      if (reloaded || !asked) return;
      reloaded = true;
      location.reload();
    });
  }).catch(() => {});
}
