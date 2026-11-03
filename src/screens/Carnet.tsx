import { useState } from 'preact/hooks';
import { activeContracts, addJournal, deleteJournal, logUsage, toast, uid, updateJournal, useStore, ctxFor } from '../store';
import { addDays, dayLabel, minutes, nowHHMM, today, type ISODate } from '../engine/dates';
import { dayInfo } from '../engine/payroll';
import type { Contract, Journal } from '../engine/model';
import {
  A_APPORTER, KIND_LABEL, choseApporter, detailApporter, detailReveilOublie, estApporter, dureeLabel, insecable, reveilOublie, detailBiberon, detailSieste, detailTemperature, estFievre, hh, parseMl, parseTemperature, resumeJour,
  siesteEnCours, temperatureLabel, type Kind,
} from '../engine/carnet';
import { Gommette, Sheet, Topbar } from '../ui/kit';
import { Icon, type IconName } from '../ui/icons';
import { AideVideo } from '../ui/VideoGuide';
import { shareText } from '../share';
import { de } from '../engine/texte';

// Choix qui ouvrent une case à remplir (la quantité ou la température)
const OPT_BIBERON = 'Biberon';
const OPT_TEMPERATURE = 'Prise de température';

type Groupe = { titre: string; options: string[] };

// Repas : combien il a mangé, ce qu'il a bu, ses goûts. Un seul toucher : l'heure dit de quel repas il s'agit.
const REPAS_GROUPES: Groupe[] = [
  { titre: 'Quantité mangée', options: ['A tout mangé', 'A bien mangé', 'A un peu mangé', 'N’a pas mangé'] },
  { titre: 'Biberon et boissons', options: [OPT_BIBERON, 'A bien bu', 'A peu bu'] },
  { titre: 'Goûts et autonomie', options: ['A goûté un nouvel aliment', 'A refusé un aliment', 'A mangé sans aide'] },
];

// Change : la couche et la propreté
const CHANGE_GROUPES: Groupe[] = [
  { titre: 'Couche', options: ['Couche mouillée', 'Selles', 'Selles liquides', 'Change complet'] },
  { titre: 'Propreté', options: ['Pot / toilettes', 'Petit accident'] },
];

// Humeur : comment il était, ce qu'il a fait, ce qu'il a appris
const HUMEUR_GROUPES: Groupe[] = [
  { titre: 'Humeur', options: ['De bonne humeur', 'Calme', 'Grognon', 'Triste', 'A beaucoup pleuré', 'Signes de fatigue'] },
  { titre: 'Activités', options: ['A beaucoup joué', 'Sortie dehors', 'Activité manuelle', 'Histoires et comptines', 'Jeux avec les autres enfants'] },
  { titre: 'Progrès', options: ['A dit un nouveau mot', 'Progrès en motricité', 'A partagé ou aidé'] },
];

// Soin : les gestes, puis les petits incidents à signaler aux parents
const SOIN_GROUPES: Groupe[] = [
  { titre: 'Soins donnés', options: [OPT_TEMPERATURE, 'Médicament donné (ordonnance)', 'Lavage de nez', 'Crème appliquée', 'Plaie désinfectée'] },
  { titre: 'Petits incidents', options: ['Petite chute', 'Bosse ou bleu', 'Morsure ou griffure', 'Vomissement', 'Saignement de nez'] },
];

const avec = (groupes: Groupe[]) => ({ options: groupes.flatMap((g) => g.options), groupes });

type KindDef = { k: Kind; l: string; icon: IconName; options: string[]; groupes?: Groupe[]; apporter?: boolean };

const KINDS: KindDef[] = [
  { k: 'repas', l: 'Repas', icon: 'meal', ...avec(REPAS_GROUPES) },
  { k: 'sieste', l: 'Sommeil', icon: 'moon', options: ['Sieste rapide (moins de 15 min)', 'Sommeil calme', 'Sommeil agité', 'Réveils pendant la sieste', 'N’a pas dormi'] },
  { k: 'change', l: 'Change', icon: 'couche', ...avec(CHANGE_GROUPES) },
  { k: 'humeur', l: 'Humeur', icon: 'smile', ...avec(HUMEUR_GROUPES) },
  { k: 'soin', l: 'Soin', icon: 'pansement', ...avec(SOIN_GROUPES) },
  { k: 'note', l: 'Note libre', icon: 'edit', options: [] },
];
// Ce que les parents doivent apporter : ce n'est pas un moment de la journée, donc une tuile à part.
// Enregistré comme une note « À apporter : couches » (lisible tel quel partout, même par une ancienne version de l'app).
const APPORTER: KindDef = { k: 'note', l: 'À apporter', icon: 'sac', options: A_APPORTER, apporter: true };
const kindDef = (k: Kind) => KINDS.find((x) => x.k === k)!;
const defDe = (e: Journal) => (estApporter(e) ? APPORTER : kindDef(e.kind));

/** Plus ancien jour consultable dans le carnet */
const JOURS_HISTORIQUE = 60;

export function Carnet() {
  const s = useStore();
  const t = today();
  const [jour, setJour] = useState<ISODate>(t);
  const estAuj = jour === t;
  const kids = activeContracts(jour);
  // Enfants présents en ce moment (arrivés, pas encore partis) : pour noter à tous d'un coup (aujourd'hui seulement)
  const present = estAuj ? kids.filter((k) => (dayInfo(ctxFor(k), t).rec?.pres ?? []).some((p) => p.a && !p.d)) : [];
  const [cid, setCid] = useState<string | undefined>(present.length > 1 ? 'tous' : kids[0]?.id);
  const [sheet, setSheet] = useState<{ kind: KindDef; edit?: Journal } | null>(null);
  const all = cid === 'tous' && present.length > 1;
  const c = all ? undefined : kids.find((k) => k.id === cid) ?? kids[0];
  const targets: Contract[] = all ? present : c ? [c] : [];
  const entries = c ? s.journal.filter((j) => j.cid === c.id && j.date === jour).sort((a, b) => a.time.localeCompare(b.time)) : [];
  const plusAncien = addDays(t, -JOURS_HISTORIQUE);
  // Sommeil commencé et pas terminé (un seul enfant, aujourd'hui) : la fiche propose alors le réveil
  const dort = c && !all && estAuj ? [...entries].reverse().find(siesteEnCours) : undefined;
  // Tous les enfants qui dorment en ce moment, quel que soit l'enfant choisi : le réveil est toujours en haut
  const dormeurs = estAuj
    ? kids.flatMap((k) => {
      const e = s.journal.filter((j) => j.cid === k.id && j.date === t && siesteEnCours(j)).sort((a, b) => b.time.localeCompare(a.time))[0];
      return e ? [{ k, e }] : [];
    })
    : [];
  // Réveils oubliés ces 7 derniers jours (sommeil commencé un jour passé, jamais terminé) : à corriger
  const oublis = estAuj
    ? s.journal
      .filter((j) => j.date >= addDays(t, -7) && reveilOublie(j, t) && kids.some((k) => k.id === j.cid))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    : [];

  async function sendSummary(c: Contract) {
    const r = await shareText(summaryText(c, jour, entries));
    logUsage('carnet_partage', 'carnet');
    if (r === 'copied') toast('Résumé copié : colle-le dans ton message aux parents.');
  }

  async function reveil(e: Journal) {
    const fin = nowHHMM();
    if (fin <= e.time) { setSheet({ kind: kindDef('sieste'), edit: e }); return; }
    const undo = await updateJournal({ ...e, fin, detail: detailSieste(e.time, fin) });
    logUsage('carnet_reveil', 'carnet');
    toast(`Réveil noté à ${hh(fin)}`, undo);
  }

  function changerJour(n: number) {
    const d = addDays(jour, n);
    if (d > t || d < plusAncien) return;
    setJour(d);
    if (d !== t && cid === 'tous') setCid(undefined);
  }

  return (
    <>
      <Topbar title="Carnet" sub={dayLabel(jour)} screen="carnet" />
      <main>
        {kids.length > 0 && estAuj && <AideVideo id="carnet" />}
        <nav class="spread day-nav" aria-label="Jour du carnet">
          <button class="icon-btn" aria-label="Jour précédent" disabled={addDays(jour, -1) < plusAncien} onClick={() => changerJour(-1)}>
            <Icon name="left" />
          </button>
          <span class="day-nav-label">
            <b>{estAuj ? 'Aujourd’hui' : cap(dayLabel(jour))}</b>
            {!estAuj && <button class="btn btn-ghost btn-sm" onClick={() => setJour(t)}>Revenir à aujourd’hui</button>}
          </span>
          <button class="icon-btn" aria-label="Jour suivant" disabled={estAuj} onClick={() => changerJour(1)}>
            <Icon name="right" />
          </button>
        </nav>
        {oublis.length > 0 && (
          <section class="oublis" aria-label="Réveils non notés">
            {oublis.map((e) => {
              const k = kids.find((x) => x.id === e.cid)!;
              const quand = e.date === addDays(t, -1) ? 'hier' : dayLabel(e.date);
              return (
                <div class="oubli-ligne">
                  <span class="oubli-txt"><b>Réveil non noté</b><span>{k.child}, {quand} : endormissement à {hh(e.time)}</span></span>
                  <button class="btn btn-secondary btn-sm" aria-label={`Corriger le sommeil ${de(k.child)} ${quand}`} onClick={() => setSheet({ kind: kindDef('sieste'), edit: e })}>Corriger</button>
                </div>
              );
            })}
          </section>
        )}
        {dormeurs.length > 0 && (
          <section class="dodo" aria-label="En train de dormir">
            {dormeurs.map(({ k, e }) => {
              const depuis = Math.max(0, minutes(nowHHMM()) - minutes(e.time));
              return (
                <div class="dodo-ligne">
                  <span class="dodo-ico"><Icon name="moon" /></span>
                  <span class="dodo-txt"><b>{k.child} dort</b><span>depuis {hh(e.time)}{depuis > 0 ? ` · ${dureeLabel(depuis)}` : ''}</span></span>
                  <button class="btn btn-primary btn-sm" aria-label={`Réveil ${de(k.child)} maintenant`} onClick={() => reveil(e)}>Réveil</button>
                </div>
              );
            })}
          </section>
        )}
        {!kids.length && (
          <div class="card empty">
            <h2>Pas d’enfant ce jour-là</h2>
            <p class="muted">Le carnet de liaison s’ouvre pour les enfants dont le contrat est en cours.</p>
          </div>
        )}
        {kids.length > 1 && (
          <div class="chips" role="group" aria-label="Enfant">
            {present.length > 1 && (
              <button class="chip" aria-pressed={all} onClick={() => setCid('tous')}>
                Tous les présents ({present.length})
              </button>
            )}
            {kids.map((k) => (
              <button class="chip" aria-pressed={!all && k.id === c?.id} onClick={() => setCid(k.id)}>
                <Gommette name={k.child} color={k.color} size="sm" />{k.child}
              </button>
            ))}
          </div>
        )}
        {all && (
          <>
            <QuickButtons label="Ajouter au carnet de tous les enfants présents" onPick={(k) => setSheet({ kind: k })} />
            <p class="muted">La note s’ajoute au carnet {de(present.map((k) => k.child).join(', '))}. Pour voir ou envoyer la journée d’un enfant, touche son prénom.</p>
          </>
        )}
        {c && (
          <>
            <QuickButtons label={`Ajouter au carnet ${de(c.child)}`} onPick={(k) => setSheet({ kind: k })} />
            <section class="card stack" aria-labelledby="tl-title">
              <div class="spread">
                <h2 id="tl-title">La journée {de(c.child)}</h2>
                <span class="muted small">{entries.length} note{entries.length > 1 ? 's' : ''}</span>
              </div>
              {entries.length === 0 ? (
                <p class="muted">{estAuj ? 'Touche un bouton au-dessus : l’heure est notée toute seule.' : 'Aucune note ce jour-là. Tu peux en ajouter une avec les boutons au-dessus.'}</p>
              ) : (
                <ul class="timeline" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {entries.map((e) => (
                    <li class="tl-item">
                      <span class="tl-time">{hh(e.time)}</span>
                      <button
                        class="tl-body ph-no-capture"
                        aria-label={`Modifier la note de ${hh(e.time)}`}
                        onClick={() => setSheet({ kind: defDe(e), edit: e })}
                      >
                        <b>{estApporter(e) ? 'À apporter' : KIND_LABEL[e.kind]}</b> · <span class="ph-no-capture" data-ph-mask="">{insecable(estApporter(e) ? choseApporter(e) : reveilOublie(e, t) ? detailReveilOublie(e.time) : e.temp !== undefined && estFievre(e.temp) ? e.detail.replace(' (fièvre)', '') : e.detail)}</span>
                        {e.temp !== undefined && estFievre(e.temp) && <span class="tag warn tl-tag">Fièvre</span>}
                        {reveilOublie(e, t) && <span class="tag warn tl-tag">Réveil non noté</span>}
                      </button>
                      <span class="tl-actions">
                        <button class="icon-btn ph-no-capture" aria-label={`Supprimer la note de ${hh(e.time)}`} onClick={async () => { const u = await deleteJournal(e.id); toast('Note supprimée', u); }}>
                          <Icon name="trash" size={20} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <button class="btn btn-primary btn-block btn-lg" onClick={() => sendSummary(c)} disabled={!entries.length && !dayInfo(ctxFor(c), jour).rec}>
              <Icon name="share" />{estAuj ? 'Envoyer le résumé aux parents' : 'Envoyer le résumé de ce jour'}
            </button>
          </>
        )}
      </main>
      {sheet && (sheet.edit ? true : targets.length > 0) && (
        <EntrySheet
          cs={sheet.edit ? kids.filter((k) => k.id === sheet.edit!.cid) : targets}
          kind={sheet.kind}
          date={jour}
          edit={sheet.edit}
          ouverte={!sheet.edit && sheet.kind.k === 'sieste' ? dort : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function QuickButtons({ label, onPick }: { label: string; onPick: (k: KindDef) => void }) {
  return (
    <section aria-label={label} class="quick">
      {KINDS.map((k) => (
        <button onClick={() => onPick(k)}>
          <span class="q-ico"><Icon name={k.icon} /></span>
          {k.l}
        </button>
      ))}
      <button class="q-large" onClick={() => onPick(APPORTER)}>
        <span class="q-ico"><Icon name={APPORTER.icon} /></span>
        <span class="q-txt">{APPORTER.l}<small>Demander aux parents</small></span>
      </button>
    </section>
  );
}

/** Champs de la fiche : ce qui est saisi, pas encore enregistré */
type Saisie = Pick<Journal, 'detail' | 'sommeil' | 'fin' | 'ml' | 'temp'>;

function EntrySheet({ cs, kind, date, edit, ouverte, onClose }: {
  cs: Contract[]; kind: KindDef; date: ISODate; edit?: Journal; ouverte?: Journal; onClose: () => void;
}) {
  const maintenant = nowHHMM();
  const estAuj = date === today();
  const sommeil = kind.k === 'sieste' && (!edit || !!edit.sommeil);
  const biberon = kind.k === 'repas' && (!edit || edit.ml !== undefined);
  const thermo = kind.k === 'soin' && (!edit || edit.temp !== undefined);
  const texteLibre = !edit || (!edit.sommeil && edit.ml === undefined && edit.temp === undefined);

  const [time, setTime] = useState(edit?.time ?? maintenant);
  const [fin, setFin] = useState(edit?.fin ?? '');
  // Sommeil déjà terminé (saisi après coup) et réveil à une autre heure
  const [debutPasse, setDebutPasse] = useState('');
  const [finPasse, setFinPasse] = useState('');
  const [heureReveil, setHeureReveil] = useState(maintenant);
  // Choix « Biberon » ou « Prise de température » touché : sa case s'ouvre sous le choix
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ml, setMl] = useState(edit?.ml !== undefined ? String(edit.ml) : '');
  const [temp, setTemp] = useState(edit?.temp !== undefined ? temperatureLabel(edit.temp).replace(' °C', '') : '');
  const [text, setText] = useState(edit && texteLibre ? (kind.apporter ? choseApporter(edit) : edit.detail) : '');

  const finInvalide = !!fin && fin <= time;
  const passeInvalide = !!debutPasse && !!finPasse && finPasse <= debutPasse;
  const reveilInvalide = !!ouverte && heureReveil <= ouverte.time;

  async function reveiller(heure: string) {
    if (!ouverte || heure <= ouverte.time) return;
    const undo = await updateJournal({ ...ouverte, fin: heure, detail: detailSieste(ouverte.time, heure) });
    logUsage('carnet_reveil', 'carnet');
    onClose();
    toast(`Réveil noté à ${hh(heure)}`, undo);
  }
  const mlOk = parseMl(ml);
  const tempOk = parseTemperature(temp);

  async function save(saisie: Saisie, usage: string) {
    return saveAt(time, saisie, usage);
  }

  async function saveAt(time: string, saisie: Saisie, usage: string) {
    const base = { sommeil: undefined, fin: undefined, ml: undefined, temp: undefined };
    if (edit) {
      const undo = await updateJournal({ ...edit, ...base, ...saisie, time });
      logUsage('carnet_modif_' + kind.k, 'carnet');
      onClose();
      toast('Note modifiée', undo);
      return;
    }
    const undos: Array<() => Promise<void>> = [];
    for (const c of cs) {
      const j: Journal = { id: uid(), cid: c.id, date, time, kind: kind.k, ...saisie };
      undos.push(await addJournal(j));
    }
    logUsage(usage + (cs.length > 1 ? '_tous' : ''), 'carnet');
    onClose();
    const who = cs.length > 1 ? ` pour ${cs.length} enfants` : '';
    toast(`Ajouté au carnet à ${hh(time)}${who}`, async () => { for (const u of undos) await u(); });
  }

  const champBiberon = (
        <div class="field">
          <label for="jr-ml">Biberon, quantité bue (ml)</label>
          <div class="row">
            <input id="jr-ml" autoFocus={!edit} class="input num" style={{ width: '140px' }} type="number" inputMode="numeric" min={1} max={500} step={10} value={ml} placeholder="180" onInput={(e) => setMl((e.target as HTMLInputElement).value)} />
            <button class="btn btn-secondary" aria-label={edit ? undefined : 'Ajouter le biberon'} disabled={!mlOk} onClick={() => save({ ml: mlOk!, detail: detailBiberon(mlOk!) }, 'carnet_biberon')}>
              {edit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
  );
  const champTemperature = (
        <div class="field">
          <label for="jr-temp">Température (°C)</label>
          <div class="row">
            <input id="jr-temp" autoFocus={!edit} class="input num" style={{ width: '140px' }} type="text" inputMode="decimal" value={temp} placeholder="37,5" onInput={(e) => setTemp((e.target as HTMLInputElement).value)} />
            <button class="btn btn-secondary" aria-label={edit ? undefined : 'Ajouter la température'} disabled={!tempOk} onClick={() => save({ temp: tempOk!, detail: detailTemperature(tempOk!) }, 'carnet_temperature')}>
              {edit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
          {temp.trim() !== '' && !tempOk && <span class="hint">Entre une température entre 34 et 43 °C, par exemple 38,2.</span>}
          {tempOk !== undefined && estFievre(tempOk) && <span class="hint warn">38 °C ou plus : c’est de la fièvre. Préviens les parents.</span>}
        </div>
  );

  // Sommeil déjà terminé : début et fin, saisis après coup (seul moyen pour un jour passé)
  const passe = (
    <div class="stack-sm">
      <div class="spread">
        <label for="jr-debut" class="label">Endormissement</label>
        <input id="jr-debut" class="input num" style={{ width: '140px' }} type="time" value={debutPasse} onInput={(e) => setDebutPasse((e.target as HTMLInputElement).value)} />
      </div>
      <div class="spread">
        <label for="jr-fin-passe" class="label">Réveil</label>
        <input id="jr-fin-passe" class="input num" style={{ width: '140px' }} type="time" value={finPasse} onInput={(e) => setFinPasse((e.target as HTMLInputElement).value)} />
      </div>
      {passeInvalide && <p class="hint warn" role="alert">L’heure du réveil doit être après l’endormissement.</p>}
      <button
        class={`btn btn-block ${estAuj ? 'btn-secondary' : 'btn-primary btn-lg'}`}
        disabled={!debutPasse || !finPasse || passeInvalide}
        onClick={() => { saveAt(debutPasse, { sommeil: true, fin: finPasse, detail: detailSieste(debutPasse, finPasse) }, 'carnet_sommeil_passe'); }}
      >
        Enregistrer le sommeil
      </button>
    </div>
  );

  const names = cs.map((c) => c.child).join(', ');
  return (
    <Sheet title={edit ? `Modifier : ${(kind.apporter ? kind.l : KIND_LABEL[kind.k]).toLowerCase()}, ${names}` : `${kind.l}, ${names}`} onClose={onClose}>
      {ouverte ? (
        <>
          <p class="sommeil-etat"><Icon name="moon" /><b>Dort depuis {hh(ouverte.time)}</b></p>
          <button class="btn btn-primary btn-block btn-lg" disabled={maintenant <= ouverte.time} onClick={() => reveiller(maintenant)}>Réveil maintenant</button>
          <div class="spread">
            <label for="jr-reveil" class="label">Ou réveil à</label>
            <input id="jr-reveil" class="input num" style={{ width: '140px' }} type="time" value={heureReveil} onInput={(e) => setHeureReveil((e.target as HTMLInputElement).value)} />
          </div>
          {reveilInvalide && <p class="hint warn" role="alert">L’heure du réveil doit être après l’endormissement ({hh(ouverte.time)}).</p>}
          <button class="btn btn-secondary btn-block" disabled={!heureReveil || reveilInvalide} onClick={() => reveiller(heureReveil)}>Enregistrer le réveil</button>
        </>
      ) : (sommeil && !edit && estAuj) || kind.apporter ? null : (
        <div class="spread">
          <label for="jr-time" class="label">{sommeil && edit ? 'Endormissement' : 'Heure'}</label>
          <input id="jr-time" class="input num" style={{ width: '140px' }} type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
        </div>
      )}

      {sommeil && edit && (
        <>
          <div class="spread">
            <label for="jr-fin" class="label">Réveil <span class="muted small">(vide s’il dort encore)</span></label>
            <input id="jr-fin" class="input num" style={{ width: '140px' }} type="time" value={fin} onInput={(e) => setFin((e.target as HTMLInputElement).value)} />
          </div>
          {finInvalide && <p class="hint warn" role="alert">L’heure du réveil doit être après l’endormissement.</p>}
          <button class="btn btn-primary btn-block btn-lg" disabled={!time || finInvalide} onClick={() => save({ sommeil: true, fin: fin || undefined, detail: detailSieste(time, fin || undefined) }, 'carnet_sommeil')}>
            Enregistrer
          </button>
        </>
      )}

      {sommeil && !edit && !ouverte && estAuj && (
        <>
          <button class="btn btn-primary btn-block btn-lg" onClick={() => saveAt(maintenant, { sommeil: true, detail: detailSieste(maintenant) }, 'carnet_endormissement')}>
            <Icon name="moon" />{cs.length > 1 ? 'Ils s’endorment maintenant' : 'S’endort maintenant'}
          </button>
          <p class="hint center">Au réveil, touche <b>Réveil</b> en haut du carnet : la durée se calcule seule.</p>
        </>
      )}


      {edit && biberon && champBiberon}
      {edit && thermo && champTemperature}
      {kind.apporter && <p class="hint">Les parents le voient en haut de leur page, jusqu’à la prochaine arrivée de l’enfant.</p>}
      {texteLibre && !ouverte && kind.options.length > 0 && (
        (kind.groupes ?? [{ titre: '', options: kind.options }]).map((g) => (
          <div class="choices" role="group" aria-label={g.titre || undefined}>
            {g.titre && <span class="choices-titre">{g.titre}</span>}
            {g.options.map((o) => {
              const champ = !edit && o === OPT_BIBERON ? champBiberon : !edit && o === OPT_TEMPERATURE ? champTemperature : null;
              const detail = kind.apporter ? detailApporter(o) : o;
              if (!champ) return <button class="choice" aria-pressed={edit?.detail === detail} onClick={() => save({ detail }, kind.apporter ? 'carnet_apporter' : 'carnet_' + kind.k)}>{o}</button>;
              return (
                <>
                  <button class="choice" aria-expanded={ouvert === o} onClick={() => setOuvert(ouvert === o ? null : o)}>{o}</button>
                  {ouvert === o && <div class="choice-champ">{champ}</div>}
                </>
              );
            })}
          </div>
        ))
      )}
      {sommeil && !edit && !ouverte && (estAuj ? (
        <details class="more">
          <summary>Noter un sommeil déjà terminé</summary>
          <div class="more-body">{passe}</div>
        </details>
      ) : passe)}
      {kind.k === 'soin' && (
        <p class="hint">Un médicament se note aussi dans ton registre des médicaments (nom, dose, heure, ordonnance, autorisation écrite des parents) : ce carnet ne le remplace pas. Un accident grave se déclare sans délai à la PMI de ton département.</p>
      )}
      {texteLibre && !ouverte && (
        <>
          <div class="field">
            <label for="jr-text">{kind.apporter ? (edit ? 'À apporter' : 'Autre chose') : edit ? 'Texte de la note' : kind.options.length || sommeil || biberon || thermo ? 'Ou écris un détail' : 'Ta note'}</label>
            <textarea id="jr-text" class="input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder={kind.apporter ? 'Ex. : une tenue de pluie' : 'Ex. : a fait ses premiers pas !'} />
            <span class="hint"><span class="kbd-ico"><Icon name="mic" size={18} /></span> Touche le micro du clavier pour dicter.</span>
          </div>
          <button class="btn btn-primary btn-block btn-lg" disabled={!text.trim()} onClick={() => save({ detail: kind.apporter ? detailApporter(text) : text.trim() }, kind.apporter ? 'carnet_apporter' : 'carnet_' + kind.k)}>
            {edit ? 'Enregistrer' : kind.apporter ? 'Demander' : 'Ajouter la note'}
          </button>
        </>
      )}
    </Sheet>
  );
}

export function summaryText(c: Contract, d: string, entries: Journal[]): string {
  const di = dayInfo(ctxFor(c), d);
  const pres = (di.rec?.pres ?? []).filter((p) => p.a);
  const presence = pres.length
    ? pres.map((p) => `Arrivée ${hh(p.a!)}${p.d ? `, départ ${hh(p.d)}` : ''}`).join(' ; ')
    : undefined;
  return resumeJour({ enfant: c.child, jour: dayLabel(d), presence, notes: entries, jourTermine: d < today() });
}
