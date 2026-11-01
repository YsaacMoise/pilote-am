// Page des parents, ouverte par le lien privé de l'AM : la journée de l'enfant en direct et les montants du mois.
// Aucun compte. Rien n'est gardé sur l'appareil des parents, sauf le code s'ils le demandent
// (le service en ligne y travaille en mémoire seulement, voir backend-firebase.ts).
// Vouvoiement partout : ce sont les employeurs de l'AM.
import { useEffect, useRef, useState } from 'preact/hooks';
import { open, parseLink } from '../partage/crypto';
import { shareBackend } from '../partage/remote';
import type { EntreeCarnet, JourParent, MoisParent, ParentSnapshot } from '../partage/snapshot';
import type { SharedDoc } from '../sync/backend';
import { dayLabel, deMois, monthLabel, today } from '../engine/dates';
import { euros, hoursLabel } from '../engine/money';
import { Gommette, Switch } from '../ui/kit';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/icons';
import { AideVideo } from '../ui/VideoGuide';

const CODE_KEY = (id: string) => `pam-parent-code-${id}`;
const KIND: Record<EntreeCarnet['kind'], string> = { repas: 'Repas', sieste: 'Sieste', change: 'Change', humeur: 'Humeur', soin: 'Soin', note: 'Note' };

const h = (t: string) => t.replace(':', 'h');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* navigation privée */ } }

type Etat =
  | { k: 'invalide' }
  | { k: 'chargement' }
  | { k: 'coupe' }
  | { k: 'reseau' }
  | { k: 'code'; doc: SharedDoc }
  | { k: 'ok'; doc: SharedDoc; snap: ParentSnapshot };

export function Parent({ link }: { link: string }) {
  const keys = parseLink(link);
  const [etat, setEtat] = useState<Etat>(keys ? { k: 'chargement' } : { k: 'invalide' });
  const code = useRef<string | null>(keys ? lsGet(CODE_KEY(keys.id)) : null);

  useEffect(() => {
    if (!keys) return;
    document.title = 'Carnet de liaison · Arvela';
    let stop: (() => void) | undefined;
    let fini = false;
    void shareBackend().then((b) => {
      if (fini) return;
      stop = b.watchShare(keys.id, async (doc) => {
        if (!doc) { setEtat({ k: 'coupe' }); return; }
        if (!code.current) { setEtat({ k: 'code', doc }); return; }
        try {
          const snap = await open<ParentSnapshot>(keys.secret, code.current, doc);
          setEtat({ k: 'ok', doc, snap });
        } catch {
          // Code retenu mais plus valable : on le redemande.
          lsSet(CODE_KEY(keys.id), null);
          code.current = null;
          setEtat({ k: 'code', doc });
        }
      }, () => setEtat((e) => (e.k === 'ok' ? e : { k: 'reseau' })));
    }).catch(() => setEtat({ k: 'reseau' }));
    // Première ouverture sans réseau : le service en ligne attend sans rien dire.
    const lent = setTimeout(() => setEtat((e) => (e.k === 'chargement' ? { k: 'reseau' } : e)), 12000);
    return () => { fini = true; stop?.(); clearTimeout(lent); };
  }, [link]);

  useEffect(() => {
    if (etat.k === 'ok') document.title = `${etat.snap.child} · Carnet de liaison · Arvela`;
  }, [etat.k === 'ok' && etat.snap.child]);

  if (etat.k === 'ok') return <Vue snap={etat.snap} />;

  return (
    <div class="ph">
      <header class="ph-head">
        <Logo size={32} />
        <span class="t"><b>Arvela</b><small>Carnet de liaison</small></span>
      </header>
      <main class="ph-main">
        {etat.k === 'chargement' && <p class="hint center" role="status">Ouverture…</p>}
        {etat.k === 'invalide' && (
          <section class="card stack-sm">
            <h1 class="h-card">Ce lien est incomplet</h1>
            <p>Il manque une partie de l’adresse. Rouvrez le lien depuis le message reçu, en entier.</p>
          </section>
        )}
        {etat.k === 'coupe' && (
          <section class="card stack-sm">
            <h1 class="h-card">Ce lien n’est plus actif</h1>
            <p>L’assistante maternelle l’a coupé, ou il n’a jamais existé. Demandez-lui un nouveau lien.</p>
          </section>
        )}
        {etat.k === 'reseau' && (
          <section class="card stack-sm">
            <h1 class="h-card">Pas de connexion</h1>
            <p>La page a besoin d’internet pour afficher les nouvelles. Vérifiez la connexion puis rechargez la page.</p>
            <button class="btn btn-outline btn-block" onClick={() => location.reload()}>Recharger</button>
          </section>
        )}
        {etat.k === 'code' && keys && (
          <>
            <AideVideo id="parents" permanente />
            <SaisieCode secret={keys.secret} doc={etat.doc} onOk={(c, snap, retenir) => {
              code.current = c;
              if (retenir) lsSet(CODE_KEY(keys.id), c);
              setEtat({ k: 'ok', doc: etat.doc, snap });
            }} />
          </>
        )}
        <p class="foot">Lien privé, à ne pas transférer.</p>
      </main>
    </div>
  );
}

function SaisieCode({ secret, doc, onOk }: { secret: string; doc: SharedDoc; onOk: (code: string, snap: ParentSnapshot, retenir: boolean) => void }) {
  const [val, setVal] = useState('');
  const [retenir, setRetenir] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const essais = useRef(0);
  const [attente, setAttente] = useState(0);

  useEffect(() => {
    if (!attente) return;
    const t = setTimeout(() => setAttente((a) => Math.max(0, a - 1)), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const tester = async (c: string) => {
    if (busy || attente) return;
    setBusy(true);
    setError('');
    try {
      const snap = await open<ParentSnapshot>(secret, c, doc);
      onOk(c, snap, retenir);
    } catch {
      essais.current++;
      setVal('');
      setError('Ce code ne correspond pas. Vérifiez les 4 chiffres donnés par l’assistante maternelle.');
      if (essais.current % 5 === 0) setAttente(30);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card stack" noValidate onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(val)) void tester(val); }}>
      <h1 class="h-card">Code à 4 chiffres</h1>
      <p>L’assistante maternelle vous l’a donné de vive voix. Il n’est jamais écrit dans le lien.</p>
      <div class="field">
        <label for="code-parent">Code</label>
        <input
          id="code-parent" class="input num code-input" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]*"
          value={val} aria-invalid={!!error} aria-describedby={error ? 'code-err' : undefined} disabled={busy || attente > 0}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
            setVal(v);
            if (v.length === 4) void tester(v);
          }}
        />
        {error && <span id="code-err" class="err" role="alert">{error}</span>}
      </div>
      <Switch label="Retenir le code sur cet appareil" hint="Pratique sur votre téléphone. À éviter sur un appareil partagé." checked={retenir} onChange={setRetenir} />
      <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || attente > 0 || val.length !== 4}>
        {busy ? 'Vérification…' : attente ? `Patientez ${attente} s` : 'Ouvrir le carnet'}
      </button>
    </form>
  );
}

function Vue({ snap }: { snap: ParentSnapshot }) {
  const [onglet, setOnglet] = useState<'jour' | 'mois'>('jour');
  const jour = today();
  const maj = new Date(snap.maj);
  const majJour = `${maj.getFullYear()}-${String(maj.getMonth() + 1).padStart(2, '0')}-${String(maj.getDate()).padStart(2, '0')}`;
  const majHeure = `${String(maj.getHours()).padStart(2, '0')}h${String(maj.getMinutes()).padStart(2, '0')}`;

  return (
    <div class="ph">
      <header class="ph-head">
        <Gommette name={snap.child} color={snap.color} />
        <span class="t"><h1 class="ph-title">{snap.child}</h1><small>chez {snap.am}, assistante maternelle</small></span>
        <Logo size={28} />
      </header>
      <div class="seg ph-tabs" role="tablist" aria-label="Affichage">
        <button role="tab" aria-selected={onglet === 'jour'} onClick={() => setOnglet('jour')}>Aujourd’hui</button>
        <button role="tab" aria-selected={onglet === 'mois'} onClick={() => setOnglet('mois')}>Ce mois</button>
      </div>
      <main class="ph-main">
        {onglet === 'jour' ? <Jour snap={snap} jour={jour} /> : <Mois snap={snap} jour={jour} />}
        <p class="foot" role="status">
          <span class="live-dot" aria-hidden="true" />Mis à jour en direct · dernière nouvelle {majJour === jour ? `à ${majHeure}` : `le ${dayLabel(majJour)} à ${majHeure}`}
        </p>
        <p class="foot">Lien privé, à ne pas transférer. {cap(snap.am)} peut le couper à tout moment.</p>
        <div class="foot-aide"><AideVideo id="parents" permanente /></div>
      </main>
    </div>
  );
}

function evenements(j: JourParent | undefined, carnet: EntreeCarnet[], am: string) {
  const out: { t: string; titre: string; sous?: string }[] = [];
  if (j) {
    j.pres.forEach((p, i) => {
      const prevu = j.prevu[i];
      if (p.a) out.push({ t: p.a, titre: 'Arrivée', sous: prevu ? `Prévue à ${h(prevu.start)}` : undefined });
      if (p.d) out.push({ t: p.d, titre: 'Départ', sous: prevu ? `Prévu à ${h(prevu.end)}` : undefined });
    });
  }
  for (const e of carnet) out.push({ t: e.time, titre: e.kind === 'note' ? `Note de ${am}` : KIND[e.kind], sous: e.detail || undefined });
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

function Tag({ j, am }: { j: JourParent; am: string }) {
  switch (j.statut) {
    case 'present': return <span class="tag ok">Chez {am}</span>;
    case 'parti': return <span class="tag info">Journée terminée</span>;
    case 'attendu': return <span class="tag info">Accueil prévu</span>;
    case 'prevu': return <span class="tag info">Selon le planning</span>;
    case 'absent': return <span class="tag warn">Absent</span>;
    case 'am': return <span class="tag warn">Pas d’accueil</span>;
    case 'ferie': return <span class="tag info">Férié</span>;
    default: return null;
  }
}

function Jour({ snap, jour }: { snap: ParentSnapshot; jour: string }) {
  const auj = snap.jours.find((j) => j.date === jour);
  const evAuj = evenements(auj, snap.carnet.filter((e) => e.date === jour), snap.am);
  const avant = snap.jours.filter((j) => j.date < jour);
  return (
    <>
      <section class="card stack-sm" aria-labelledby="auj-t">
        <div class="spread">
          <h2 id="auj-t" class="ph-h2">{cap(dayLabel(jour))}</h2>
          {auj && <Tag j={auj} am={snap.am} />}
        </div>
        {evAuj.map((e) => (
          <div class="ev"><span class="ev-t">{h(e.t)}</span><div><b>{e.titre}</b>{e.sous && <span>{e.sous}</span>}</div></div>
        ))}
        {auj?.motif && <p>{auj.motif}.</p>}
        {auj?.statut === 'attendu' && auj.prevu[0] && !evAuj.length && <p class="muted">Arrivée prévue à {h(auj.prevu[0].start)}. Les nouvelles s’affichent ici au fil de la journée.</p>}
        {!auj && !evAuj.length && snap.today < jour && <p class="muted">Pas encore de nouvelles aujourd’hui.</p>}
        {!auj && !evAuj.length && snap.today >= jour && <p class="muted">Pas d’accueil prévu aujourd’hui.</p>}
      </section>
      {avant.length > 0 && (
        <section class="card stack-sm" aria-labelledby="avant-t">
          <h2 id="avant-t" class="ph-h2 sm">Les jours précédents</h2>
          {avant.map((j) => {
            const notes = snap.carnet.filter((e) => e.date === j.date);
            const pres = j.pres.filter((p) => p.a);
            const titre = j.motif ?? (pres.length
              ? pres.map((p) => `${h(p.a!)} → ${p.d ? h(p.d) : '?'}`).join(', ')
              : j.prevu.map((p) => `${h(p.start)} → ${h(p.end)}`).join(', '));
            const sous = j.motif ? undefined : pres.length ? hoursLabel(j.minutes) : `Selon le planning, ${hoursLabel(j.minutes)}`;
            return (
              <div class="ev">
                <span class="ev-t">{cap(dayLabel(j.date).split(' ')[0].slice(0, 3))}. {Number(j.date.slice(8))}</span>
                <div class="ev-body">
                  <b>{titre}</b>{sous && <span>{sous}</span>}
                  {notes.length > 0 && (
                    <details class="ev-details">
                      <summary>Carnet ({notes.length})</summary>
                      {notes.map((e) => <p><span class="num">{h(e.time)}</span> · <b>{e.kind === 'note' ? 'Note' : KIND[e.kind]}</b>{e.detail ? ` · ${e.detail}` : ''}</p>)}
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

/** Valeur à coller dans Pajemploi : sans l'unité */
function aCopier(v: string): string {
  return v.replace(/[  ]/g, ' ').replace(/\s*€$/, '').replace(/^(\d+) h$/, '$1').trim();
}

function Mois({ snap, jour }: { snap: ParentSnapshot; jour: string }) {
  const fini = snap.mois.find((m) => m.termine);
  const enCours = snap.mois.find((m) => !m.termine);
  const [m, setM] = useState<string | undefined>(() => (fini && Number(jour.slice(8)) <= 15 ? fini : enCours ?? fini)?.month);
  const mois = snap.mois.find((x) => x.month === m);
  if (!mois) {
    return <section class="card"><p>Les montants s’afficheront ici dès le premier mois suivi dans Arvela.</p></section>;
  }
  return (
    <>
      {snap.mois.length > 1 && (
        <div class="seg seg-sm" role="radiogroup" aria-label="Mois">
          {snap.mois.map((x) => <button role="radio" aria-checked={x.month === m} onClick={() => setM(x.month)}>{cap(monthLabel(x.month).split(' ')[0])}</button>)}
        </div>
      )}
      <MoisVue mois={mois} am={snap.am} />
    </>
  );
}

function MoisVue({ mois, am }: { mois: MoisParent; am: string }) {
  const [copie, setCopie] = useState<string | null>(null);
  const detail = [
    `salaire net ${euros(mois.net)}`,
    mois.entretien ? `entretien ${euros(mois.entretien)}` : '',
    mois.repas ? `repas ${euros(mois.repas)}` : '',
    mois.km ? `kilomètres ${euros(mois.km)}` : '',
  ].filter(Boolean);
  return (
    <>
      <section class="summary stack" aria-labelledby="tot-p">
        <span class="summary-label" id="tot-p">À verser à {am} pour {monthLabel(mois.month).split(' ')[0]}</span>
        <span class="total">{euros(mois.total)}</span>
        <span class="summary-sub">{cap(detail.join(', '))}</span>
        <span class="summary-note">{mois.termine ? 'Mois terminé' : 'Provisoire jusqu’à la fin du mois'}</span>
      </section>
      <section class="card stack-sm" aria-labelledby="decl-p">
        <h2 id="decl-p" class="ph-h2">Votre déclaration Pajemploi</h2>
        <p class="hint">Recopiez chaque case dans l’ordre du site Pajemploi. Le bouton copie la valeur.</p>
        {mois.lignes.map((l) => {
          const v = aCopier(l.value);
          return (
            <div class="cp">
              <span class="cp-l">{l.label}{l.hint && <small>{l.hint}</small>}</span>
              <span class="cp-v">
                {l.value}
                <button
                  class={`cpy${copie === l.label ? ' done' : ''}`} type="button" aria-label={`Copier ${l.label} : ${v}`}
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(v); setCopie(l.label); setTimeout(() => setCopie((c) => (c === l.label ? null : c)), 2000); } catch { /* copie refusée */ }
                  }}
                >
                  <Icon name={copie === l.label ? 'check' : 'copy'} size={18} />
                </button>
              </span>
            </div>
          );
        })}
        <p class="sr-only" role="status">{copie ? `${copie} copié` : ''}</p>
      </section>
      <section class="card stack-sm">
        <h2 class="ph-h2 sm">Les jours {deMois(mois.month)}</h2>
        <p>{mois.joursAccueil} jour{mois.joursAccueil > 1 ? 's' : ''} d’accueil{mois.absences ? `, ${mois.absences} absence${mois.absences > 1 ? 's' : ''} de l’enfant` : ''}{mois.termine ? '' : ' à ce jour'}.</p>
      </section>
      <p class="foot">Montants calculés par Arvela d’après le contrat et les présences notées par {am}. La déclaration Pajemploi et le bulletin de salaire font foi.</p>
    </>
  );
}
