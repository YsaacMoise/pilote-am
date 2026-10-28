import { useState } from 'preact/hooks';
import { activeContracts, addJournal, deleteJournal, logUsage, toast, uid, useStore, ctxFor } from '../store';
import { dayLabel, nowHHMM, today } from '../engine/dates';
import { dayInfo } from '../engine/payroll';
import type { Contract, Journal } from '../engine/model';
import { Gommette, Sheet, Topbar } from '../ui/kit';
import { Icon, type IconName } from '../ui/icons';
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
  const [cid, setCid] = useState<string | undefined>(kids[0]?.id);
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null);
  const c = kids.find((k) => k.id === cid) ?? kids[0];
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
        {!kids.length && (
          <div class="card empty">
            <h2>Pas d’enfant aujourd’hui</h2>
            <p class="muted">Le carnet de liaison s’ouvre pour les enfants dont le contrat est en cours.</p>
          </div>
        )}
        {kids.length > 1 && (
          <div class="chips" role="group" aria-label="Enfant">
            {kids.map((k) => (
              <button class="chip" aria-pressed={k.id === c?.id} onClick={() => setCid(k.id)}>
                <Gommette name={k.child} color={k.color} size="sm" />{k.child}
              </button>
            ))}
          </div>
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
                      <span><b>{KIND_LABEL[e.kind]}</b> · {e.detail}</span>
                      <button class="icon-btn" aria-label={`Supprimer « ${e.detail} »`} onClick={async () => { const u = await deleteJournal(e.id); toast('Note supprimée', u); }}>
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
      {kind && c && <EntrySheet c={c} kind={kind} onClose={() => setKind(null)} />}
    </>
  );
}

function EntrySheet({ c, kind, onClose }: { c: Contract; kind: (typeof KINDS)[number]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [time, setTime] = useState(nowHHMM());
  async function add(detail: string) {
    const j: Journal = { id: uid(), cid: c.id, date: today(), time, kind: kind.k, detail };
    const undo = await addJournal(j);
    logUsage('carnet_' + kind.k, 'carnet');
    onClose();
    toast(`${KIND_LABEL[kind.k]} noté à ${time.replace(':', 'h')}`, undo);
  }
  return (
    <Sheet title={`${kind.l} · ${c.child}`} onClose={onClose}>
      {kind.options.length > 0 && (
        <div class="choices">
          {kind.options.map((o) => <button class="choice" onClick={() => add(o)}>{o}</button>)}
        </div>
      )}
      <div class="field">
        <label for="jr-text">{kind.options.length ? 'Ou écris un détail' : 'Ta note'}</label>
        <textarea id="jr-text" class="input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Ex. : a fait ses premiers pas !" />
        <span class="hint"><span class="kbd-ico"><Icon name="mic" size={18} /></span> Touche le micro du clavier pour dicter.</span>
      </div>
      <div class="field">
        <label for="jr-time">Heure</label>
        <input id="jr-time" class="input num" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
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
