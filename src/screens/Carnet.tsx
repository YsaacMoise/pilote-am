import { useState } from 'preact/hooks';
import { activeContracts, addJournal, deleteJournal, logUsage, toast, uid, updateJournal, useStore, ctxFor } from '../store';
import { addDays, dayLabel, nowHHMM, today, type ISODate } from '../engine/dates';
import { dayInfo } from '../engine/payroll';
import type { Contract, Journal } from '../engine/model';
import {
  KIND_LABEL, insecable, detailBiberon, detailSieste, detailTemperature, estFievre, hh, parseMl, parseTemperature, resumeJour,
  siesteEnCours, temperatureLabel, type Kind,
} from '../engine/carnet';
import { Gommette, Sheet, Topbar } from '../ui/kit';
import { Icon, type IconName } from '../ui/icons';
import { AideVideo } from '../ui/VideoGuide';
import { shareText } from '../share';

const KINDS: { k: Kind; l: string; icon: IconName; options: string[] }[] = [
  { k: 'repas', l: 'Repas', icon: 'meal', options: ['A tout mangé', 'A bien mangé', 'A un peu mangé', 'N’a pas mangé', 'Goûter pris'] },
  { k: 'sieste', l: 'Sieste', icon: 'moon', options: ['Pas de sieste'] },
  { k: 'change', l: 'Change', icon: 'drop', options: ['Couche mouillée', 'Selles', 'Pot / toilettes', 'Change complet'] },
  { k: 'humeur', l: 'Humeur', icon: 'smile', options: ['De bonne humeur', 'Calme', 'Grognon', 'Triste', 'A beaucoup joué', 'A beaucoup pleuré'] },
  { k: 'soin', l: 'Soin', icon: 'heart', options: ['Médicament donné (ordonnance)', 'Petite chute', 'Crème appliquée', 'Lavage de nez'] },
  { k: 'note', l: 'Note libre', icon: 'note', options: [] },
];
const kindDef = (k: Kind) => KINDS.find((x) => x.k === k)!;

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
  const [sheet, setSheet] = useState<{ kind: (typeof KINDS)[number]; edit?: Journal } | null>(null);
  const all = cid === 'tous' && present.length > 1;
  const c = all ? undefined : kids.find((k) => k.id === cid) ?? kids[0];
  const targets: Contract[] = all ? present : c ? [c] : [];
  const entries = c ? s.journal.filter((j) => j.cid === c.id && j.date === jour).sort((a, b) => a.time.localeCompare(b.time)) : [];
  const plusAncien = addDays(t, -JOURS_HISTORIQUE);

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
            <p class="muted">La note s’ajoute au carnet de {present.map((k) => k.child).join(', ')}. Pour voir ou envoyer la journée d’un enfant, touche son prénom.</p>
          </>
        )}
        {c && (
          <>
            <QuickButtons label={`Ajouter au carnet de ${c.child}`} onPick={(k) => setSheet({ kind: k })} />
            <section class="card stack" aria-labelledby="tl-title">
              <div class="spread">
                <h2 id="tl-title">La journée de {c.child}</h2>
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
                        onClick={() => setSheet({ kind: kindDef(e.kind), edit: e })}
                      >
                        <b>{KIND_LABEL[e.kind]}</b> · <span class="ph-no-capture" data-ph-mask="">{insecable(e.temp !== undefined && estFievre(e.temp) ? e.detail.replace(' (fièvre)', '') : e.detail)}</span>
                        {e.temp !== undefined && estFievre(e.temp) && <span class="tag warn tl-tag">Fièvre</span>}
                      </button>
                      <span class="tl-actions">
                        {siesteEnCours(e) && estAuj && (
                          <button class="btn btn-secondary btn-sm" aria-label={`Réveil de ${c.child} maintenant`} onClick={() => reveil(e)}>Réveil</button>
                        )}
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
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function QuickButtons({ label, onPick }: { label: string; onPick: (k: (typeof KINDS)[number]) => void }) {
  return (
    <section aria-label={label} class="quick">
      {KINDS.map((k) => (
        <button onClick={() => onPick(k)}>
          <span class="q-ico"><Icon name={k.icon} /></span>
          {k.l}
        </button>
      ))}
    </section>
  );
}

/** Champs de la fiche : ce qui est saisi, pas encore enregistré */
type Saisie = Pick<Journal, 'detail' | 'sommeil' | 'fin' | 'ml' | 'temp'>;

function EntrySheet({ cs, kind, date, edit, onClose }: {
  cs: Contract[]; kind: (typeof KINDS)[number]; date: ISODate; edit?: Journal; onClose: () => void;
}) {
  const sommeil = kind.k === 'sieste' && (!edit || !!edit.sommeil);
  const biberon = kind.k === 'repas' && (!edit || edit.ml !== undefined);
  const thermo = kind.k === 'soin' && (!edit || edit.temp !== undefined);
  const texteLibre = !edit || (!edit.sommeil && edit.ml === undefined && edit.temp === undefined);

  const [time, setTime] = useState(edit?.time ?? nowHHMM());
  const [fin, setFin] = useState(edit?.fin ?? '');
  const [ml, setMl] = useState(edit?.ml !== undefined ? String(edit.ml) : '');
  const [temp, setTemp] = useState(edit?.temp !== undefined ? temperatureLabel(edit.temp).replace(' °C', '') : '');
  const [text, setText] = useState(edit && texteLibre ? edit.detail : '');

  const finInvalide = !!fin && fin <= time;
  const mlOk = parseMl(ml);
  const tempOk = parseTemperature(temp);

  async function save(saisie: Saisie, usage: string) {
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

  const names = cs.map((c) => c.child).join(', ');
  return (
    <Sheet title={edit ? `Modifier : ${KIND_LABEL[kind.k].toLowerCase()}, ${names}` : `${kind.l}, ${names}`} onClose={onClose}>
      <div class="spread">
        <label for="jr-time" class="label">{sommeil ? 'Endormissement' : 'Heure'}</label>
        <input id="jr-time" class="input num" style={{ width: '140px' }} type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
      </div>

      {sommeil && (
        <>
          <div class="spread">
            <label for="jr-fin" class="label">Réveil <span class="muted small">(vide si la sieste continue)</span></label>
            <input id="jr-fin" class="input num" style={{ width: '140px' }} type="time" value={fin} onInput={(e) => setFin((e.target as HTMLInputElement).value)} />
          </div>
          {finInvalide && <p class="hint warn" role="alert">L’heure du réveil doit être après l’endormissement.</p>}
          <button
            class="btn btn-primary btn-block btn-lg"
            disabled={!time || finInvalide}
            onClick={() => save({ sommeil: true, fin: fin || undefined, detail: detailSieste(time, fin || undefined) }, fin ? 'carnet_sieste' : 'carnet_endormissement')}
          >
            {edit ? 'Enregistrer' : fin ? 'Enregistrer la sieste' : 'Noter l’endormissement'}
          </button>
        </>
      )}

      {biberon && (
        <div class="field">
          <label for="jr-ml">Biberon, quantité bue (ml)</label>
          <div class="row">
            <input id="jr-ml" class="input num" style={{ width: '140px' }} type="number" inputMode="numeric" min={1} max={500} step={10} value={ml} placeholder="180" onInput={(e) => setMl((e.target as HTMLInputElement).value)} />
            <button class="btn btn-secondary" aria-label={edit ? undefined : 'Ajouter le biberon'} disabled={!mlOk} onClick={() => save({ ml: mlOk!, detail: detailBiberon(mlOk!) }, 'carnet_biberon')}>
              {edit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {thermo && (
        <div class="field">
          <label for="jr-temp">Température (°C)</label>
          <div class="row">
            <input id="jr-temp" class="input num" style={{ width: '140px' }} type="text" inputMode="decimal" value={temp} placeholder="37,5" onInput={(e) => setTemp((e.target as HTMLInputElement).value)} />
            <button class="btn btn-secondary" aria-label={edit ? undefined : 'Ajouter la température'} disabled={!tempOk} onClick={() => save({ temp: tempOk!, detail: detailTemperature(tempOk!) }, 'carnet_temperature')}>
              {edit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
          {temp.trim() !== '' && !tempOk && <span class="hint">Entre une température entre 34 et 43 °C, par exemple 38,2.</span>}
          {tempOk !== undefined && estFievre(tempOk) && <span class="hint warn">38 °C ou plus : c’est de la fièvre. Préviens les parents.</span>}
        </div>
      )}

      {texteLibre && kind.options.length > 0 && (
        <div class="choices">
          {kind.options.map((o) => <button class="choice" aria-pressed={edit?.detail === o} onClick={() => save({ detail: o }, 'carnet_' + kind.k)}>{o}</button>)}
        </div>
      )}
      {kind.k === 'soin' && (
        <p class="hint">Un médicament se note aussi dans ton registre des médicaments (nom, dose, heure, ordonnance, autorisation écrite des parents) : ce carnet ne le remplace pas. Un accident grave se déclare sans délai à la PMI de ton département.</p>
      )}
      {texteLibre && (
        <>
          <div class="field">
            <label for="jr-text">{edit ? 'Texte de la note' : kind.options.length || sommeil || biberon || thermo ? 'Ou écris un détail' : 'Ta note'}</label>
            <textarea id="jr-text" class="input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Ex. : a fait ses premiers pas !" />
            <span class="hint"><span class="kbd-ico"><Icon name="mic" size={18} /></span> Touche le micro du clavier pour dicter.</span>
          </div>
          <button class="btn btn-primary btn-block btn-lg" disabled={!text.trim()} onClick={() => save({ detail: text.trim() }, 'carnet_' + kind.k)}>
            {edit ? 'Enregistrer' : 'Ajouter la note'}
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
  return resumeJour({ enfant: c.child, jour: dayLabel(d), presence, notes: entries });
}
