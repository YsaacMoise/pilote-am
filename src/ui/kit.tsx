import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Icon, type IconName } from './icons';
import { onToast, type ToastMsg, addFeedback, toast, logUsage } from '../store';
import { centsToInput, parseEuros } from '../engine/money';

export const CHILD_COLORS = ['#3346C8', '#0F7F68', '#C2410C', '#B4236B', '#6D3FC0', '#0B6E99'];
export const COLOR_NAMES = ['Myrtille', 'Menthe', 'Abricot', 'Framboise', 'Prune', 'Lagon'];

export function Gommette({ name, color, size }: { name: string; color: number; size?: 'sm' | 'lg' }) {
  return (
    <span class={`gommette ${size ?? ''}`} style={{ '--g': CHILD_COLORS[color % CHILD_COLORS.length] } as any} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** Barre du haut : titre + bouton « Ça coince » présent sur chaque écran */
export function Topbar({ title, sub, back, screen, end }: { title: string; sub?: string; back?: string; screen: string; end?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <header class="topbar">
      {back && (
        <a class="icon-btn" href={back} aria-label="Retour">
          <Icon name="left" />
        </a>
      )}
      <h1>
        {title}
        {sub && <span class="sub">{sub}</span>}
      </h1>
      {end}
      <button class="pill" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="message" size={18} />
        Ça coince
      </button>
      {open && <CoinceSheet screen={screen} onClose={() => setOpen(false)} />}
    </header>
  );
}

function CoinceSheet({ screen, onClose }: { screen: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const id = useId();
  return (
    <Sheet title="Ça coince ?" onClose={onClose}>
      <p>Dis en quelques mots ce qui te gêne sur cet écran. C’est noté sur ton téléphone. Ta remarque fera partie du bilan anonyme du mois, sans aucun prénom.</p>
      <div class="field">
        <label for={id}>Ce qui coince</label>
        <textarea id={id} class="input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Ex. : je ne trouve pas comment corriger une heure d’arrivée" />
        <span class="hint">Astuce : touche le micro du clavier pour dicter.</span>
      </div>
      <button
        class="btn btn-primary btn-block btn-lg"
        disabled={!text.trim()}
        onClick={async () => {
          const undo = await addFeedback(screen, text.trim());
          logUsage('ca_coince', screen);
          onClose();
          toast('Merci, c’est noté.', undo);
        }}
      >
        Envoyer la remarque
      </button>
    </Sheet>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal?.();
    const close = () => onClose();
    d.addEventListener('close', close);
    return () => d.removeEventListener('close', close);
  }, []);
  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby={id}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
    >
      <div class="sheet-grip" aria-hidden="true" />
      <div class="sheet-head">
        <h2 id={id}>{title}</h2>
        <button class="icon-btn" aria-label="Fermer" onClick={() => ref.current?.close()}>
          <Icon name="x" />
        </button>
      </div>
      <div class="sheet-body">{children}</div>
    </dialog>
  );
}

export function Toaster() {
  const [t, setT] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onToast((m) => {
      setT(m);
      clearTimeout(timer);
      if (m) timer = setTimeout(() => setT((cur) => (cur?.id === m.id ? null : cur)), m.action ? 30000 : m.undo ? 10000 : 4000);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  return (
    <div class="toast-wrap" aria-live="polite" role="status">
      {t && (
        <div class="toast" key={t.id}>
          <p>{t.text}</p>
          {t.undo && (
            <button
              onClick={async () => {
                const u = t.undo!;
                setT(null);
                await u();
                if (!t.action) { logUsage('annuler'); toast('Annulé.'); }
              }}
            >
              {t.action ?? 'Annuler'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Banner({ tone = 'info', icon, children }: { tone?: 'info' | 'warn' | 'ok'; icon?: IconName; children: ComponentChildren }) {
  return (
    <div class={`banner ${tone}`} role={tone === 'warn' ? 'alert' : undefined}>
      <span class="b-ico"><Icon name={icon ?? (tone === 'warn' ? 'alert' : tone === 'ok' ? 'check' : 'info')} /></span>
      <div class="b-body">{children}</div>
    </div>
  );
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; id: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      {children}
      {hint && <span class="hint" id={`${id}-h`}>{hint}</span>}
      {error && <span class="err" id={`${id}-e`}>{error}</span>}
    </div>
  );
}

export function TextInput(props: { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string; type?: string; autoComplete?: string; inputMode?: string; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={props.label} hint={props.hint} error={props.error} id={id}>
      <input
        id={id} class="input" type={props.type ?? 'text'} value={props.value} placeholder={props.placeholder}
        inputMode={props.inputMode as any} autoComplete={props.autoComplete ?? 'off'}
        aria-invalid={props.error ? 'true' : undefined}
        aria-describedby={[props.hint && `${id}-h`, props.error && `${id}-e`].filter(Boolean).join(' ') || undefined}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
    </Field>
  );
}

/** Saisie d'un montant en euros, stocké en centimes */
export function EuroInput({ label, cents, onChange, hint, allowEmpty }: { label: string; cents: number | undefined; onChange: (c: number | undefined) => void; hint?: string; allowEmpty?: boolean }) {
  const id = useId();
  const [txt, setTxt] = useState(cents == null ? '' : centsToInput(cents));
  const [err, setErr] = useState('');
  useEffect(() => {
    const cur = parseEuros(txt);
    if (cents == null ? txt !== '' && !allowEmpty : cur !== cents) setTxt(cents == null ? '' : centsToInput(cents));
  }, [cents]);
  return (
    <Field label={label} hint={hint} error={err} id={id}>
      <div class="input-euro">
        <input
          id={id} class="input num" inputMode="decimal" value={txt} aria-invalid={err ? 'true' : undefined}
          aria-describedby={[hint && `${id}-h`, err && `${id}-e`].filter(Boolean).join(' ') || undefined}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setTxt(v);
            if (!v.trim() && allowEmpty) { setErr(''); onChange(undefined); return; }
            const c = parseEuros(v);
            if (c == null || c < 0) setErr('Montant attendu, par exemple 3,50');
            else { setErr(''); onChange(c); }
          }}
        />
      </div>
    </Field>
  );
}

export function NumberInput({ label, value, onChange, hint, min = 0, max, step = 1 }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; hint?: string; min?: number; max?: number; step?: number }) {
  const id = useId();
  const [txt, setTxt] = useState(value == null ? '' : String(value).replace('.', ','));
  const [err, setErr] = useState('');
  return (
    <Field label={label} hint={hint} error={err} id={id}>
      <input
        id={id} class="input num" inputMode={step < 1 ? 'decimal' : 'numeric'} value={txt} aria-invalid={err ? 'true' : undefined}
        aria-describedby={[hint && `${id}-h`, err && `${id}-e`].filter(Boolean).join(' ') || undefined}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setTxt(v);
          if (!v.trim()) { setErr(''); onChange(undefined); return; }
          const n = Number(v.replace(',', '.'));
          if (Number.isNaN(n) || n < min || (max != null && n > max)) setErr(max != null ? `Nombre entre ${min} et ${max}` : 'Nombre attendu');
          else { setErr(''); onChange(n); }
        }}
      />
    </Field>
  );
}

export function DateInput({ label, value, onChange, hint, min, max }: { label: string; value: string; onChange: (v: string) => void; hint?: string; min?: string; max?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} class="input" type="date" value={value} min={min} max={max} onInput={(e) => onChange((e.target as HTMLInputElement).value)} />
    </Field>
  );
}

export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div class="field">
      <span class="label" id={id}>{label}</span>
      <div class="seg" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}

export function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T | undefined; options: { v: T; l: string; sub?: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div class="field">
      <span class="label" id={id}>{label}</span>
      <div class="choices" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button type="button" class="choice" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>
            <span class="c-radio" aria-hidden="true" />
            <span>{o.l}{o.sub && <span class="c-sub">{o.sub}</span>}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 99, unit }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string }) {
  const id = useId();
  return (
    <div class="spread">
      <span id={id} class="label">{label}</span>
      <div class="stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label={`Moins (${label})`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <output aria-live="polite">{value}{unit ? ` ${unit}` : ''}</output>
        <button type="button" aria-label={`Plus (${label})`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <label class="switch" for={id}>
      <span class="stack-sm" style={{ gap: '0' }}>
        <span class="label">{label}</span>
        {hint && <span class="hint">{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

export function ListLink({ href, icon, title, sub, end, onClick }: { href?: string; icon?: IconName | JSX.Element; title: string; sub?: string; end?: ComponentChildren; onClick?: () => void }) {
  const inner = (
    <>
      {icon && (typeof icon === 'string' ? <span class="li-ico"><Icon name={icon as IconName} /></span> : icon)}
      <span class="li-main">
        <span class="li-title">{title}</span>
        {sub && <span class="li-sub">{sub}</span>}
      </span>
      <span class="li-end">{end}{(href || onClick) && <Icon name="right" size={20} />}</span>
    </>
  );
  if (href) return <a class="li" href={href}>{inner}</a>;
  if (onClick) return <button type="button" class="li" onClick={onClick}>{inner}</button>;
  return <div class="li">{inner}</div>;
}
