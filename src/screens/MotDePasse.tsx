// Page « nouveau mot de passe », ouverte depuis le lien de l'e-mail. Elle marche sans session et sans
// données sur l'appareil (le lien s'ouvre souvent dans Safari, hors de l'app installée, parfois en navigation privée).
import { useEffect, useState } from 'preact/hooks';
import { LOGIN_HINT, type AuthAction } from '../auth-action';
import { confirmReset, verifyResetCode } from '../cloud';
import { PASSWORD_RULE, passwordChecks } from '../password';
import { PasswordRules } from '../ui/PasswordRules';
import { Banner, TextInput } from '../ui/kit';
import { LockupStacked } from './Welcome';

type Etat = { k: 'verif' } | { k: 'form'; email: string } | { k: 'fini'; email: string } | { k: 'erreur'; msg: string };

function ouvrirArvela(email?: string) {
  try { if (email) sessionStorage.setItem(LOGIN_HINT, email); } catch { /* stockage indisponible */ }
  // L'adresse ne change que par son « # » : il faut recharger pour quitter cette page et ouvrir l'app.
  history.replaceState(null, '', location.pathname + '#/');
  location.reload();
}

export function MotDePasse({ action }: { action: AuthAction }) {
  const [etat, setEtat] = useState<Etat>({ k: 'verif' });
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Nouveau mot de passe · Arvela';
    if (action.mode !== 'resetPassword') { setEtat({ k: 'erreur', msg: 'Ce lien n’est pas reconnu par Arvela.' }); return; }
    verifyResetCode(action.code)
      .then((email) => setEtat({ k: 'form', email }))
      .catch((e) => setEtat({ k: 'erreur', msg: (e as Error).message }));
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (etat.k !== 'form') return;
    setError('');
    if (!passwordChecks(pw).ok) { setError(PASSWORD_RULE); return; }
    setBusy(true);
    try {
      await confirmReset(action.code, pw);
      setEtat({ k: 'fini', email: etat.email });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="welcome">
      <LockupStacked />
      {etat.k === 'verif' && <p class="hint center" role="status">Vérification du lien…</p>}

      {etat.k === 'form' && (
        <form class="card stack" onSubmit={submit} noValidate>
          <h1 class="h-card">Choisis un nouveau mot de passe</h1>
          <p class="hint">Pour le compte <strong>{etat.email}</strong>.</p>
          {/* Aide les gestionnaires de mots de passe à ranger le nouveau mot de passe avec la bonne adresse */}
          <input type="email" autoComplete="username" value={etat.email} readOnly hidden />
          <TextInput label="Nouveau mot de passe" type="password" autoComplete="new-password" value={pw} onChange={setPw} error={error} />
          <PasswordRules pw={pw} />
          <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button>
        </form>
      )}

      {etat.k === 'fini' && (
        <section class="card stack" role="status">
          <h1 class="h-card">C’est fait</h1>
          <Banner tone="ok">Ton nouveau mot de passe est enregistré.</Banner>
          <p class="hint">Si Arvela est installée sur ton téléphone, ouvre-la depuis son icône et connecte-toi avec ce nouveau mot de passe.</p>
          <button class="btn btn-primary btn-lg btn-block" type="button" onClick={() => ouvrirArvela(etat.email)}>Me connecter</button>
        </section>
      )}

      {etat.k === 'erreur' && (
        <section class="card stack" role="alert">
          <h1 class="h-card">Lien impossible à utiliser</h1>
          <Banner tone="warn">{etat.msg}</Banner>
          <button class="btn btn-primary btn-lg btn-block" type="button" onClick={() => ouvrirArvela()}>Revenir à la connexion</button>
        </section>
      )}
    </main>
  );
}
