import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { isStandalone } from '../storage';
import { logEvent, saveError, update } from '../state';
import { useAppState } from './hooks';
import { Icon, type IconName } from './icons';
import { NavContext, ScreenBoundary, setReportHandler, ToastHost, type Nav, type Route, type Tab } from './kit';
import { TodayScreen } from './today';
import { DetailScreen, MonthScreen } from './month';
import { SuiviScreen, ControleScreen, CongesScreen, FinScreen, ImpotsScreen } from './suivi';
import { SettingsScreen, ProfileScreen, BackupScreen, PilotScreen, RatesScreen, InstallScreen } from './settings';
import { ContractScreen } from './contract';
import { HistoryScreen } from './history';
import { Onboarding, PreviewStart, Welcome } from './welcome';

declare const __PREVIEW__: boolean;

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'today', label: 'Aujourd’hui', icon: 'today' },
  { id: 'month', label: 'Mois', icon: 'month' },
  { id: 'suivi', label: 'Suivi', icon: 'suivi' },
  { id: 'settings', label: 'Réglages', icon: 'settings' },
];

const SCREEN_NAMES: Record<Tab | Route['name'], string> = {
  today: 'Aujourd’hui',
  month: 'Mois',
  suivi: 'Suivi',
  settings: 'Réglages',
  controle: 'Contrôle du bulletin',
  conges: 'Congés payés',
  fin: 'Fin de contrat',
  impots: 'Impôts',
  detail: 'Détail du calcul',
  profile: 'Profil',
  contract: 'Contrat',
  history: 'Historique',
  backup: 'Sauvegarde',
  pilot: 'Pilote',
  rates: 'Taux',
  install: 'Installation',
};

function renderRoute(r: Route): ReactElement {
  switch (r.name) {
    case 'controle': return <ControleScreen {...(r.contractId ? { contractId: r.contractId } : {})} {...(r.month ? { month: r.month } : {})} />;
    case 'conges': return <CongesScreen />;
    case 'fin': return <FinScreen {...(r.contractId ? { contractId: r.contractId } : {})} />;
    case 'impots': return <ImpotsScreen />;
    case 'detail': return <DetailScreen contractId={r.contractId} month={r.month} />;
    case 'profile': return <ProfileScreen />;
    case 'contract': return <ContractScreen {...(r.contractId ? { contractId: r.contractId } : {})} />;
    case 'history': return <HistoryScreen contractId={r.contractId} />;
    case 'backup': return <BackupScreen />;
    case 'pilot': return <PilotScreen />;
    case 'rates': return <RatesScreen />;
    case 'install': return <InstallScreen />;
  }
}

function renderTab(t: Tab): ReactElement {
  switch (t) {
    case 'today': return <TodayScreen />;
    case 'month': return <MonthScreen />;
    case 'suivi': return <SuiviScreen />;
    case 'settings': return <SettingsScreen />;
  }
}

const EMPTY_STACKS: Record<Tab, Route[]> = { today: [], month: [], suivi: [], settings: [] };

export function App(): ReactElement {
  const s = useAppState();
  const [tab, setTabState] = useState<Tab>('today');
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>(EMPTY_STACKS);
  const [browserOk, setBrowserOk] = useState(() => isStandalone() || new URLSearchParams(location.search).has('app'));

  const top = stacks[tab][stacks[tab].length - 1];
  const screenName = SCREEN_NAMES[top?.name ?? tab];

  const setTab = useCallback((t: Tab) => {
    if (t === tab) setStacks((st) => ({ ...st, [t]: [] }));
    setTabState(t);
  }, [tab]);
  const push = useCallback((r: Route) => setStacks((st) => ({ ...st, [tab]: [...st[tab], r] })), [tab]);
  const pop = useCallback(() => setStacks((st) => ({ ...st, [tab]: st[tab].slice(0, -1) })), [tab]);
  const nav: Nav = useMemo(() => ({ tab, setTab, push, pop, screenName }), [tab, setTab, push, pop, screenName]);

  useEffect(() => {
    window.scrollTo(0, 0);
    logEvent(screenName, 'ouvert');
  }, [screenName, stacks]);

  useEffect(() => {
    setReportHandler((screen, note) => {
      update((st) => ({ ...st, reports: [...st.reports, { at: new Date().toISOString(), screen, note }] }));
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle('has-dock', tab === 'today' && !top);
  }, [tab, top]);

  if (__PREVIEW__ && !s.profile) {
    return (
      <NavContext.Provider value={nav}>
        <PreviewStart />
        <ToastHost />
      </NavContext.Provider>
    );
  }

  if (!browserOk && !__PREVIEW__ && s.contracts.length === 0 && !s.profile) {
    return <Welcome onContinue={() => setBrowserOk(true)} />;
  }

  if (!s.profile) {
    return (
      <NavContext.Provider value={nav}>
        <Onboarding />
        <ToastHost />
      </NavContext.Provider>
    );
  }

  const err = saveError();

  return (
    <NavContext.Provider value={nav}>
      {!browserOk && !__PREVIEW__ && (
        <div className="banner banner-bad" style={{ marginTop: 'calc(var(--safe-top) + 8px)' }} role="alert">
          <p><strong>Tu es dans Safari.</strong> Ouvre plutôt l’icône sur l’écran d’accueil : les données de Safari et de l’icône sont séparées.</p>
        </div>
      )}
      {err && (
        <div className="banner banner-bad" role="alert"><p><strong>Enregistrement impossible :</strong> {err}. Fais une sauvegarde dans Réglages.</p></div>
      )}
      <div key={`${tab}-${stacks[tab].length}`} className={tab === 'today' && !top ? 'with-dock-wrap' : undefined}>
        <ScreenBoundary onBack={() => (top ? pop() : setTab('today'))}>
          {top ? renderRoute(top) : renderTab(tab)}
        </ScreenBoundary>
      </div>
      <nav className="tabbar" aria-label="Onglets">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={26} stroke={tab === t.id ? 2.1 : 1.7} />
            {t.label}
          </button>
        ))}
      </nav>
      <ToastHost />
    </NavContext.Provider>
  );
}
