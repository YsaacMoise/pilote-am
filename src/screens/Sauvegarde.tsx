import { useEffect, useState } from 'preact/hooks';
import { listSnapshots, logUsage, restoreDump, saveSettings, toast, useStore, type Snapshot } from '../store';
import { buildBackup, checkBackup, type BackupFile } from '../backup';
import { shareFile } from '../share';
import { Banner, Sheet, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

export function Sauvegarde() {
  const s = useStore();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: string } | null>(null);
  const [pendingSnap, setPendingSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState('');
  const [persist, setPersist] = useState<boolean | null>(null);
  useEffect(() => {
    listSnapshots().then(setSnaps).catch(() => {});
    navigator.storage?.persisted?.().then(setPersist).catch(() => setPersist(null));
  }, [s.settings.lastAutoCopy]);
  const last = s.settings.lastBackup;

  async function backup() {
    const f = await buildBackup();
    const r = await shareFile(f);
    logUsage('sauvegarde_' + r, 'sauvegarde');
    if (r === 'shared' || r === 'downloaded') {
      await saveSettings({ lastBackup: Date.now() });
      toast(r === 'shared' ? 'Sauvegarde prête. Choisis « Enregistrer dans Fichiers ».' : 'Fichier de sauvegarde téléchargé.');
    } else if (r === 'failed') toast('La sauvegarde n’a pas pu être partagée.', undefined, 'warn');
  }

  return (
    <>
      <Topbar title="Sauvegarde" back="#/plus" screen="sauvegarde" />
      <main>
        <section class="card stack">
          <h2>Sauvegarde de la semaine</h2>
          <p>Tes données ne sont que sur ce téléphone. Une fois par semaine, enregistre une copie dans l’app Fichiers (iCloud Drive) : si le téléphone est perdu, tu pourras tout récupérer.</p>
          <p class="muted">{last ? `Dernière sauvegarde : ${new Date(last).toLocaleDateString('fr-FR', { dateStyle: 'full' })}.` : 'Aucune sauvegarde pour l’instant.'}</p>
          <button class="btn btn-primary btn-lg btn-block" onClick={backup}><Icon name="share" />Sauvegarder dans Fichiers</button>
          <p class="hint">Dans la feuille de partage, choisis « Enregistrer dans Fichiers », puis iCloud Drive.</p>
        </section>

        <section class="card stack">
          <h2>Restaurer une sauvegarde</h2>
          <p>Remplace toutes les données de l’app par celles du fichier. Une copie de l’état actuel est gardée avant.</p>
          <label class="btn btn-outline btn-block">
            <Icon name="upload" />Choisir un fichier de sauvegarde
            <input type="file" accept="application/json,.json" class="sr-only" onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              (e.target as HTMLInputElement).value = '';
              if (!f) return;
              const r = await checkBackup(f);
              if (!r.ok) { setErr(r.error); return; }
              setErr('');
              setPending({ backup: r.backup, summary: r.summary });
            }} />
          </label>
          {err && <Banner tone="warn">{err}</Banner>}
        </section>

        <section class="card stack">
          <h2>Copies automatiques</h2>
          <p class="muted">Chaque jour d’utilisation, l’app garde une copie sur le téléphone (les 7 dernières). Utile pour revenir en arrière après une erreur.</p>
          {snaps.length === 0 ? <p class="muted">Pas encore de copie.</p> : (
            <div class="list">
              {snaps.map((sn) => (
                <button class="li" onClick={() => setPendingSnap(sn)}>
                  <span class="li-main">
                    <span class="li-title">{new Date(sn.ts).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
                    <span class="li-sub">{(sn.data.contracts as unknown[]).length} contrat(s)</span>
                  </span>
                  <span class="li-end">Restaurer</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section class="card stack">
          <h2>Stockage protégé</h2>
          {persist ? (
            <p class="row"><span class="check-ok"><Icon name="check" /></span>Le téléphone ne videra pas les données de l’app pour faire de la place.</p>
          ) : (
            <>
              <p>Demande au téléphone de ne pas effacer les données de l’app quand il manque de place.</p>
              <button class="btn btn-outline" onClick={async () => {
                const ok = await navigator.storage?.persist?.().catch(() => false);
                setPersist(!!ok);
                await saveSettings({ persisted: !!ok });
                toast(ok ? 'Stockage protégé.' : 'Le téléphone n’a pas accepté pour l’instant. Installer l’app sur l’écran d’accueil aide.');
              }}>Protéger le stockage</button>
            </>
          )}
        </section>
      </main>
      {pending && (
        <Sheet title="Restaurer cette sauvegarde ?" onClose={() => setPending(null)}>
          <p>{pending.summary}.</p>
          <Banner tone="warn">Tout ce qui est dans l’app maintenant sera remplacé. Une copie automatique est faite juste avant.</Banner>
          <button class="btn btn-primary btn-lg btn-block" onClick={async () => {
            await restoreDump(pending.backup.data);
            logUsage('restauration', 'sauvegarde');
            setPending(null);
            toast('Sauvegarde restaurée.');
          }}>Remplacer par la sauvegarde</button>
          <button class="btn btn-ghost btn-block" onClick={() => setPending(null)}>Garder mes données actuelles</button>
        </Sheet>
      )}
      {pendingSnap && (
        <Sheet title="Revenir à cette copie ?" onClose={() => setPendingSnap(null)}>
          <p>Copie du {new Date(pendingSnap.ts).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}.</p>
          <Banner tone="warn">Les changements faits depuis seront remplacés. Une copie de l’état actuel est faite juste avant.</Banner>
          <button class="btn btn-primary btn-lg btn-block" onClick={async () => {
            await restoreDump(pendingSnap.data);
            setPendingSnap(null);
            toast('Copie restaurée.');
          }}>Revenir à cette copie</button>
        </Sheet>
      )}
    </>
  );
}
