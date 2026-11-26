// T-126 (décision du DG du 26/11/2026) : « C'est déclaré ». L'AM note qu'un mois d'un enfant est déclaré sur Pajemploi.
// Un état par enfant et par mois (date du geste), gardé dans le contrat, synchronisé avec lui, annulable.
// Aucun effet sur la paie : le calcul ne lit jamais ce champ.
import type { ISODate, Month } from './engine/dates';
import type { Contract } from './engine/model';

/** Date (AAAA-MM-JJ) où le mois a été noté déclaré, ou undefined. */
export function declareLe(c: Pick<Contract, 'declares'>, month: Month): ISODate | undefined {
  return c.declares?.[month];
}

/** Contrat avec le mois noté déclaré le `jour`. Les autres mois ne bougent pas. */
export function marquerDeclare(c: Contract, month: Month, jour: ISODate): Contract {
  return { ...c, declares: { ...(c.declares ?? {}), [month]: jour } };
}

/** Contrat sans la note « déclaré » de ce mois ; le champ disparaît quand plus aucun mois n'est noté. */
export function annulerDeclare(c: Contract, month: Month): Contract {
  const d = { ...(c.declares ?? {}) };
  delete d[month];
  const out: Contract = { ...c, declares: d };
  if (!Object.keys(d).length) delete out.declares;
  return out;
}

/** « Déclaré le 26/11 » */
export function texteDeclare(jour: ISODate): string {
  return `Déclaré le ${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
}
