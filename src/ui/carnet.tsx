import { useEffect, useRef, useState, type ReactElement } from 'react';
import { formatTime, type ISODate, type Minutes } from '../engine/dates';
import {
  addNotes, deleteNotes, editNotes, napSince, NAP_END, NAP_START, NOTE_CHIPS, NOTE_LABELS,
} from '../actions';
import { initialsOf, kidClass } from '../derive';
import { logEvent, type NoteKind } from '../state';
import { Icon, type IconName } from './icons';
import { useAppState } from './hooks';
import { Magnet, toast } from './kit';

const KINDS: Array<{ kind: NoteKind; icon: IconName; label: string }> = [
  { kind: 'repas', icon: 'repas', label: 'Repas' },
  { kind: 'sieste', icon: 'sieste', label: 'Sieste' },
  { kind: 'change', icon: 'change', label: 'Change' },
  { kind: 'humeur', icon: 'humeur', label: 'Humeur' },
  { kind: 'soin', icon: 'soin', label: 'Soin' },
  { kind: 'libre', icon: 'libre', label: 'Dicter' },
];

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
}

/**
 * Boutons de saisie rapide du carnet. Un tap note l'événement à l'heure qu'il est ;
 * le détail (puces, texte dicté) est facultatif. En mode « plusieurs enfants »,
 * une rangée de pastilles choisit qui est concerné (tous cochés au départ).
 */
export function NotePanel(props: { childIds: string[]; date: ISODate; now: Minutes; multi?: boolean }): ReactElement {
  const s = useAppState();
  const [selected, setSelected] = useState<string[]>(props.childIds);
  const [editing, setEditing] = useState<{ ids: string[]; kind: NoteKind; childIds: string[]; time: Minutes } | null>(null);
  const [text, setText] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const editingRef = useRef<typeof editing>(null);
  const textRef = useRef('');
  editingRef.current = editing;
  textRef.current = text;

  useEffect(() => {
    if (editing?.kind === 'libre') areaRef.current?.focus();
  }, [editing]);

  const children = props.childIds.map((id) => s.children.find((c) => c.id === id)).filter((c) => c !== undefined);
  const targets = props.multi ? selected : props.childIds;

  const tap = (kind: NoteKind): void => {
    if (targets.length === 0) return;
    if (kind === 'sieste') {
      const starting: string[] = [];
      const ending: string[] = [];
      for (const id of targets) (napSince(s, id, props.date) === null ? starting : ending).push(id);
      // Sélection mixte : on endort ceux qui sont réveillés, sans réveiller les autres
      if (starting.length && ending.length) ending.length = 0;
      let undo: (() => void) | undefined;
      if (starting.length) undo = addNotes(starting, props.date, props.now, 'sieste', NAP_START).undo;
      if (ending.length) {
        const r = addNotes(ending, props.date, props.now, 'sieste', NAP_END);
        undo ??= r.undo;
      }
      logEvent('carnet', `sieste-${starting.length ? 'debut' : 'fin'}`);
      const who = names(targets.map((id) => s.children.find((c) => c.id === id)?.firstName ?? ''));
      const whoStart = names(starting.map((id) => s.children.find((c) => c.id === id)?.firstName ?? ''));
      const msg = starting.length ? `Sieste de ${whoStart} : début à ${formatTime(props.now)}` : `Réveil de ${who} à ${formatTime(props.now)}`;
      toast(msg, undo);
      setEditing(null);
      return;
    }
    discardEmpty();
    const { ids } = addNotes(targets, props.date, props.now, kind, '');
    logEvent('carnet', kind);
    setText('');
    setEditing({ ids, kind, childIds: targets, time: props.now });
  };

  /** Une dictée laissée vide ne doit pas devenir une ligne « Note » envoyée aux parents */
  const discardEmpty = (): void => {
    if (editing?.kind === 'libre' && text.trim() === '') deleteNotes(editing.ids);
  };

  useEffect(() => () => {
    // en quittant la feuille
    if (editingRef.current?.kind === 'libre' && textRef.current.trim() === '') deleteNotes(editingRef.current.ids);
  }, []);

  const setNoteText = (t: string): void => {
    setText(t);
    if (editing) editNotes(editing.ids, { text: t });
  };

  const toggleChip = (chip: string): void => {
    const parts = text.split(', ').map((p) => p.trim()).filter(Boolean);
    const next = parts.includes(chip) ? parts.filter((p) => p !== chip) : [...parts, chip];
    setNoteText(next.join(', '));
  };

  const napping = (id: string): Minutes | null => napSince(s, id, props.date);
  const allNapping = targets.length > 0 && targets.every((id) => napping(id) !== null);
  const napStart = targets.length === 1 && targets[0] ? napping(targets[0]) : null;

  return (
    <div>
      {props.multi && children.length > 1 && (
        <div className="who" role="group" aria-label="Pour qui">
          {children.map((c) => {
            const on = selected.includes(c.id);
            return (
              <button
                key={c.id}
                className="kid-pick"
                role="checkbox"
                aria-checked={on}
                onClick={() => setSelected(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
              >
                <Magnet name={c.firstName} initials={initialsOf(s, c)} color={kidClass(c)} small />
                <span className="kid-pick-name">{c.firstName}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="quick" style={props.multi && children.length > 1 ? { marginTop: 10 } : undefined}>
        {KINDS.map((k) => {
          const pressed = k.kind === 'sieste' && allNapping;
          return (
            <button key={k.kind} onClick={() => tap(k.kind)} aria-pressed={k.kind === 'sieste' ? pressed : undefined} disabled={targets.length === 0}>
              <Icon name={k.icon} size={24} />
              {k.kind === 'sieste' && pressed ? 'Réveil' : k.label}
              {k.kind === 'sieste' && napStart !== null && <span className="quick-state">depuis {formatTime(napStart)}</span>}
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="note-editor" style={{ marginTop: 14 }}>
          <p className="group-note" style={{ marginTop: 0, marginBottom: 8 }} role="status">
            {NOTE_LABELS[editing.kind]} noté à {formatTime(editing.time)}
            {props.multi || editing.childIds.length > 1
              ? ` pour ${names(editing.childIds.map((id) => s.children.find((c) => c.id === id)?.firstName ?? ''))}`
              : ''}
            . Le détail est facultatif.
          </p>
          {NOTE_CHIPS[editing.kind].length > 0 && (
            <div className="chips">
              {NOTE_CHIPS[editing.kind].map((chip) => (
                <button key={chip} className="chip" aria-pressed={text.split(', ').includes(chip)} onClick={() => toggleChip(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          )}
          <div className="group" style={{ marginTop: 10 }}>
            <textarea
              ref={areaRef}
              className="field-area"
              style={{ minHeight: editing.kind === 'libre' ? 120 : 64 }}
              rows={editing.kind === 'libre' ? 4 : 2}
              aria-label="Détail"
              value={text}
              placeholder={editing.kind === 'libre' ? 'Touche le micro du clavier et parle' : 'Ajouter un mot (facultatif)'}
              onChange={(e) => setNoteText(e.target.value)}
            />
          </div>
          <div className="actions" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <button
              className="btn btn-plain"
              style={{ color: 'var(--negative)' }}
              onClick={() => {
                const undo = deleteNotes(editing.ids);
                setEditing(null);
                toast('Note supprimée', undo);
              }}
            >
              Supprimer
            </button>
            <button className="btn btn-soft" onClick={() => { discardEmpty(); setEditing(null); }}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
