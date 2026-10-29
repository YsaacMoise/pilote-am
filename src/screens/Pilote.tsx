import { useState } from 'preact/hooks';
import { logUsage, saveSettings, toast, useStore } from '../store';
import { addMonths, monthLabel, monthOf, today, type Month } from '../engine/dates';
import { buildPilotExport } from '../backup';
import { jsonFile, shareFile } from '../share';
import { Banner, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

const SCREEN_NAMES: Record<string, string> = {
  aujourdhui: 'Aujourd’hui', carnet: 'Carnet', mois: 'Mois', plus: 'Plus', contrat: 'Contrat', historique: 'Historique',
  controle: 'Contrôle', conges: 'Congés', fin: 'Fin de contrat', fiscal: 'Impôts', sauvegarde: 'Sauvegarde', pilote: 'Pilote',
  reglages: 'Réglages', regles: 'Règles', installer: 'Installer', bienvenue: 'Accueil',
};

export function Pilote() {
  const s = useStore();
  const [m, setM] = useState<Month>(addMonths(monthOf(today()), -1));
  const [preview, setPreview] = useState(false);
  const data = buildPilotExport(m);
  const due = s.settings.lastExport !== addMonths(monthOf(today()), -1) && today().slice(8) <= '10';
  return (
    <>
      <Topbar title="Données du pilote" back="#/plus" screen="pilote" />
      <main>
        <p>Arvela est en test. Chaque mois, envoie l’export anonymisé à YKM : il sert à construire l’app finale. Il ne contient <b>aucun prénom</b> (les enfants deviennent A, B, C) et <b>aucune note du carnet</b>.</p>
        {due && <Banner tone="info">L’export de {monthLabel(addMonths(monthOf(today()), -1))} est prêt.</Banner>}
        <section class="card stack">
          <div class="month-nav">
            <button class="icon-btn" aria-label="Mois précédent" onClick={() => setM(addMonths(m, -1))}><Icon name="left" /></button>
            <h2 aria-live="polite">{monthLabel(m).replace(/^./, (x) => x.toUpperCase())}</h2>
            <button class="icon-btn" aria-label="Mois suivant" disabled={m >= monthOf(today())} onClick={() => setM(addMonths(m, 1))}><Icon name="right" /></button>
          </div>
          <div class="stat-grid">
            <div><b class="num">{data.usage.joursUtilises}</b><span>jours d’utilisation</span></div>
            <div><b class="num">{data.caCoince.length}</b><span>« Ça coince »</span></div>
            <div><b class="num">{data.enfants.length}</b><span>enfant(s)</span></div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" onClick={async () => {
            const r = await shareFile(jsonFile(`pilote-am-export-${m}.json`, data));
            if (r === 'shared' || r === 'downloaded') { await saveSettings({ lastExport: m }); toast('Export prêt à envoyer.'); }
            logUsage('export_pilote', 'pilote');
          }}><Icon name="share" />Partager l’export anonymisé</button>
          <button class="btn btn-ghost" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? 'Masquer le contenu' : 'Voir exactement ce qui est envoyé'}</button>
          {preview && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', background: 'var(--surface-2)', padding: '12px', borderRadius: '12px', overflowX: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>}
        </section>
        <section class="stack-sm" aria-labelledby="coince-t">
          <h2 id="coince-t" class="section-title">Tes « Ça coince »</h2>
          {s.feedback.length === 0 ? <p class="muted">Aucune remarque pour l’instant. Le bouton « Ça coince » est en haut de chaque écran.</p> : (
            <div class="list">
              {[...s.feedback].reverse().map((f) => (
                <div class="li"><span class="li-main"><span class="li-title">{f.text}</span><span class="li-sub">{SCREEN_NAMES[f.screen] ?? f.screen}, le {new Date(f.ts).toLocaleDateString('fr-FR')}</span></span></div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
