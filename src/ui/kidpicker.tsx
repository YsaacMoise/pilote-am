import type { ReactElement } from 'react';
import type { Contract } from '../engine/types';
import { childOf, initialsOf, kidClass } from '../derive';
import type { AppState } from '../state';
import { Magnet } from './kit';

/** Choix de l'enfant (un contrat) : rangée de pastilles, une seule cochée. */
export function KidPicker(props: { s: AppState; contracts: Contract[]; value: string; onChange: (id: string) => void }): ReactElement | null {
  if (props.contracts.length < 2) return null;
  return (
    <div className="kid-picker" role="radiogroup" aria-label="Enfant">
      {props.contracts.map((c) => {
        const k = childOf(props.s, c);
        return (
          <button key={c.id} role="radio" aria-checked={c.id === props.value} className="kid-pick" onClick={() => props.onChange(c.id)}>
            <Magnet name={k?.firstName ?? '?'} initials={initialsOf(props.s, k)} color={kidClass(k)} small />
            <span className="kid-pick-name">{k?.firstName}</span>
          </button>
        );
      })}
    </div>
  );
}
