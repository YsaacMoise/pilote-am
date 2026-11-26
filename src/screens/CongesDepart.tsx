// T-119 : congés de départ d'un contrat commencé avant l'app, calculés par Arvela depuis la date de début du contrat.
// L'AM ne donne que les jours déjà pris depuis le 1er juin (0 proposé) et une éventuelle longue absence non payée.
// Règle : calculateur-arvela, regles/t119-conges-depart.md. Seuls les résultats sont enregistrés (cpRestants, cpEnCours,
// cpSaisi), jamais les réponses.
import { useEffect, useState } from 'preact/hooks';
import { congesDeDepart } from '../engine/conges';
import { shortDate } from '../engine/dates';
import type { Contract, StartBalances } from '../engine/model';
import { putContract, state, toast } from '../store';
import { Choices, NumberInput } from '../ui/kit';

const nb = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const jours = (x: number) => `${nb(x)} jour${x > 1 ? 's' : ''}`;

/**
 * `enregistrer` : écran Mois, Congés ou Fin ; le bouton « C'est juste » enregistre le contrat (un geste).
 * `formulaire` : écran Contrat ; chaque réponse met à jour les soldes du formulaire, enregistrés avec le contrat.
 */
/** T-122 : réponses gardées par l'assistant d'ajout ; avec `onReponses`, rien n'est coché ni rempli d'avance. */
export interface ReponsesDepart { pris?: number; absent?: 'non' | 'oui'; absPrec?: number; absCours?: number }

export function CongesDepart({ c, mode = 'enregistrer', onSoldes, reponses, onReponses }: { c: Contract; mode?: 'enregistrer' | 'formulaire'; onSoldes?: (b: StartBalances) => void; reponses?: ReponsesDepart; onReponses?: (r: ReponsesDepart, complet: boolean) => void }) {
  const sansDefaut = !!onReponses;
  const [pris, setPris0] = useState<number | undefined>(sansDefaut ? reponses?.pris : 0);
  const [absent, setAbsent0] = useState<'non' | 'oui' | undefined>(sansDefaut ? reponses?.absent : 'non');
  const [absPrec, setAbsPrec0] = useState(reponses?.absPrec ?? 0);
  const [absCours, setAbsCours0] = useState(reponses?.absCours ?? 0);
  const setPris = (v: number | undefined) => setPris0(sansDefaut ? v : v ?? 0);
  const setAbsent = setAbsent0, setAbsPrec = setAbsPrec0, setAbsCours = setAbsCours0;
  const enfants = state.settings?.enfantsACharge ?? 0;
  // Relecture T-119 (M2, M3) : la question des jours pris n'a de sens que s'il y a des droits à prendre (contrat commencé avant
  // le 1er juin) et des jours entre le 1er juin et le début du suivi ; sinon elle n'est pas posée et vaut 0.
  const sansPris = congesDeDepart(c, c.trackedFrom, { absencePrec: absent === 'oui' ? absPrec : 0, absenceCours: absent === 'oui' ? absCours : 0 }, enfants, state.settings?.amMoins21Jusqu);
  const fenetrePris = c.trackedFrom > sansPris.depuis;
  const demanderPris = fenetrePris && sansPris.droitsPrec > 0;
  const prisRetenu = demanderPris ? pris ?? 0 : 0;
  const d = congesDeDepart(c, c.trackedFrom, { pris: prisRetenu, absencePrec: absent === 'oui' ? absPrec : 0, absenceCours: absent === 'oui' ? absCours : 0 }, enfants, state.settings?.amMoins21Jusqu);
  const debutCours = c.start > d.depuis ? c.start : d.depuis;
  const soldes = (): StartBalances => ({ ...c.balances, cpRestants: d.cpRestants, cpEnCours: d.cpEnCours, cpSaisi: true });
  // En mode formulaire, les soldes du formulaire suivent chaque réponse ; ils sont enregistrés avec le contrat.
  const complet = !sansDefaut || ((!demanderPris || pris !== undefined) && absent !== undefined);
  useEffect(() => {
    if (mode === 'formulaire' && onSoldes && !d.aConfirmer && complet) onSoldes(soldes());
  }, [mode, d.cpRestants, d.cpEnCours, d.aConfirmer, complet]);
  useEffect(() => { onReponses?.({ pris, absent, absPrec, absCours }, complet && !d.aConfirmer); }, [pris, absent, absPrec, absCours, complet, d.aConfirmer]);
  if (d.aConfirmer) {
    return (
      <div class="conges-depart">
        <p class="hint">{d.aConfirmer}</p>
        {mode === 'enregistrer' && <a class="btn btn-outline" href={`#/contrat/${c.id}`}>Saisir mes congés dans le contrat</a>}
      </div>
    );
  }
  const anneeJuin = d.depuis.slice(0, 4);
  return (
    <div class="conges-depart stack">
      {demanderPris && <NumberInput label={`Jours de congés déjà pris depuis le 1er juin ${anneeJuin}`} hint="Jours ouvrables." value={pris} step={1} max={60} onChange={(v) => setPris(v)} />}
      {demanderPris && (pris ?? 0) > d.droitsPrec && <p class="hint">Tu indiques {jours(pris ?? 0)} pris pour {jours(d.droitsPrec)} acquis : les jours en plus étaient des congés sans solde, ou pris par avance avec l’accord écrit des parents. Vérifie tes bulletins ; Arvela compte 0 jour restant.</p>}
      <Choices label="Congé sans solde ou absence non rémunérée avant le suivi ?" value={absent}
        options={[{ v: 'non', l: 'Non' }, { v: 'oui', l: 'Oui' }]}
        onChange={(v) => setAbsent(v)} />
      {absent === 'oui' && d.precDu && <NumberInput label={`Jours d’accueil non travaillés et non payés du ${shortDate(d.precDu)} au ${shortDate(d.precAu!)}`} hint="Les jours où l’accueil était prévu au contrat." value={absPrec} step={1} max={400} onChange={(v) => setAbsPrec(v ?? 0)} />}
      {absent === 'oui' && d.jusqua >= debutCours && <NumberInput label={`Jours d’accueil non travaillés et non payés du ${shortDate(debutCours)} au ${shortDate(d.jusqua)}`} value={absCours} step={1} max={400} onChange={(v) => setAbsCours(v ?? 0)} />}
      {/* T-122 (textes au strict minimum) : les congés acquis restent visibles, à vérifier ; l'explication est repliée. */}
      <dl class="kv">
          {d.precDu && <><dt>Acquis du {shortDate(d.precDu)} au {shortDate(d.precAu!)}</dt><dd>{jours(d.droitsPrec)}</dd></>}
          {d.precDu && demanderPris && <><dt>Déjà pris depuis le 1er juin {anneeJuin}</dt><dd>{jours(pris ?? 0)}</dd></>}
          {d.precDu && <><dt>Reste à prendre jusqu’au 31 mai {Number(anneeJuin) + 1}</dt><dd>{jours(d.cpRestants)}</dd></>}
          {d.jusqua >= debutCours && <><dt>Acquis du {shortDate(debutCours)} au {shortDate(d.jusqua)}, à prendre à partir du 1er juin {Number(anneeJuin) + 1}</dt><dd>{jours(d.cpEnCours)}</dd></>}
      </dl>
      {!d.precDu && <p>Aucun congé à prendre avant le 1er juin {Number(anneeJuin) + 1} : le contrat a commencé après le 1er juin {anneeJuin}.</p>}
      <details class="more">
        <summary>Comment c’est calculé</summary>
        <div class="more-body"><p class="hint">2,5 jours par mois de travail (convention, article 48.1.1.2), décompte le plus favorable en cas d’absence, arrondi au jour supérieur au 31 mai.</p></div>
      </details>
      {mode === 'enregistrer' && (
        <button class="btn btn-primary" onClick={async () => { await putContract({ ...c, balances: soldes() }); toast('Congés de départ enregistrés'); }}>C’est juste</button>
      )}
    </div>
  );
}
