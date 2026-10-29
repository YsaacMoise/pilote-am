import { useEffect, useState } from 'preact/hooks';
import { logUsage, useStore } from './store';
import { isDemo, MODE_KEY, deleteDatabase } from './db';
import { Toaster } from './ui/kit';
import { Icon, type IconName } from './ui/icons';
import { Today } from './screens/Today';
import { Carnet } from './screens/Carnet';
import { Mois } from './screens/Mois';
import { Plus } from './screens/Plus';
import { Contrat } from './screens/Contrat';
import { Avenant } from './screens/Avenant';
import { Historique } from './screens/Historique';
import { Controle } from './screens/Controle';
import { Conges } from './screens/Conges';
import { Fin } from './screens/Fin';
import { Fiscal } from './screens/Fiscal';
import { Sauvegarde } from './screens/Sauvegarde';
import { Pilote } from './screens/Pilote';
import { Reglages } from './screens/Reglages';
import { Regles } from './screens/Regles';
import { Installer, Welcome } from './screens/Welcome';

function useHash(): string {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => {
      setH(location.hash || '#/');
      window.scrollTo(0, 0);
      // Annonce le nouvel écran aux lecteurs d'écran : le focus va sur le titre.
      requestAnimationFrame(() => {
        const h1 = document.querySelector<HTMLElement>('.topbar h1, .welcome h1');
        if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
      });
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '#/', label: 'Aujourd’hui', icon: 'today', match: (p) => p === '' },
  { href: '#/carnet', label: 'Carnet', icon: 'book', match: (p) => p === 'carnet' },
  { href: '#/mois', label: 'Mois', icon: 'euro', match: (p) => p === 'mois' || p === 'controle' },
  { href: '#/plus', label: 'Plus', icon: 'more', match: (p) => !['', 'carnet', 'mois', 'controle'].includes(p) },
];

export function App() {
  const s = useStore();
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, '').split('/');
  const p = parts[0] ?? '';
  useEffect(() => { if (s.ready) logUsage('ecran', p || 'aujourdhui'); }, [p, s.ready]);
  useEffect(() => {
    const title = ({
      '': 'Aujourd’hui', carnet: 'Carnet', mois: 'Mois', plus: 'Plus', contrat: 'Contrat', avenant: 'Avenant', historique: 'Historique',
      controle: 'Contrôle du bulletin', conges: 'Congés', fin: 'Fin de contrat', fiscal: 'Impôts', sauvegarde: 'Sauvegarde',
      pilote: 'Données du pilote', reglages: 'Réglages', regles: 'Comment l’app calcule', installer: 'Installer',
    } as Record<string, string>)[p] ?? 'Pilote AM';
    document.title = `${title} · Pilote AM`;
  }, [p]);

  if (!s.ready) return null;
  if (!s.settings.onboarded && !isDemo()) {
    return <><Welcome /><Toaster /></>;
  }

  let screen;
  switch (p) {
    case '': screen = <Today />; break;
    case 'carnet': screen = <Carnet />; break;
    case 'mois': screen = <Mois month={parts[1]} cid={parts[2]} />; break;
    case 'plus': screen = <Plus />; break;
    case 'contrat': screen = <Contrat key={parts[1]} id={parts[1] === 'nouveau' ? undefined : parts[1]} />; break;
    case 'avenant': screen = <Avenant key={hash} cid={parts[1]} aid={parts[2] === 'nouveau' ? undefined : parts[2]} />; break;
    case 'historique': screen = <Historique id={parts[1]} />; break;
    case 'controle': screen = <Controle key={hash} cid={parts[1]} month={parts[2]} />; break;
    case 'conges': screen = <Conges />; break;
    case 'fin': screen = <Fin key={hash} id={parts[1]} />; break;
    case 'fiscal': screen = <Fiscal />; break;
    case 'sauvegarde': screen = <Sauvegarde />; break;
    case 'pilote': screen = <Pilote />; break;
    case 'reglages': screen = <Reglages />; break;
    case 'regles': screen = <Regles />; break;
    case 'installer': screen = <Installer />; break;
    case 'bienvenue': screen = <Welcome />; break;
    default: screen = <Today />;
  }

  return (
    <>
      {isDemo() && (
        <div class="demo-banner" role="region" aria-label="Mode découverte">
          <Icon name="info" size={20} />
          <span>Enfants d’exemple</span>
          <button onClick={async () => {
            try { localStorage.removeItem(MODE_KEY); } catch { /* */ }
            await deleteDatabase('pam-demo');
            location.hash = '#/';
            location.reload();
          }}>Quitter l’exemple</button>
        </div>
      )}
      <div class="app">
        {screen}
        <nav class="tabbar" aria-label="Navigation principale">
          {TABS.map((t) => (
            <a href={t.href} aria-current={t.match(p) ? 'page' : undefined}>
              <span class="tab-ico"><Icon name={t.icon} /></span>
              {t.label}
            </a>
          ))}
        </nav>
      </div>
      <Toaster />
    </>
  );
}
