import { useEffect, useState } from 'preact/hooks';
import { appareilsAnciens, cleLocale, cloudInfo, statusLine, useCloud, type CloudStatus } from '../cloud-state';
import { saveSettings, state, toast, useStore } from '../store';
import { shareFile } from '../share';
import { BoutonCleAcces, TEXTE_SANS_PRF, useSupportPrf } from '../ui/CleAcces';
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
 * T-121 (option b) : clé de secours. Elle protège le carnet (soins, températures, notes), la case « handicap ou maladie » et
 * le code du lien des parents, chiffrés de bout en bout dans le compte. Elle reste sur les appareils de l'AM.
 * T-125 : trois filets pour ne jamais la perdre (consignes/t125-cle-sans-perte.md) : clé d'accès Face ID ou empreinte (dans
 * le trousseau iCloud ou Google), clé envoyée à soi-même par e-mail, imprimée ou enregistrée ; et leur état ici.
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
  const jour = (d?: string) => d ? d.split('-').reverse().join('/') : '';
  const noter = (k: 'email' | 'impression' | 'fichier') => saveSettings({ filets: { ...(state.settings.filets ?? {}), [k]: today() } });
  const texte = `Ma clé de secours Arvela : ${code}\n\nElle ouvre mon carnet de liaison, la case « handicap ou maladie » et le code du lien des parents, chiffrés dans mon compte Arvela. Arvela ne l’a pas.\nPour l’utiliser sur un nouveau téléphone : Arvela › Plus › Compte › Entre ta clé de secours.\nGarde ce message.`;
  const mailto = `mailto:${encodeURIComponent(cl.email ?? '')}?subject=${encodeURIComponent('Ma clé de secours Arvela')}&body=${encodeURIComponent(texte)}`;
  const ligne = (fait: boolean, titre: string, detail: string) => (
    <li class="row" style={{ alignItems: 'flex-start', gap: '8px' }}><span aria-hidden="true">{fait ? '✓' : '○'}</span><span><b>{titre}</b> : {detail}</span></li>
  );
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
      <p>Le carnet (soins, températures, notes), la case « handicap ou maladie » et le code du lien des parents sont chiffrés avant de partir : ni Arvela ni personne d’autre ne peut les lire en ligne. Ta clé de secours les ouvre sur un nouveau téléphone.</p>
      <h3>Tes filets</h3>
      <ul class="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="État des filets">
        {ligne((cl.paquets ?? 0) > 0, 'Face ID ou empreinte', (cl.paquets ?? 0) > 0 ? `oui (${cl.paquets} clé${(cl.paquets ?? 0) > 1 ? 's' : ''} d’accès) : sur un nouveau téléphone relié au même compte Apple ou Google, elle s’ouvre seule` : 'non')}
        {ligne(!!f.email, 'Envoyée par e-mail à toi-même', f.email ? `oui, le ${jour(f.email)}` : 'non')}
        {ligne(!!f.impression, 'Imprimée', f.impression ? `oui, le ${jour(f.impression)}` : 'non')}
        {ligne(!!f.fichier, 'Enregistrée dans un fichier', f.fichier ? `oui, le ${jour(f.fichier)}` : 'non')}
        {ligne(!!state.settings.cleGardee, 'Notée à la main', state.settings.cleGardee ? `oui, le ${jour(state.settings.cleGardee)}` : 'non')}
      </ul>
      {support === 'non' ? <p class="hint">{TEXTE_SANS_PRF}</p> : <BoutonCleAcces mode="proteger" block />}
      <a class="btn btn-outline btn-block" href={mailto} onClick={() => setTimeout(() => setConfirmer('email'), 300)}>M’envoyer ma clé par e-mail</a>
      <p class="hint">Ton application de messagerie s’ouvre avec un brouillon adressé à toi-même : rien ne passe par Arvela. Envoie-le.</p>
      <button class="btn btn-outline btn-block" onClick={imprimerMaintenant}>Imprimer ma clé</button>
      <button class="btn btn-outline btn-block" onClick={async () => {
        const r = await shareFile(new File([`Clé de secours Arvela (carnet, case handicap, code du lien des parents)\n${code}\nGarde ce fichier hors de ton téléphone. Sans lui ni aucun de tes appareils, ces données ne peuvent plus être lues.\n`], 'cle-de-secours-arvela.txt', { type: 'text/plain' }));
        if (r === 'downloaded' || r === 'shared') { await noter('fichier'); toast('Fichier de la clé enregistré. Garde-le hors de ce téléphone.'); }
      }}>Enregistrer ma clé dans un fichier</button>
      {voir ? <p class="share-code" style={{ fontSize: '1.1rem', wordBreak: 'break-all' }} aria-label="Clé de secours">{code}</p> : <button class="btn btn-ghost btn-block" onClick={() => setVoir(true)}>Afficher la clé</button>}
      {!state.settings.cleGardee && voir && <button class="btn btn-ghost btn-block" onClick={() => void saveSettings({ cleGardee: today() })}>Je l’ai notée à la main</button>}
      <p class="hint warn"><b>Seul cas où le carnet est perdu : sans aucun de tes appareils, sans ton compte Apple ou Google, et sans ta clé de secours (e-mail, papier, fichier).</b> Les contrats, journées, absences et montants, eux, se retrouvent toujours avec ton compte.</p>
      {imprimer && (
        <div class="feuille-cle" aria-hidden="true">
          <h1>Arvela : ma clé de secours</h1>
          <p class="feuille-code">{code}</p>
          <p>Elle ouvre mon carnet de liaison, la case « handicap ou maladie » et le code du lien des parents, chiffrés dans mon compte Arvela{cl.email ? ` (${cl.email})` : ''}. Arvela ne l’a pas et ne peut pas la retrouver.</p>
          <p>Sur un nouveau téléphone : Arvela › Plus › Compte › Entre ta clé de secours.</p>
          <p>Imprimée le {jour(today())}. À ranger avec les papiers des contrats.</p>
        </div>
      )}
      {confirmer && (
        <Sheet title={confirmer === 'email' ? 'As-tu envoyé l’e-mail ?' : 'As-tu imprimé la page ?'} onClose={() => setConfirmer(null)}>
          <div class="stack">
            <p>{confirmer === 'email' ? 'Arvela ne voit pas ta messagerie : dis-nous si le brouillon est parti.' : 'Range la feuille avec les papiers des contrats.'}</p>
            <button class="btn btn-primary btn-block" onClick={async () => { await noter(confirmer); setConfirmer(null); }}>{confirmer === 'email' ? 'Oui, envoyé' : 'Oui, imprimée'}</button>
            <button class="btn btn-outline btn-block" onClick={() => setConfirmer(null)}>Pas encore</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** T-121 : ce téléphone n'a pas la clé de secours du compte : il la demande (tapée, collée ou lue dans un fichier). */
function EntrerCle() {
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const essayer = async (t: string) => {
    setBusy(true); setError('');
    try { await (await cloud()).entrerCle(t); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section class="card stack-sm" aria-labelledby="entrer-cle-t">
      <h2 id="entrer-cle-t" class="row"><Icon name="lock" />Entre ta clé de secours</h2>
      <BoutonCleAcces mode="ouvrir" block />
      <p>Ton compte garde le carnet, la case « handicap ou maladie » et le code du lien des parents chiffrés. Ce téléphone ne peut pas les lire sans ta clé de secours (26 lettres et chiffres, par groupes de 4). Tes contrats, journées et montants, eux, sont déjà là. Tant que la clé manque, les notes du carnet que tu ajoutes ici restent sur ce téléphone, sans copie dans ton compte.</p>
      <TextInput label="Clé de secours" value={texte} onChange={setTexte} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" />
      {error && <p class="hint warn" role="alert">{error}</p>}
      <button class="btn btn-primary btn-block" disabled={busy || !texte.trim()} onClick={() => void essayer(texte)}>{busy ? 'Vérification…' : 'Ouvrir mes données'}</button>
      <label class="btn btn-outline btn-block">
        Ouvrir le fichier de la clé
        <input type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) await essayer(await f.text());
        }} />
      </label>
      <p class="hint">Tu ne l’as plus ? Elle s’affiche dans Compte sur un autre appareil où tu es connectée. Sans elle ni aucun appareil, le carnet et la case ne peuvent plus être lus ; tout le reste marche.</p>
    </section>
  );
}
