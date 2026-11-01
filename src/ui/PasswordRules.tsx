// Règle du mot de passe affichée sous le champ, cochée au fil de la frappe.
import { passwordChecks, MIN_PASSWORD } from '../password';
import { Icon } from './icons';

const TYPES = [
  { k: 'minuscule', court: 'abc', nom: 'une minuscule' },
  { k: 'majuscule', court: 'ABC', nom: 'une majuscule' },
  { k: 'chiffre', court: '123', nom: 'un chiffre' },
  { k: 'special', court: '#?!', nom: 'un caractère spécial' },
] as const;

function Mark({ ok }: { ok: boolean }) {
  return ok ? <Icon name="check" size={16} /> : <span class="pw-dot" aria-hidden="true" />;
}

export function PasswordRules({ pw, id }: { pw: string; id?: string }) {
  const c = passwordChecks(pw);
  return (
    <div class="pw-rules" id={id}>
      <p class={c.longueur ? 'ok' : ''}><Mark ok={c.longueur} />{MIN_PASSWORD} caractères au moins<span class="sr-only">{c.longueur ? ', fait' : ', à faire'}</span></p>
      <p class={c.types >= 3 ? 'ok' : ''}><Mark ok={c.types >= 3} />3 types sur 4<span class="sr-only">{c.types >= 3 ? ', fait' : `, ${c.types} pour l’instant`}</span></p>
      <ul class="pw-types" aria-label="Types de caractères">
        {TYPES.map((t) => (
          <li class={c[t.k] ? 'ok' : ''}><span aria-hidden="true">{t.court}</span><span class="sr-only">{t.nom}{c[t.k] ? ', présent' : ', absent'}</span></li>
        ))}
      </ul>
    </div>
  );
}
