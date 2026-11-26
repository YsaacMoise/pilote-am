import { useEffect, useState } from 'preact/hooks';
import { appareilsAnciens, cleLocale, cloudInfo, statusLine, useCloud, type CloudStatus } from '../cloud-state';
import { saveSettings, state, toast, useStore } from '../store';
import { shareFile } from '../share';
import { BoutonCleAcces, useSupportPrf } from '../ui/CleAcces';
import { today } from '../engine/dates';
import { Banner, Sheet, TextInput, Topbar, useErreurAffichee } from '../ui/kit';
import { Icon } from '../ui/icons';
import { PasswordRules } from '../ui/PasswordRules';

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
  useErreurAffichee('compte', !!error);

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
      />
      {create && <PasswordRules pw={pw} />}
      {error && <Banner tone="warn">{error}</Banner>}
      {create && <p class="hint">Ton compte garde une copie de tes données, hébergée à Paris. <a href="#/confidentialite">Ce qui est gardé et tes droits</a></p>}
      {create && <p class="hint">En créant ton compte, tu acceptes les <a href="#/conditions">Conditions d’utilisation</a>.</p>}
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

/** Adresse pas encore confirmée : rappel discret, sans rien bloquer. */
function ConfirmAddress({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  // Relit l'état à l'ouverture de l'écran : le lien a peut-être été ouvert entre-temps.
  useEffect(() => { void cloud().then((m) => m.checkVerified()).catch(() => {}); }, []);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try { await f(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section class="card stack-sm" aria-labelledby="confirm-t">
      <h2 id="confirm-t" class="row"><Icon name="alert" />Confirme ton adresse</h2>
      <p>Un e-mail de confirmation est parti à <strong>{email}</strong>. Ouvre le lien qu’il contient : sans adresse confirmée, tu ne pourras pas récupérer ton compte si tu oublies ton mot de passe.</p>
      <p class="hint">Pas reçu ? Regarde dans les courriers indésirables. Il vient de noreply@arvela.fr.</p>
      <div class="btn-row">
        <button class="btn btn-outline" disabled={busy} onClick={() => run(async () => { await (await cloud()).resendVerification(); toast('E-mail renvoyé.', undefined, 'ok'); })}>Renvoyer l’e-mail</button>
        <button class="btn btn-primary" disabled={busy} onClick={() => run(async () => { const ok = await (await cloud()).checkVerified(); toast(ok ? 'Adresse confirmée, merci.' : 'Pas encore confirmée : ouvre le lien de l’e-mail.', undefined, ok ? 'ok' : undefined); })}>J’ai confirmé</button>
      </div>
    </section>
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
              <Banner tone={c.refus ? 'warn' : TONE[c.status]} icon={c.status === 'synced' && !c.refus ? 'cloud' : undefined}>{statusLine(c)}</Banner>
              {c.status !== 'choice' && <p class="hint">Chaque changement est rangé sur le téléphone puis copié dans ton compte dès qu’il y a du réseau. Sur un autre appareil, connecte-toi avec la même adresse pour tout retrouver.</p>}
            </section>
            {appareilsAnciens() > 0 && <Banner tone="warn">{appareilsAnciens() === 1 ? 'Un autre appareil utilise' : `${appareilsAnciens()} autres appareils utilisent`} une ancienne version d’Arvela. Ouvre l’app dessus et touche « Mettre à jour » : une ancienne version ne lit pas ce qui est chiffré (carnet, case handicap, lien des parents), et peut afficher « envoi refusé » jusqu’à sa mise à jour.</Banner>}
            {c.cleManquante && <EntrerCle />}
            {c.cleOk && <CleSecours />}
            {c.verified === false && <ConfirmAddress email={c.email!} />}
            {c.status === 'choice' && <LinkChoice />}
            <div class="stack">
              <button class="btn btn-outline btn-block" onClick={() => void out(false)}>Me déconnecter</button>
              <button class="btn btn-danger btn-block" onClick={() => setDel(true)}>Supprimer mon compte</button>
            </div>
          </>
        )}
        <section class="card stack-sm">
          <h2 class="row"><Icon name="lock" />Où vont tes données</h2>
          <p>La copie de tes données est rangée chez Google Firebase, sur des serveurs à Paris. Ton adresse e-mail et ton mot de passe, haché (transformé de façon irréversible), sont gérés par Google hors de France. Dans l’app, seul ton compte donne accès à tes données. Comme pour tout service en ligne, l’éditeur d’Arvela peut techniquement y accéder ; il s’engage à ne le faire qu’avec ton accord.</p>
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
      <p class="hint">Les enfants des deux côtés restent. Si un enfant apparaît deux fois, ouvre le double dans Plus et choisis « Supprimer ce contrat ».</p>
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

/**
 * T-121 (option b) : clé de secours du carnet chiffré. T-125 (consignes/t125-cle-sans-perte.md) : ses filets (clé d'accès
 * Face ID ou empreinte, e-mail à soi-même, impression, fichier, copie scellée chez Arvela) et leur état. Point 5 du DG :
 * aucun texte d'explication ici, un état et des boutons ; la page Confidentialité dit les faits.
 */
function CleSecours() {
  useStore();
  const cl = useCloud();
  const support = useSupportPrf();
  const [voir, setVoir] = useState(false);
  const [confirmer, setConfirmer] = useState<null | 'email' | 'impression'>(null);
  const [imprimer, setImprimer] = useState(false);
  const code = cleLocale();
  if (!code) return null;
  const f = state.settings.filets ?? {};
  const jour = (d?: string) => (d ? d.split('-').reverse().join('/') : '');
  const noter = (k: 'email' | 'impression' | 'fichier') => saveSettings({ filets: { ...(state.settings.filets ?? {}), [k]: today() } });
  const texte = `Ma clé de secours Arvela : ${code}\nArvela › Plus › Compte › Entre ta clé de secours.`;
  const mailto = `mailto:${encodeURIComponent(cl.email ?? '')}?subject=${encodeURIComponent('Ma clé de secours Arvela')}&body=${encodeURIComponent(texte)}`;
  const etat = (fait: boolean | string | undefined) => (typeof fait === 'string' ? jour(fait) : fait ? 'oui' : 'non');
  const imprimerMaintenant = () => {
    setImprimer(true);
    document.body.classList.add('impression-cle');
    const fin = () => { document.body.classList.remove('impression-cle'); window.removeEventListener('afterprint', fin); setImprimer(false); setConfirmer('impression'); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('impression-cle')) fin(); }, 1500); }, 50);
  };
  return (
    <section class="card stack-sm" aria-labelledby="cle-t">
      <h2 id="cle-t" class="row"><Icon name="lock" />Ta clé de secours</h2>
      <dl class="kv" aria-label="État des filets">
        <dt>Face ID</dt><dd>{(cl.paquets ?? 0) > 0 ? 'oui' : 'non'}</dd>
        <dt>E-mail</dt><dd>{etat(f.email)}</dd>
        <dt>Imprimée</dt><dd>{etat(f.impression)}</dd>
        <dt>Fichier</dt><dd>{etat(f.fichier)}</dd>
        <dt>Notée</dt><dd>{etat(state.settings.cleGardee)}</dd>
        <dt>Copie Arvela</dt><dd>{cl.sequestre ? 'oui' : 'non'}</dd>
      </dl>
      {support !== 'non' && <BoutonCleAcces mode="proteger" block />}
      <a class="btn btn-outline btn-block" href={mailto} onClick={() => setTimeout(() => setConfirmer('email'), 300)}>M’envoyer ma clé par e-mail</a>
      <button class="btn btn-outline btn-block" onClick={imprimerMaintenant}>Imprimer ma clé</button>
      <button class="btn btn-outline btn-block" onClick={async () => {
        const r = await shareFile(new File([`Clé de secours Arvela\n${code}\n`], 'cle-de-secours-arvela.txt', { type: 'text/plain' }));
        if (r === 'downloaded' || r === 'shared') await noter('fichier');
      }}>Enregistrer ma clé dans un fichier</button>
      {voir ? <p class="share-code" style={{ fontSize: '1.1rem', wordBreak: 'break-all' }} aria-label="Clé de secours">{code}</p> : <button class="btn btn-ghost btn-block" onClick={() => setVoir(true)}>Afficher la clé</button>}
      {!state.settings.cleGardee && voir && <button class="btn btn-ghost btn-block" onClick={() => void saveSettings({ cleGardee: today() })}>Je l’ai notée</button>}
      {cl.ouverture && <Banner tone="warn">Demande de récupération par Arvela en cours</Banner>}
      {cl.ouverture && <button class="btn btn-danger btn-block" onClick={async () => {
        try { await (await cloud()).annulerOuverture(); toast('Demande annulée.'); } catch (e) { toast((e as Error).message || 'Ça n’a pas marché. Réessaie.', undefined, 'warn'); }
      }}>Annuler la demande</button>}
      {imprimer && (
        <div class="feuille-cle" aria-hidden="true">
          <h1>Arvela : ma clé de secours</h1>
          <p class="feuille-code">{code}</p>
          <p>{cl.email ?? ''}</p>
          <p>Arvela › Plus › Compte › Entre ta clé de secours</p>
          <p>{jour(today())}</p>
        </div>
      )}
      {confirmer && (
        <Sheet title={confirmer === 'email' ? 'E-mail envoyé ?' : 'Page imprimée ?'} onClose={() => setConfirmer(null)}>
          <div class="stack">
            <button class="btn btn-primary btn-block" onClick={async () => { await noter(confirmer); setConfirmer(null); }}>{confirmer === 'email' ? 'Oui, envoyé' : 'Oui, imprimée'}</button>
            <button class="btn btn-outline btn-block" onClick={() => setConfirmer(null)}>Pas encore</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** T-121 : ce téléphone n'a pas la clé de secours du compte. T-125 : Face ID, clé tapée ou fichier, ou copie scellée Arvela. */
function EntrerCle() {
  const cl = useCloud();
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (f: (c: typeof import('../cloud')) => Promise<void>) => {
    setBusy(true); setError('');
    try { await f(await cloud()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const pret = cl.ouverture ?? null;
  const quand = pret ? new Date(pret).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <section class="card stack-sm" aria-labelledby="entrer-cle-t">
      <h2 id="entrer-cle-t" class="row"><Icon name="lock" />Entre ta clé de secours</h2>
      <BoutonCleAcces mode="ouvrir" block />
      <TextInput label="Clé de secours" value={texte} onChange={setTexte} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" />
      {error && <p class="hint warn" role="alert">{error}</p>}
      <button class="btn btn-primary btn-block" disabled={busy || !texte.trim()} onClick={() => void run((c) => c.entrerCle(texte))}>{busy ? 'Vérification…' : 'Ouvrir'}</button>
      <label class="btn btn-outline btn-block">
        Ouvrir le fichier de la clé
        <input type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={async (e) => {
          const fi = (e.target as HTMLInputElement).files?.[0];
          if (fi) { const t = await fi.text(); await run((c) => c.entrerCle(t)); }
        }} />
      </label>
      {!pret && cl.sequestre && <button class="btn btn-ghost btn-block" disabled={busy} onClick={() => void run((c) => c.demanderOuverture())}>Récupérer par Arvela</button>}
      {pret && pret > Date.now() && <p role="status">Récupération possible le {quand}</p>}
      {pret && pret <= Date.now() && <button class="btn btn-primary btn-block" disabled={busy} onClick={() => void run((c) => c.ouvrirSequestre())}>Récupérer ma clé</button>}
      {pret && <button class="btn btn-ghost btn-block" disabled={busy} onClick={() => void run((c) => c.annulerOuverture())}>Annuler la demande</button>}
    </section>
  );
}
