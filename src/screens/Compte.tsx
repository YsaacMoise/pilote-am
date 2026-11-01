import { useState } from 'preact/hooks';
import { cloudInfo, statusText, useCloud, type CloudStatus } from '../cloud-state';
import { toast, useStore } from '../store';
import { Banner, Sheet, TextInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

const cloud = () => import('../cloud');

/**
 * Formulaire de compte : création, connexion, mot de passe oublié.
 * `onDone` est appelé une fois le compte branché et les données réunies.
 */
export function AccountForm({ initial = 'create', initialEmail = '', onDone }: { initial?: 'create' | 'login'; initialEmail?: string; onDone?: () => void }) {
  const [mode, setMode] = useState<'create' | 'login' | 'reset'>(initial);
  const [email, setEmail] = useState(initialEmail);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Indique une adresse e-mail valable.'); return; }
    setBusy(true);
    try {
      const c = await cloud();
      if (mode === 'reset') {
        await c.resetPassword(email);
        setSent(true);
      } else {
        if (mode === 'create') await c.createAccount(email, pw);
        else await c.signIn(email, pw);
        onDone?.();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'reset') {
    return (
      <form key="reset" class="stack" onSubmit={submit} noValidate>
        <h2>Mot de passe oublié</h2>
        {sent ? (
          <Banner tone="ok">Si un compte existe pour cette adresse, un e-mail vient de partir. Ouvre le lien qu’il contient pour choisir un nouveau mot de passe.</Banner>
        ) : (
          <>
            <TextInput label="Adresse e-mail" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} error={error} />
            <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir un lien par e-mail'}</button>
          </>
        )}
        <button class="btn btn-ghost btn-block" type="button" onClick={() => { setMode('login'); setSent(false); setError(''); }}>Revenir à la connexion</button>
      </form>
    );
  }

  const create = mode === 'create';
  return (
    <form key={mode} class="stack" onSubmit={submit} noValidate>
      <h2>{create ? 'Crée ton compte' : 'Connecte-toi'}</h2>
      <TextInput label="Adresse e-mail" type="email" inputMode="email" autoComplete={create ? 'email' : 'username'} value={email} onChange={setEmail} />
      <TextInput
        label="Mot de passe" type="password" autoComplete={create ? 'new-password' : 'current-password'} value={pw} onChange={setPw}
        hint={create ? '8 caractères au moins.' : undefined}
      />
      {error && <Banner tone="warn">{error}</Banner>}
      {create && <p class="hint">Ton compte garde une copie de tes données, hébergée à Paris. <a href="#/confidentialite">Ce qui est gardé et tes droits</a></p>}
      <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
        {busy ? (create ? 'Création…' : 'Connexion…') : create ? 'Créer mon compte' : 'Me connecter'}
      </button>
      {create ? (
        <button class="btn btn-ghost btn-block" type="button" onClick={() => { setMode('login'); setError(''); }}>J’ai déjà un compte</button>
      ) : (
        <div class="btn-row">
          <button class="btn btn-ghost" type="button" onClick={() => { setMode('reset'); setError(''); }}>Mot de passe oublié</button>
          <button class="btn btn-ghost" type="button" onClick={() => { setMode('create'); setError(''); }}>Créer un compte</button>
        </div>
      )}
    </form>
  );
}

const TONE: Record<CloudStatus, 'ok' | 'info' | 'warn'> = {
  off: 'info', starting: 'info', merging: 'info', choice: 'warn', synced: 'ok', pending: 'info', offline: 'info', error: 'warn',
};

export function Compte() {
  const c = useCloud();
  useStore();
  const [confirmOut, setConfirmOut] = useState(false);
  const [del, setDel] = useState(false);
  const signedIn = !!c.email && c.status !== 'off';

  const out = async (force: boolean) => {
    const ok = await (await cloud()).signOut(force);
    if (!ok) { setConfirmOut(true); return; }
    setConfirmOut(false);
    toast('Tu es déconnectée. Tes données restent sur ce téléphone.');
  };

  return (
    <>
      <Topbar title="Compte" back="#/plus" screen="compte" />
      <main>
        {!signedIn ? (
          <section class="card"><AccountForm onDone={() => { if (cloudInfo().status !== 'choice') toast('Compte branché : tes données sont copiées en ligne.', undefined, 'ok'); }} /></section>
        ) : (
          <>
            <section class="card stack-sm">
              <p class="row"><Icon name="user" /><strong>{c.email}</strong></p>
              <Banner tone={TONE[c.status]} icon={c.status === 'synced' ? 'cloud' : undefined}>{statusText(c)}</Banner>
              {c.status !== 'choice' && <p class="hint">Chaque changement est rangé sur le téléphone puis copié dans ton compte dès qu’il y a du réseau. Sur un autre appareil, connecte-toi avec la même adresse pour tout retrouver.</p>}
            </section>
            {c.status === 'choice' && <LinkChoice />}
            <div class="stack">
              <button class="btn btn-outline btn-block" onClick={() => void out(false)}>Me déconnecter</button>
              <button class="btn btn-danger btn-block" onClick={() => setDel(true)}>Supprimer mon compte</button>
            </div>
          </>
        )}
        <section class="card stack-sm">
          <h2 class="row"><Icon name="lock" />Où vont tes données</h2>
          <p>La copie de tes données est rangée chez Google Firebase, sur des serveurs à Paris. Ton adresse e-mail et ton mot de passe, chiffré, sont gérés par Google hors de France. Dans l’app, seul ton compte donne accès à tes données. Comme pour tout service en ligne, l’équipe d’Arvela peut techniquement les consulter pour l’entretien.</p>
          <p class="hint">Les sauvegardes dans Fichiers restent utiles : elles ne dépendent d’aucun compte.</p>
        </section>
      </main>
      {confirmOut && (
        <Sheet title="Des changements attendent le réseau" onClose={() => setConfirmOut(false)}>
          <div class="stack">
            <p>Les derniers changements ne sont pas encore copiés dans ton compte. Ils restent sur ce téléphone, mais ne partiront qu’à ta prochaine connexion.</p>
            <button class="btn btn-primary btn-lg btn-block" onClick={() => setConfirmOut(false)}>Rester connectée</button>
            <button class="btn btn-outline btn-block" onClick={() => void out(true)}>Me déconnecter quand même</button>
          </div>
        </Sheet>
      )}
      {del && <DeleteSheet onClose={() => setDel(false)} />}
    </>
  );
}

/** Le téléphone et le compte ont chacun des enfants : elle choisit avant la première copie. */
function LinkChoice() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (mode: 'account' | 'phone' | 'merge') => {
    setBusy(true);
    setError('');
    try {
      await (await cloud()).chooseLink(mode);
      toast(mode === 'phone' ? 'Ton compte a pris le contenu de ce téléphone.' : mode === 'account' ? 'Ce téléphone a pris le contenu de ton compte.' : 'Tout est gardé. Vérifie qu’aucun enfant n’apparaît en double.', undefined, 'ok');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="card stack" aria-labelledby="choix">
      <h2 id="choix">Ce téléphone et ton compte ont chacun des enfants</h2>
      <p>Les réunir sans demander pourrait créer des doublons, et donc des salaires comptés deux fois. Choisis ce que tu gardes.</p>
      <button class="btn btn-primary btn-block" disabled={busy} onClick={() => void go('account')}>Garder ce qui est dans mon compte</button>
      <p class="hint">Ce téléphone prend le contenu du compte. Une copie de ce qu’il contenait est gardée dans Sauvegarde, copies automatiques.</p>
      <button class="btn btn-outline btn-block" disabled={busy} onClick={() => void go('phone')}>Garder ce qui est sur ce téléphone</button>
      <p class="hint">Ton compte prend le contenu de ce téléphone. Ce qui n’était que dans le compte est effacé.</p>
      <button class="btn btn-ghost btn-block" disabled={busy} onClick={() => void go('merge')}>Tout garder</button>
      <p class="hint">Les enfants des deux côtés restent. À vérifier ensuite dans Plus.</p>
      {error && <Banner tone="warn">{error}</Banner>}
    </section>
  );
}

function DeleteSheet({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Sheet title="Supprimer mon compte" onClose={onClose}>
      <form class="stack" noValidate onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await (await cloud()).deleteAccount(pw);
          toast('Compte supprimé. Tes données restent sur ce téléphone.');
          onClose();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        <p>La copie en ligne est effacée pour de bon. Ce qui est sur ce téléphone reste, sans copie ailleurs.</p>
        <TextInput label="Ton mot de passe, par sécurité" type="password" autoComplete="current-password" value={pw} onChange={setPw} />
        {error && <Banner tone="warn">{error}</Banner>}
        <button class="btn btn-danger btn-block" type="submit" disabled={busy || !pw}>{busy ? 'Suppression…' : 'Supprimer définitivement'}</button>
      </form>
    </Sheet>
  );
}
