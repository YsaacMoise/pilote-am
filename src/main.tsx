import { render } from 'preact';
import './styles.css';
import { App } from './app';
import { load, state, toast } from './store';
import { getAll, isDemo } from './db';
import { seedDemo } from './demo';

// Android, Chrome et Edge proposent une vraie installation : on garde l'événement pour le bouton « Installer ».
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__pamInstall = e;
  window.dispatchEvent(new Event('pam-install-ready'));
});

async function start() {
  try {
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
