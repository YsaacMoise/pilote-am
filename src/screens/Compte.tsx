import { useState } from 'preact/hooks';
import { statusText, useCloud, type CloudStatus } from '../cloud-state';
import { toast, useStore } from '../store';
import { Banner, Sheet, TextInput, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

const cloud = () => import('../cloud');

/**
 * Formulaire de compte : création, connexion, mot de passe oublié.
 * `onDone` est appelé une fois le compte branché et les données réunies.
 */
export function AccountForm({ initial = 'create', onDone }: { initial?: 'create' | 'login'; onDone?: () => void }) {
  const [mode, setMode] = useState<'create' | 'login' | 'reset'>(initial);
  const [email, setEmail] = useState('');
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
      <form class="stack" onSubmit={submit} noValidate>
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
    <form class="stack" onSubmit={submit} noValidate>
      <h2>{create ? 'Crée ton compte' : 'Connecte-toi'}</h2>
      {create && <p class="hint">Tes données restent sur ton téléphone et une copie va dans ton compte. Si tu changes de téléphone, tu retrouves tout.</p>}
      <TextInput label="Adresse e-mail" type="email" inputMode="email" autoComplete={create ? 'email' : 'username'} value={email} onChange={setEmail} />
      <TextInput
        label="Mot de passe" type="password" autoComplete={create ? 'new-password' : 'current-password'} value={pw} onChange={setPw}
        hint={create ? '8 caractères au moins. L’iPhone peut en proposer un et le retenir pour toi.' : undefined}
      />
      {error && <Banner tone="warn">{error}</Banner>}
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
  off: 'info', starting: 'info', merging: 'info', synced: 'ok', pending: 'info', offline: 'info', error: 'warn',
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
          <section class="card"><AccountForm onDone={() => toast('Compte branché : tes données sont copiées en ligne.', undefined, 'ok')} /></section>
        ) : (
          <>
            <section class="card stack-sm">
              <p class="row"><Icon name="user" /><strong>{c.email}</strong></p>
              <Banner tone={TONE[c.status]} icon={c.status === 'synced' ? 'cloud' : undefined}>{statusText(c)}</Banner>
              <p class="hint">Chaque changement est rangé sur le téléphone puis copié dans ton compte dès qu’il y a du réseau. Sur un autre appareil, connecte-toi avec la même adresse pour tout retrouver.</p>
            </section>
            <div class="stack">
              <button class="btn btn-outline btn-block" onClick={() => void out(false)}>Me déconnecter</button>
              <button class="btn btn-danger btn-block" onClick={() => setDel(true)}>Supprimer mon compte</button>
            </div>
          </>
        )}
        <section class="card stack-sm">
          <h2 class="row"><Icon name="lock" />Où vont tes données</h2>
          <p>La copie en ligne est rangée chez Google Firebase, sur des serveurs à Paris. Dans l’app, seul ton compte y donne accès. Comme pour tout service en ligne, l’équipe d’Arvela peut techniquement la consulter pour l’entretien.</p>
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
