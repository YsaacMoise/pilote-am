import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { addMonthsYM, formatLongDate, formatYearMonth, yearMonth, type ISODate } from '../engine/dates';
import { formatRate } from '../engine/money';
import { RATES, type RateCode } from '../engine/rates';
import { childOf, familyOf, initialsOf, kidClass } from '../derive';
import { pilotExport } from '../pilot';
import { pickFile, shareFile } from '../share';
import { isStandalone, listSnapshots, requestPersistence, type Snapshot } from '../storage';
import { getState, logEvent, parseState, replaceState, todayISO, update, type AppState } from '../state';
import { useAppState } from './hooks';
import { Icon } from './icons';
import { Banner, DateField, Group, Magnet, Row, Screen, Sheet, TextField, toast, Toggle, useNav } from './kit';
import { InstallSteps } from './welcome';

declare const __APP_VERSION__: string | undefined;

function daysSince(iso: string | undefined, today: ISODate): number | null {
  if (!iso) return null;
  return Math.floor((Date.parse(`${today}T12:00:00`) - Date.parse(iso)) / 86_400_000);
}

export function backupDue(s: AppState, today: ISODate): boolean {
  if (s.contracts.length === 0) return false;
  const d = daysSince(s.settings.lastBackupAt, today);
  return d === null || d >= 7;
}

export async function backupNow(): Promise<boolean> {
  const s = getState();
  const outcome = await shareFile(JSON.stringify(s), `pilote-am-sauvegarde-${todayISO()}.json`, 'application/json');
  if (outcome === 'shared') {
    update((st) => ({ ...st, settings: { ...st.settings, lastBackupAt: new Date().toISOString() } }));
    logEvent('sauvegarde', 'faite');
    return true;
  }
  return false;
}

export function SettingsScreen(): ReactElement {
  const s = useAppState();
  const nav = useNav();
  const today = todayISO();
  const last = daysSince(s.settings.lastBackupAt, today);
  const current = s.contracts.filter((c) => !c.endDate || c.endDate >= today);
  const ended = s.contracts.filter((c) => c.endDate && c.endDate < today);

  return (
    <Screen title="Réglages">
      <Group title="Contrats">
        {current.map((c) => {
          const k = childOf(s, c);
          return (
            <Row
              key={c.id}
              leading={<Magnet name={k?.firstName ?? '?'} initials={initialsOf(s, k)} color={kidClass(k)} small />}
              title={k?.firstName ?? '?'}
              sub={`Famille ${familyOf(s, c)?.name ?? ''} · depuis le ${formatLongDate(c.startDate)}${c.endDate ? ` · fin le ${formatLongDate(c.endDate)}` : ''}`}
              onClick={() => nav.push({ name: 'contract', contractId: c.id })}
            />
          );
        })}
        <Row title={<span style={{ color: 'var(--tint)', fontWeight: 600 }}>Ajouter un contrat</span>} leading={<span className="magnet small kid-6" style={{ background: 'var(--tint-soft)', color: 'var(--tint)' }} aria-hidden="true"><Icon name="plus" size={20} stroke={2.4} /></span>} onClick={() => nav.push({ name: 'contract' })} />
      </Group>
      {ended.length > 0 && (
        <Group title="Contrats terminés">
          {ended.map((c) => {
            const k = childOf(s, c);
            return <Row key={c.id} title={k?.firstName ?? '?'} sub={`Fini le ${formatLongDate(c.endDate ?? '')}`} onClick={() => nav.push({ name: 'contract', contractId: c.id })} />;
          })}
        </Group>
      )}

      <Group title="Sauvegarde" note="Les données ne sont que sur ce téléphone. Une sauvegarde par semaine dans Fichiers (ou iCloud Drive) évite de tout perdre.">
        <Row
          title="Sauvegarder maintenant"
          sub={last === null ? 'Jamais faite' : last === 0 ? 'Faite aujourd’hui' : `Dernière il y a ${last} jour${last > 1 ? 's' : ''}`}
          value={last === null || last >= 7 ? <span className="status status-todo">À faire</span> : <span className="status status-ok">À jour</span>}
          onClick={() => void backupNow().then((ok) => ok && toast('Sauvegarde enregistrée'))}
        />
        <Row title="Restaurer, copies automatiques" onClick={() => nav.push({ name: 'backup' })} />
      </Group>

      <Group title="Toi">
        <Row title="Profil" sub={s.profile?.firstName} onClick={() => nav.push({ name: 'profile' })} />
      </Group>

      <Group title="Pilote">
        <Row title="Export du mois" sub="Usage du site, sans aucun prénom" onClick={() => nav.push({ name: 'pilot' })} />
      </Group>

      <Group title="À propos">
        <Row title="Taux utilisés" onClick={() => nav.push({ name: 'rates' })} />
        <Row title="Installer sur l’écran d’accueil" sub={isStandalone() ? 'Déjà installé' : 'Recommandé'} onClick={() => nav.push({ name: 'install' })} />
      </Group>
      <p className="group-note" style={{ textAlign: 'center' }}>
        Version {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'} · aucun compte, aucune donnée envoyée.
      </p>
    </Screen>
  );
}

export function ProfileScreen(): ReactElement {
  const s = useAppState();
  const p = s.profile ?? { firstName: '', hasProfessionalTitle: false, childrenBirthDates: [], atLeast21: true };
  const [newKid, setNewKid] = useState('');
  const set = (patch: Partial<typeof p>): void => update((st) => ({ ...st, profile: { ...p, ...patch } }));
  return (
    <Screen title="Profil" back="Réglages">
      <Group title="Toi">
        <TextField label="Prénom" value={p.firstName} onChange={(v) => set({ firstName: v })} autoComplete="given-name" />
        <Toggle label="J’ai le titre d’assistante maternelle" hint="Le salaire minimum est un peu plus haut" checked={p.hasProfessionalTitle} onChange={(v) => set({ hasProfessionalTitle: v })} />
        <Toggle label="J’avais 21 ans ou plus au 30 avril" checked={p.atLeast21} onChange={(v) => set({ atLeast21: v })} />
      </Group>
      <Group title="Tes enfants de moins de 15 ans" note="Chaque enfant à charge donne 2 jours de congés en plus par an (dans la limite de 30 jours). Seule la date de naissance est gardée.">
        {p.childrenBirthDates.map((d, i) => (
          <Row
            key={`${d}-${i}`}
            title={`Né le ${formatLongDate(d)} ${d.slice(0, 4)}`}
            value={<button className="btn btn-plain" style={{ color: 'var(--negative)' }} onClick={() => set({ childrenBirthDates: p.childrenBirthDates.filter((_, j) => j !== i) })}>Retirer</button>}
          />
        ))}
        <DateField label="Date de naissance" value={newKid} onChange={setNewKid} />
        <div className="row">
          <button className="btn btn-soft" disabled={!newKid} onClick={() => { set({ childrenBirthDates: [...p.childrenBirthDates, newKid].sort() }); setNewKid(''); }}>
            <Icon name="plus" size={18} stroke={2.4} /> Ajouter
          </button>
        </div>
      </Group>
    </Screen>
  );
}

export function BackupScreen(): ReactElement {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [pending, setPending] = useState<{ state: AppState; label: string } | null>(null);
  const [persist, setPersist] = useState<string | null>(null);
  const close = useCallback(() => setPending(null), []);

  useEffect(() => {
    listSnapshots().then(setSnapshots).catch(() => setSnapshots([]));
    void requestPersistence().then(setPersist);
  }, []);

  const fromFile = async (): Promise<void> => {
    const [file] = await pickFile('application/json,.json');
    if (!file) return;
    try {
      const state = parseState(await file.text());
      setPending({ state, label: `le fichier « ${file.name} »` });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Fichier illisible');
    }
  };

  return (
    <Screen title="Sauvegarde" back="Réglages">
      <div className="actions">
        <button className="btn btn-primary btn-block" onClick={() => void backupNow().then((ok) => ok && toast('Sauvegarde enregistrée'))}>
          <Icon name="download" size={20} /> Sauvegarder dans Fichiers
        </button>
        <p className="group-note" style={{ textAlign: 'center' }}>Dans la feuille qui s’ouvre, choisis « Enregistrer dans Fichiers ».</p>
        <button className="btn btn-soft btn-block" onClick={() => void fromFile()}>
          <Icon name="upload" size={20} /> Restaurer depuis un fichier
        </button>
      </div>
      <Group title="Copies automatiques" note="Une copie par jour d’utilisation, les 14 derniers jours, sur ce téléphone.">
        {snapshots.length === 0 && <Row title="Aucune copie pour l’instant" />}
        {snapshots.map((snap) => (
          <Row
            key={snap.day}
            title={formatLongDate(snap.day).replace(/^./, (c) => c.toUpperCase())}
            sub={`Enregistrée à ${new Date(snap.savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            onClick={() => {
              try {
                setPending({ state: parseState(snap.json), label: `la copie du ${formatLongDate(snap.day)}` });
              } catch {
                toast('Copie abîmée');
              }
            }}
          />
        ))}
      </Group>
      {persist && (
        <p className="group-note">
          {persist === 'persistent'
            ? 'Le téléphone a accepté de garder les données de ce site.'
            : 'Le téléphone peut effacer les données d’un site peu utilisé : les sauvegardes sont d’autant plus utiles.'}
        </p>
      )}
      {pending && (
        <Sheet
          open
          onClose={close}
          title="Remplacer les données ?"
          action={{
            label: 'Remplacer',
            onClick: () => {
              const before = getState();
              replaceState(pending.state);
              logEvent('sauvegarde', 'restauree');
              setPending(null);
              toast('Données restaurées', () => replaceState(before));
            },
          }}
        >
          <p className="sheet-lead">Tout ce qui est sur le téléphone sera remplacé par {pending.label}.</p>
          <div className="group">
            <Row title="Contrats" value={String(pending.state.contracts.length)} />
            <Row title="Journées saisies" value={String(pending.state.entries.length)} />
            <Row title="Notes du carnet" value={String(pending.state.notes.length)} />
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

export function PilotScreen(): ReactElement {
  const s = useAppState();
  const today = todayISO();
  const months = [yearMonth(today), addMonthsYM(yearMonth(today), -1), addMonthsYM(yearMonth(today), -2)];
  return (
    <Screen title="Pilote" back="Réglages">
      <Banner>
        <p>Ce fichier dit comment le site est utilisé : écrans ouverts, actions, ce qui a coincé. Aucun prénom, aucun montant, aucune note du carnet. Les enfants deviennent A, B, C.</p>
      </Banner>
      <Group title="Exporter un mois">
        {months.map((m) => (
          <Row
            key={m}
            title={formatYearMonth(m).replace(/^./, (c) => c.toUpperCase())}
            sub={`${s.journal.filter((e) => e.at.startsWith(m)).length} actions · ${s.reports.filter((r) => r.at.startsWith(m)).length} signalements`}
            onClick={() => void shareFile(pilotExport(s, m), `pilote-am-usage-${m}.json`, 'application/json')}
          />
        ))}
      </Group>
      <Group title="Ce qui a coincé">
        {s.reports.length === 0 && <Row title="Rien pour l’instant" />}
        {[...s.reports].reverse().slice(0, 20).map((r) => (
          <Row key={r.at} title={r.note} sub={`${r.screen} · ${new Date(r.at).toLocaleDateString('fr-FR')}`} />
        ))}
      </Group>
    </Screen>
  );
}

const RATE_LABELS: Record<RateCode, string> = {
  SMIC_HORAIRE: 'SMIC horaire brut',
  MINIMUM_GARANTI: 'Minimum garanti',
  ENTRETIEN_FORFAIT_JOUR: 'Entretien minimum par jour',
  SALAIRE_MIN_NET: 'Salaire minimum net par heure',
  SALAIRE_MIN_NET_TITRE: 'Salaire minimum net, avec titre',
  SALAIRE_MIN_BRUT: 'Salaire minimum brut par heure',
};

export function RatesScreen(): ReactElement {
  const codes = Object.keys(RATE_LABELS) as RateCode[];
  return (
    <Screen title="Taux utilisés" back="Réglages">
      {codes.map((code) => (
        <Group key={code} title={RATE_LABELS[code]}>
          {RATES.filter((r) => r.code === code).map((r) => (
            <Row key={r.from} title={formatRate(r.value)} sub={`${r.to ? `Du ${formatLongDate(r.from)} ${r.from.slice(0, 4)} au ${formatLongDate(r.to)} ${r.to.slice(0, 4)}` : `Depuis le ${formatLongDate(r.from)} ${r.from.slice(0, 4)}`} · ${r.source}`} />
          ))}
        </Group>
      ))}
      <p className="group-note">Quand un taux change, une nouvelle ligne datée est ajoutée : les mois passés gardent leurs anciens taux.</p>
    </Screen>
  );
}

export function InstallScreen(): ReactElement {
  return (
    <Screen title="Installer" back="Réglages">
      <div className="welcome" style={{ paddingTop: 8 }}>
        <p>Ouvre le site dans Safari, puis :</p>
        <InstallSteps />
        <Banner tone="warn">
          <p>Utilise toujours l’icône. Safari et l’icône ont chacun leurs propres données.</p>
        </Banner>
      </div>
    </Screen>
  );
}
