import {
  Component, createContext, type ErrorInfo, useCallback, useContext, useEffect, useId, useRef, useState,
  type ReactElement, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';
import { formatEuros, formatRate, parseEuros, parseRateMilli, type Cents, type Milli } from '../engine/money';
import { formatTime, parseTime, type Minutes } from '../engine/dates';
import { Icon, type IconName } from './icons';

// ---------------------------------------------------------------------------
// Navigation : un onglet, une pile d'écrans par onglet
// ---------------------------------------------------------------------------

export type Tab = 'today' | 'month' | 'suivi' | 'settings';

export type Route =
  | { name: 'controle'; contractId?: string; month?: string }
  | { name: 'conges' }
  | { name: 'fin'; contractId?: string }
  | { name: 'impots' }
  | { name: 'detail'; contractId: string; month: string }
  | { name: 'profile' }
  | { name: 'contract'; contractId?: string }
  | { name: 'history'; contractId: string }
  | { name: 'backup' }
  | { name: 'pilot' }
  | { name: 'rates' }
  | { name: 'install' };

export interface Nav {
  tab: Tab;
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  pop: () => void;
  screenName: string;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('NavContext manquant');
  return nav;
}

// ---------------------------------------------------------------------------
// Toast avec annulation
// ---------------------------------------------------------------------------

interface ToastData {
  id: number;
  message: string;
  undo?: () => void;
}

let toastListener: ((t: ToastData | null) => void) | null = null;
let toastSeq = 0;

export function toast(message: string, undo?: () => void): void {
  toastListener?.({ id: ++toastSeq, message, ...(undo ? { undo } : {}) });
}

export function ToastHost(): ReactElement {
  const [t, setT] = useState<ToastData | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    toastListener = setT;
    return () => {
      toastListener = null;
    };
  }, []);
  useEffect(() => {
    if (!t || paused) return;
    const timer = setTimeout(() => setT(null), t.undo ? 8000 : 3500);
    return () => clearTimeout(timer);
  }, [t, paused]);
  // La zone annoncée reste en place : VoiceOver lit chaque nouveau message
  return createPortal(
    <div className="toast-region" role="status" aria-live="polite" onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {t && (
        <div className="toast" key={t.id}>
          <span>{t.message}</span>
          {t.undo && (
            <button
              className="btn btn-plain"
              onClick={() => {
                t.undo?.();
                setT(null);
                setPaused(false);
              }}
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Écran, barre, groupes, rangées
// ---------------------------------------------------------------------------

export function Screen(props: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  right?: ReactNode;
  children: ReactNode;
}): ReactElement {
  const nav = useNav();
  return (
    <main className="screen">
      <div className="bar">
        {props.back ? (
          <button className="bar-action bar-back" onClick={nav.pop}>
            <Icon name="back" size={24} stroke={2.2} />
            {props.back}
          </button>
        ) : (
          <span />
        )}
        {props.right ?? <ReportButton />}
      </div>
      <h1 className="large-title">{props.title}</h1>
      {props.subtitle && <p className="subtitle">{props.subtitle}</p>}
      {props.children}
    </main>
  );
}

export function Group(props: { title?: ReactNode; note?: ReactNode; header?: ReactNode; className?: string; children: ReactNode }): ReactElement {
  const id = useId();
  return (
    <section aria-labelledby={props.title ? id : undefined}>
      {props.title && (
        <h2 className="group-title" id={id}>
          {props.title}
        </h2>
      )}
      {props.header}
      <div className={`group ${props.className ?? ''}`}>{props.children}</div>
      {props.note && <p className="group-note">{props.note}</p>}
    </section>
  );
}

export function Row(props: {
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  strong?: boolean;
  leading?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}): ReactElement {
  const content = (
    <>
      {props.leading}
      <span className="row-main">
        <span className={props.sub ? 'row-title' : undefined} style={props.danger ? { color: 'var(--negative)' } : undefined}>
          {props.title}
        </span>
        {props.sub && <span className="row-sub">{props.sub}</span>}
      </span>
      {props.value !== undefined && <span className={`row-value ${props.strong ? 'strong' : ''}`}>{props.value}</span>}
      {props.onClick && <span className="chevron"><Icon name="chevron" size={18} stroke={2.2} /></span>}
    </>
  );
  const cls = `row ${props.leading ? 'with-avatar' : ''} ${props.className ?? ''}`;
  if (props.onClick) {
    return (
      <button className={`${cls} row-button`} onClick={props.onClick}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}

export function Actions({ children }: { children: ReactNode }): ReactElement {
  return <div className="actions">{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }): ReactElement {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }): ReactElement {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pastille d'enfant
// ---------------------------------------------------------------------------

export function Magnet(props: {
  name: string;
  /** Initiales affichées (deux lettres si deux enfants partagent la même initiale) */
  initials?: string;
  color: string;
  state?: 'here' | 'waiting' | 'gone';
  small?: boolean;
  onClick?: () => void;
  label?: string;
  /** Doublon d'un autre bouton : cliquable au doigt, ignoré par VoiceOver et le clavier */
  decorative?: boolean;
}): ReactElement {
  const initial = props.initials ?? (props.name.trim()[0] ?? '?').toUpperCase();
  const cls = `magnet ${props.color} ${props.state === 'waiting' ? 'waiting' : ''} ${props.state === 'gone' ? 'gone' : ''} ${props.small ? 'small' : ''} ${initial.length > 1 ? 'two' : ''}`;
  if (props.onClick) {
    return (
      <button
        className={cls}
        onClick={props.onClick}
        {...(props.decorative ? { 'aria-hidden': true, tabIndex: -1 } : { 'aria-label': props.label ?? props.name })}
      >
        {initial}
      </button>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Feuille modale
// ---------------------------------------------------------------------------

const sheetStack: string[] = [];

function syncBackground(): void {
  const root = document.getElementById('root');
  const open = sheetStack.length > 0;
  document.body.classList.toggle('sheet-open', open);
  if (root) {
    // L'écran derrière la feuille devient inerte : VoiceOver et le clavier restent dans la feuille
    if (open) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
  }
}

export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  hideTitle?: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}): ReactElement | null {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const { open, onClose } = props;
  const drag = useRef<{ y: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetStack.push(titleId);
    syncBackground();
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && sheetStack[sheetStack.length - 1] === titleId) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = sheetStack.lastIndexOf(titleId);
      if (i >= 0) sheetStack.splice(i, 1);
      syncBackground();
      previous?.focus?.();
    };
  }, [open, onClose, titleId]);

  if (!open) return null;

  // Glisser la poignée vers le bas ferme la feuille
  const onTouchStart = (e: React.TouchEvent): void => {
    const y = e.touches[0]?.clientY;
    if (y !== undefined) drag.current = { y, dy: 0 };
  };
  const onTouchMove = (e: React.TouchEvent): void => {
    const y = e.touches[0]?.clientY;
    if (!drag.current || y === undefined || !ref.current) return;
    drag.current.dy = Math.max(0, y - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onTouchEnd = (): void => {
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    if (ref.current) ref.current.style.transform = '';
    if (dy > 90) onClose();
  };

  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="sheet-handle" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="sheet-grip" aria-hidden="true" />
          <div className="bar">
            <button className="bar-action" onClick={onClose}>
              {props.action ? 'Annuler' : 'Fermer'}
            </button>
          </div>
        </div>
        <h2 id={titleId} className={props.hideTitle ? 'visually-hidden' : 'sheet-title'}>
          {props.title}
        </h2>
        {props.children}
        {props.action && (
          <div className="sheet-footer">
            <button className="btn btn-primary btn-block" onClick={props.action.onClick} disabled={props.action.disabled}>
              {props.action.label}
            </button>
          </div>
        )}
      </section>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// « Ça coince » : signaler un problème depuis n'importe quel écran
// ---------------------------------------------------------------------------

let reportHandler: ((screen: string, note: string) => void) | null = null;
export function setReportHandler(fn: (screen: string, note: string) => void): void {
  reportHandler = fn;
}

export function ReportButton(): ReactElement {
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="bar-action bar-quiet" onClick={() => setOpen(true)}>
        <Icon name="flag" size={20} />
        Ça coince
      </button>
      <Sheet
        open={open}
        onClose={close}
        title="Qu’est-ce qui coince ?"
        action={{
          label: 'Envoyer',
          disabled: note.trim() === '',
          onClick: () => {
            reportHandler?.(nav.screenName, note.trim());
            setNote('');
            setOpen(false);
            toast('Merci, c’est noté');
          },
        }}
      >
        <p className="sheet-lead">Dis-le comme tu le dirais à voix haute. Le micro du clavier marche aussi.</p>
        <div className="group">
          <textarea
            className="field-area"
            aria-label="Ce qui coince"
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Par exemple : je n’ai pas trouvé où noter un départ plus tôt"
          />
        </div>
        <p className="group-note">Écran : {nav.screenName}. Rien ne part du téléphone : c’est rangé dans l’export du pilote.</p>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Champs de formulaire, présentés comme des rangées iOS
// ---------------------------------------------------------------------------

function FieldRow(props: { label: string; htmlFor: string; hint?: string; error?: string | null; children: ReactNode }): ReactElement {
  return (
    <div className={`row field ${props.error ? 'field-error' : ''}`}>
      <label htmlFor={props.htmlFor} className="field-label">
        {props.label}
        {props.hint && <span className="field-hint">{props.hint}</span>}
        {props.error && <span className="field-msg" role="alert">{props.error}</span>}
      </label>
      {props.children}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'tel' | 'email';
  autoComplete?: string;
}): ReactElement {
  const id = useId();
  return (
    <FieldRow label={props.label} htmlFor={id} {...(props.hint ? { hint: props.hint } : {})}>
      <input
        id={id}
        className="field-input"
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete ?? 'off'}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </FieldRow>
  );
}

/** Montant en euros, saisi librement (« 3,80 »), conservé en centimes. */
export function MoneyField(props: {
  label: string;
  cents: Cents | null;
  onChange: (c: Cents | null) => void;
  hint?: string;
  placeholder?: string;
}): ReactElement {
  const id = useId();
  const [text, setText] = useState(props.cents === null ? '' : formatEuros(props.cents).replace(/\s?€$/, ''));
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldRow label={props.label} htmlFor={id} error={error} {...(props.hint ? { hint: props.hint } : {})}>
      <span className="field-unit">
        <input
          id={id}
          className="field-input"
          inputMode="decimal"
          value={text}
          placeholder={props.placeholder ?? '0,00'}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim() === '') {
              setError(null);
              props.onChange(null);
              return;
            }
            const v = parseEuros(e.target.value);
            setError(v === null ? 'Montant à vérifier' : null);
            if (v !== null) props.onChange(v);
          }}
        />
        <span aria-hidden="true">€</span>
      </span>
    </FieldRow>
  );
}

/** Taux en euros avec jusqu'à 3 décimales (« 3,80 », « 0,435 »), conservé en millièmes. */
export function RateField(props: {
  label: string;
  milli: Milli | null;
  onChange: (m: Milli | null) => void;
  hint?: string;
  unit?: string;
  placeholder?: string;
}): ReactElement {
  const id = useId();
  const [text, setText] = useState(props.milli === null ? '' : formatRate(props.milli).replace(/\s?€$/, ''));
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldRow label={props.label} htmlFor={id} error={error} {...(props.hint ? { hint: props.hint } : {})}>
      <span className="field-unit">
        <input
          id={id}
          className="field-input"
          inputMode="decimal"
          value={text}
          placeholder={props.placeholder ?? '0,00'}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim() === '') {
              setError(null);
              props.onChange(null);
              return;
            }
            const v = parseRateMilli(e.target.value);
            setError(v === null ? 'Taux à vérifier' : null);
            if (v !== null) props.onChange(v);
          }}
        />
        <span aria-hidden="true">{props.unit ?? '€'}</span>
      </span>
    </FieldRow>
  );
}

export function NumberField(props: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  hint?: string;
  unit?: string;
  decimals?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}): ReactElement {
  const id = useId();
  const [text, setText] = useState(props.value === null ? '' : String(props.value).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldRow label={props.label} htmlFor={id} error={error} {...(props.hint ? { hint: props.hint } : {})}>
      <span className="field-unit">
        <input
          id={id}
          className="field-input"
          inputMode={props.decimals ? 'decimal' : 'numeric'}
          value={text}
          placeholder={props.placeholder}
          onChange={(e) => {
            setText(e.target.value);
            const raw = e.target.value.trim().replace(',', '.');
            if (raw === '') {
              setError(null);
              props.onChange(null);
              return;
            }
            const n = Number(raw);
            const ok = Number.isFinite(n) && (props.decimals || Number.isInteger(n))
              && (props.min === undefined || n >= props.min) && (props.max === undefined || n <= props.max);
            setError(ok ? null : 'Nombre à vérifier');
            if (ok) props.onChange(n);
          }}
        />
        {props.unit && <span aria-hidden="true">{props.unit}</span>}
      </span>
    </FieldRow>
  );
}

export function DateField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string; min?: string; max?: string }): ReactElement {
  const id = useId();
  return (
    <FieldRow label={props.label} htmlFor={id} {...(props.hint ? { hint: props.hint } : {})}>
      <input
        id={id}
        className="field-input field-date"
        type="date"
        value={props.value}
        min={props.min}
        max={props.max}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </FieldRow>
  );
}

export function TimeField(props: { label: string; value: Minutes | null; onChange: (v: Minutes | null) => void }): ReactElement {
  const id = useId();
  const v = props.value === null ? '' : `${String(Math.floor(props.value / 60)).padStart(2, '0')}:${String(props.value % 60).padStart(2, '0')}`;
  return (
    <FieldRow label={props.label} htmlFor={id}>
      <input
        id={id}
        className="field-input field-date"
        type="time"
        value={v}
        onChange={(e) => props.onChange(e.target.value ? parseTime(e.target.value) : null)}
      />
    </FieldRow>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }): ReactElement {
  const id = useId();
  return (
    <div className="row field">
      <label htmlFor={id} className="field-label">
        {props.label}
        {props.hint && <span className="field-hint">{props.hint}</span>}
      </label>
      <input id={id} type="checkbox" role="switch" className="switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}): ReactElement {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={props.value === o.value}
          className="segment"
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Liste de choix : une rangée par option, coche sur l'option choisie. */
export function ChoiceList<T extends string>(props: {
  label: string;
  value: T | null;
  options: Array<{ value: T; label: string; sub?: string }>;
  onChange: (v: T) => void;
}): ReactElement {
  return (
    <div className="group" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} className="row row-button" role="radio" aria-checked={props.value === o.value} onClick={() => props.onChange(o.value)}>
          <span className="row-main">
            <span className={o.sub ? 'row-title' : undefined}>{o.label}</span>
            {o.sub && <span className="row-sub">{o.sub}</span>}
          </span>
          <span className="check" aria-hidden="true">{props.value === o.value && <Icon name="check" size={22} stroke={2.4} />}</span>
        </button>
      ))}
    </div>
  );
}

export function IconTile(props: { icon: IconName; label: string; onClick: () => void }): ReactElement {
  return (
    <button onClick={props.onClick}>
      <Icon name={props.icon} size={24} />
      {props.label}
    </button>
  );
}

export { formatTime };

// ---------------------------------------------------------------------------
// Filet de sécurité : un calcul qui échoue n'efface pas tout l'écran
// ---------------------------------------------------------------------------


export class ScreenBoundary extends Component<{ children: ReactNode; onBack: () => void }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportHandler?.('erreur', `${error.message} ${info.componentStack?.split('\n').slice(0, 3).join(' ') ?? ''}`.slice(0, 500));
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen">
        <h1 className="large-title" style={{ paddingTop: 40 }}>Un calcul a coincé</h1>
        <div className="banner banner-bad">
          <p>{this.state.error.message}</p>
          <p>C’est noté dans les signalements du pilote. Tes données ne sont pas touchées.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-block" onClick={() => { this.setState({ error: null }); this.props.onBack(); }}>
            Revenir
          </button>
        </div>
      </main>
    );
  }
}
