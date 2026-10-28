import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadState } from './state';
import { App } from './ui/App';

async function boot(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;
  try {
    await loadState();
  } catch (err) {
    root.innerHTML = `<main class="welcome"><h1>Oups</h1><p>Les données n’ont pas pu être lues sur ce téléphone (${
      err instanceof Error ? err.message : 'erreur inconnue'
    }). Ferme l’app et rouvre-la. Si cela continue, restaure une sauvegarde.</p></main>`;
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

void boot();
