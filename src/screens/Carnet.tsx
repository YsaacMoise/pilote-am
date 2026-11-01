import { useState } from 'preact/hooks';
import { activeContracts, addJournal, deleteJournal, logUsage, toast, uid, useStore, ctxFor } from '../store';
import { dayLabel, nowHHMM, today } from '../engine/dates';
import { dayInfo } from '../engine/payroll';
import type { Contract, Journal } from '../engine/model';
import { Gommette, Sheet, Topbar } from '../ui/kit';
import { Icon, type IconName } from '../ui/icons';
import { AideVideo } from '../ui/VideoGuide';
import { shareText } from '../share';

type Kind = Journal['kind'];
const KINDS: { k: Kind; l: string; icon: IconName; options: string[] }[] = [
  { k: 'repas', l: 'Repas', icon: 'meal', options: ['A tout mangé', 'A bien mangé', 'A un peu mangé', 'N’a pas mangé', 'Biberon bu', 'Goûter pris'] },
  { k: 'sieste', l: 'Sieste', icon: 'moon', options: ['Endormissement', 'Réveil', 'Sieste courte', 'Pas de sieste'] },
  { k: 'change', l: 'Change', icon: 'drop', options: ['Couche mouillée', 'Selles', 'Pot / toilettes', 'Change complet'] },
  { k: 'humeur', l: 'Humeur', icon: 'smile', options: ['De bonne humeur', 'Calme', 'Grognon', 'Triste', 'A beaucoup joué', 'A beaucoup pleuré'] },
  { k: 'soin', l: 'Soin', icon: 'heart', options: ['Température prise', 'Médicament donné (ordonnance)', 'Petite chute', 'Crème appliquée', 'Lavage de nez'] },
  { k: 'note', l: 'Note libre', icon: 'note', options: [] },
];
const KIND_LABEL: Record<Kind, string> = { repas: 'Repas', sieste: 'Sieste', change: 'Change', humeur: 'Humeur', soin: 'Soin', note: 'Note' };

export function Carnet() {
  const s = useStore();
  const t = today();
  const kids = activeContracts(t);
  // Enfants présents en ce moment (arrivés, pas encore partis) : pour noter à tous d'un coup
  const present = kids.filter((k) => (dayInfo(ctxFor(k), t).rec?.pres ?? []).some((p) => p.a && !p.d));
  const [cid, setCid] = useState<string | undefined>(present.length > 1 ? 'tous' : kids[0]?.id);
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null);
  const all = cid === 'tous' && present.length > 1;
  const c = all ? undefined : kids.find((k) => k.id === cid) ?? kids[0];
  const targets: Contract[] = all ? present : c ? [c] : [];
  const entries = c ? s.journal.filter((j) => j.cid === c.id && j.date === t).sort((a, b) => a.time.localeCompare(b.time)) : [];

  async function sendSummary(c: Contract) {
    const text = summaryText(c, t, entries);
    const r = await shareText(text);
    logUsage('carnet_partage', 'carnet');
    if (r === 'copied') toast('Résumé copié : colle-le dans ton message aux parents.');
  }

  return (
    <>
      <Topbar title="Carnet" sub={dayLabel(t)} screen="carnet" />
      <main>
        {kids.length > 0 && <AideVideo id="carnet" />}
        {!kids.length && (
          <div class="card empty">
            <h2>Pas d’enfant aujourd’hui</h2>
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
            <section aria-label="Ajouter au carnet de tous les enfants présents" class="quick">
              {KINDS.map((k) => (
                <button onClick={() => setKind(k)}>
                  <span class="q-ico"><Icon name={k.icon} /></span>
                  {k.l}
                </button>
              ))}
            </section>
            <p class="muted">La note s’ajoute au carnet de {present.map((k) => k.child).join(', ')}. Pour voir ou envoyer la journée d’un enfant, touche son prénom.</p>
          </>
        )}
        {c && (
          <>
            <section aria-label={`Ajouter au carnet de ${c.child}`} class="quick">
              {KINDS.map((k) => (
                <button onClick={() => setKind(k)}>
                  <span class="q-ico"><Icon name={k.icon} /></span>
                  {k.l}
                </button>
              ))}
            </section>
            <section class="card stack" aria-labelledby="tl-title">
              <div class="spread">
                <h2 id="tl-title">La journée de {c.child}</h2>
                <span class="muted small">{entries.length} note{entries.length > 1 ? 's' : ''}</span>
              </div>
              {entries.length === 0 ? (
                <p class="muted">Touche un bouton au-dessus : l’heure est notée toute seule.</p>
              ) : (
                <ul class="timeline" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {entries.map((e) => (
                    <li class="tl-item">
                      <span class="tl-time">{e.time.replace(':', 'h')}</span>
                      <span class="ph-no-capture"><b>{KIND_LABEL[e.kind]}</b> · <span class="ph-no-capture" data-ph-mask="">{e.detail}</span></span>
                      <button class="icon-btn ph-no-capture" aria-label={`Supprimer la note de ${e.time.replace(':', 'h')}`} onClick={async () => { const u = await deleteJournal(e.id); toast('Note supprimée', u); }}>
                        <Icon name="trash" size={20} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <button class="btn btn-primary btn-block btn-lg" onClick={() => sendSummary(c)} disabled={!entries.length && !dayInfo(ctxFor(c), t).rec}>
              <Icon name="share" />Envoyer le résumé aux parents
            </button>
          </>
        )}
      </main>
      {kind && targets.length > 0 && <EntrySheet cs={targets} kind={kind} onClose={() => setKind(null)} />}
    </>
  );
}

function EntrySheet({ cs, kind, onClose }: { cs: Contract[]; kind: (typeof KINDS)[number]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [time, setTime] = useState(nowHHMM());
  async function add(detail: string) {
    const undos: Array<() => Promise<void>> = [];
    for (const c of cs) {
      const j: Journal = { id: uid(), cid: c.id, date: today(), time, kind: kind.k, detail };
      undos.push(await addJournal(j));
    }
    logUsage('carnet_' + kind.k + (cs.length > 1 ? '_tous' : ''), 'carnet');
    onClose();
    const who = cs.length > 1 ? ` pour ${cs.length} enfants` : '';
    toast(`${KIND_LABEL[kind.k]} noté à ${time.replace(':', 'h')}${who}`, async () => { for (const u of undos) await u(); });
  }
  const names = cs.map((c) => c.child).join(', ');
  return (
    <Sheet title={`${kind.l}, ${names}`} onClose={onClose}>
      <div class="spread">
        <label for="jr-time" class="label">Heure</label>
        <input id="jr-time" class="input num" style={{ width: '140px' }} type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
      </div>
      {kind.options.length > 0 && (
        <div class="choices">
          {kind.options.map((o) => <button class="choice" onClick={() => add(o)}>{o}</button>)}
        </div>
      )}
      {kind.k === 'soin' && (
        <p class="hint">Un médicament se note aussi dans ton registre des médicaments (nom, dose, heure, ordonnance, autorisation écrite des parents) : ce carnet ne le remplace pas. Un accident grave se déclare sans délai à la PMI de ton département.</p>
      )}
      <div class="field">
        <label for="jr-text">{kind.options.length ? 'Ou écris un détail' : 'Ta note'}</label>
        <textarea id="jr-text" class="input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Ex. : a fait ses premiers pas !" />
        <span class="hint"><span class="kbd-ico"><Icon name="mic" size={18} /></span> Touche le micro du clavier pour dicter.</span>
      </div>
      <button class="btn btn-primary btn-block btn-lg" disabled={!text.trim()} onClick={() => add(text.trim())}>Ajouter la note</button>
    </Sheet>
  );
}

export function summaryText(c: Contract, d: string, entries: Journal[]): string {
  const di = dayInfo(ctxFor(c), d);
  const lines: string[] = [`Bonjour ! La journée de ${c.child}, ${dayLabel(d)} :`, ''];
  const pres = (di.rec?.pres ?? []).filter((p) => p.a);
  if (pres.length) lines.push(`Arrivée ${pres.map((p) => p.a!.replace(':', 'h') + (p.d ? `, départ ${p.d.replace(':', 'h')}` : '')).join(' ; ')}`);
  const by = (k: Kind) => entries.filter((e) => e.kind === k);
  for (const k of ['repas', 'sieste', 'change', 'humeur', 'soin', 'note'] as Kind[]) {
    const es = by(k);
    if (!es.length) continue;
    lines.push(`${KIND_LABEL[k]} : ${es.map((e) => `${e.detail} (${e.time.replace(':', 'h')})`).join(', ')}`);
  }
  lines.push('', 'Bonne soirée !');
  return lines.join('\n');
}
