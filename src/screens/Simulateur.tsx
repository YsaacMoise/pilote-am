// Simulateur d'accueil : ce que coûte une assistante maternelle à une famille, avant et après les aides.
// Ouvert à tous (sans compte, depuis l'accueil du site) et dans l'app (Plus › Simuler un accueil).
// Rien n'est envoyé : le calcul se fait sur le téléphone. Le lien partagé ne contient jamais les revenus de la famille.
import { useEffect, useRef, useState } from 'preact/hooks';
import { SIM_RESSOURCES } from './SimApercu';
import { logUsage } from '../store';
import { JOUR_NOMS, today } from '../engine/dates';
import type { Plage, Planning } from '../engine/model';
import { euros, hoursLabel } from '../engine/money';
import {
  HEURES_MAX_AN, HEURES_SANS_ACCORD, HEURES_MAX_JOUR, REPAS_NOMS, REPAS_REGLES, TYPES_REPAS, bornesKm, planningDepuisTexte, planningRegulier,
  planningVersTexte, ratioNet, simuler, simulationParDefaut, type AgeEnfant, type SimInput, type TypeRepas,
} from '../engine/simulation';
import { Banner, Choices, EuroInput, NumberInput, Seg, Stepper, Switch, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { shareText } from '../share';

const nf = new Intl.NumberFormat('fr-FR');
/** Salaire minimum avec le titre Assistant maternel – Assistant parental (avenant n° 10, 1er juin 2026) */
const MINIMUM_AM_AP = 437;

/** Brouillon de contrat laissé par le simulateur, repris par l'écran « Nouveau contrat » (lu une seule fois). */
export const BROUILLON_CONTRAT = 'pam-contrat-brouillon';

// Paramètres partageables : l'accueil et le tarif, jamais la situation de la famille.
// Valeurs admises dans un lien partagé (un lien modifié ne doit pas casser le calcul).
const NOMBRES: Partial<Record<keyof SimInput, [number, number]>> = {
  semainesAbsence: [1, 30], majoration: [10, 100], tauxBrut: [0, 5000], entretien: [0, 5000], kmMois: [0, 5000], kmTaux: [0, 200], cv: [3, 8],
};
const REPAS_CLES: Record<TypeRepas, string> = { petitDej: 'rpd', dejeuner: 'rdj', gouter: 'rgo', diner: 'rdi' };

function depuisAdresse(base: SimInput): SimInput {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const out: SimInput = { ...base, repas: { ...base.repas } };
  const num = (k: string, min: number, max: number): number | undefined => {
    const v = q.get(k);
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
  };
  // Planning : nouveau format, sinon anciens liens (jours + heures par semaine)
  const pl = q.get('pl');
  const planning = pl ? planningDepuisTexte(pl) : null;
  if (planning) out.planning = planning;
  else if (q.get('heures') !== null) out.planning = planningRegulier(num('jours', 1, 6) ?? 5, num('heures', 1, 60) ?? 40);
  // Anciens liens (avant novembre 2026) : taux saisi en net, converti en brut ; entretien par jour ; un prix de repas.
  const ancienNet = num('tauxNet', 1, 5000);
  if (q.get('tauxBrut') === null && ancienNet) out.tauxBrut = Math.round(ancienNet / ratioNet(today(), false));
  const ancienEntretien = num('entretienJour', 0, 5000);
  if (ancienEntretien !== undefined) out.entretien = ancienEntretien;
  const ancienRepas = num('repasPrix', 0, 5000);
  if (ancienRepas) out.repas.dejeuner = ancienRepas;
  for (const k of Object.keys(NOMBRES) as (keyof SimInput)[]) {
    const [min, max] = NOMBRES[k]!;
    const n = num(k, min, max);
    if (n !== undefined) (out as any)[k] = k === 'semainesAbsence' || k === 'cv' ? Math.round(n) : n;
  }
  const yt = q.get('yearType');
  if (yt === 'complete' || yt === 'incomplete') out.yearType = yt;
  if (q.get('alsaceMoselle') !== null) out.alsaceMoselle = q.get('alsaceMoselle') === '1';
  if (q.get('entretienMode') === 'heure') out.entretienMode = 'heure';
  for (const t of TYPES_REPAS) { const n = num(REPAS_CLES[t], 0, 5000); if (n !== undefined) out.repas[t] = n; }
  // Revenus choisis sur la page d'accueil (lus une seule fois, jamais dans l'adresse)
  try {
    const r = Number(sessionStorage.getItem(SIM_RESSOURCES));
    sessionStorage.removeItem(SIM_RESSOURCES);
    if (Number.isFinite(r) && r >= 0 && r <= 100000 && r > 0) out.ressourcesMois = Math.round(r);
  } catch { /* navigation privée */ }
  return out;
}

function lienPartage(i: SimInput): string {
  const q = new URLSearchParams();
  q.set('pl', planningVersTexte(i.planning));
  for (const k of ['yearType', 'semainesAbsence', 'majoration', 'tauxBrut', 'entretien', 'entretienMode'] as const) q.set(k, String(i[k]));
  q.set('alsaceMoselle', i.alsaceMoselle ? '1' : '0');
  for (const t of TYPES_REPAS) if (i.repas[t] > 0) q.set(REPAS_CLES[t], String(i.repas[t]));
  if (i.kmMois > 0) { q.set('kmMois', String(i.kmMois)); q.set('kmTaux', String(i.kmTaux)); q.set('cv', String(i.cv)); }
  return `${location.origin}${location.pathname}#/simulateur?${q.toString()}`;
}

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const nomJour = (w: number) => JOUR_NOMS[w - 1];
const listeJours = (ws: number[]) => ws.map(nomJour).join(', ').replace(/, ([^,]*)$/, ' et $1');
const memesPlages = (a: Plage[], b: Plage[]) => JSON.stringify(a) === JSON.stringify(b);
/** Jours cochés (même si l'horaire saisi est encore incomplet) */
function joursActifs(pl: Planning): number[] {
  return [1, 2, 3, 4, 5, 6, 7].filter((w) => (pl[w]?.length ?? 0) > 0);
}
function horairesIdentiques(pl: Planning): boolean {
  const js = joursActifs(pl);
  return js.every((w) => memesPlages(pl[w], pl[js[0]]));
}
const prixKm = (milliemes: number) => `${(milliemes / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`;

/** Une ou deux plages horaires (arrivée, départ) */
function Plages({ nom, plages, onChange }: { nom: string; plages: Plage[]; onChange: (p: Plage[]) => void }) {
  return (
    <>
      {plages.map((p, k) => (
        <div class="plan-range">
          <input class="input num" type="time" aria-label={`${nom}, arrivée${k ? ' (2e plage)' : ''}`} value={p.start} onInput={(e) => onChange(plages.map((x, j) => (j === k ? { ...x, start: (e.target as HTMLInputElement).value } : x)))} />
          <span aria-hidden="true">à</span>
          <input class="input num" type="time" aria-label={`${nom}, départ${k ? ' (2e plage)' : ''}`} value={p.end} onInput={(e) => onChange(plages.map((x, j) => (j === k ? { ...x, end: (e.target as HTMLInputElement).value } : x)))} />
          {k === 1 ? <button type="button" class="icon-btn" aria-label={`Retirer la 2e plage (${nom})`} onClick={() => onChange(plages.slice(0, 1))}><Icon name="x" size={20} /></button> : <span style={{ width: '48px' }} />}
        </div>
      ))}
      {plages.length === 1 && <button type="button" class="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...plages, { start: '16:30', end: '18:30' }])}><Icon name="plus" />Ajouter une 2e plage</button>}
    </>
  );
}

export function Simulateur({ back, connecte }: { back: string; connecte: boolean }) {
  const d = today();
  const [i, setI] = useState<SimInput>(() => depuisAdresse(simulationParDefaut(d)));
  const set = (p: Partial<SimInput>) => setI({ ...i, ...p });
  const r = simuler(i, d);
  const resultRef = useRef<HTMLElement>(null);
  const [resultVisible, setResultVisible] = useState(false);
  useEffect(() => {
    const el = resultRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setResultVisible(e.isIntersecting || e.boundingClientRect.top < 0), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const repasFournis = TYPES_REPAS.some((t) => i.repas[t] > 0);
  const [repasOuverts, setRepasOuverts] = useState(repasFournis);
  const [kmOuvert, setKmOuvert] = useState(i.kmMois > 0);
  const [parJour, setParJour] = useState(() => !horairesIdentiques(i.planning));
  const actifs = joursActifs(i.planning);
  const modele: Plage[] = actifs.length ? i.planning[actifs[0]] : [{ start: '08:00', end: '17:00' }];
  const setPlanning = (planning: Planning) => set({ planning });
  const basculerJour = (w: number) => {
    const pl: Planning = { ...i.planning };
    pl[w] = actifs.includes(w) ? [] : structuredClone(modele);
    setPlanning(pl);
  };
  const plagesIdentiques = (p: Plage[]) => {
    const pl: Planning = {};
    for (const w of actifs) pl[w] = structuredClone(p);
    setPlanning(pl);
  };
  const entretiens = r.parJour.length ? r.parJour.map((j) => j.entretien) : [0];
  const entretienMin = Math.min(...entretiens), entretienMax = Math.max(...entretiens);
  const joursAuMinimum = r.parJour.filter((j) => j.entretien > (i.entretienMode === 'heure' ? Math.round((i.entretien * j.minutes) / 60) : i.entretien)).map((j) => j.jour);
  const repasParSemaine = (t: TypeRepas) => r.parJour.filter((j) => j.repas.includes(t)).length;
  const kmAn = i.kmMois * 12;
  const kmHorsBornes = i.kmMois > 0 && (i.kmTaux * 10 < r.kmBornes.min || i.kmTaux * 10 > r.kmBornes.max);
  const partager = async () => {
    logUsage('simulateur_partage', 'simulateur');
    const texte = `Simulation d'accueil Arvela : ${hoursLabel(r.minutesSemaine)} par semaine sur ${r.joursSemaine} jours, ${r.semaines} semaines par an, ${euros(i.tauxBrut)} brut de l'heure (${euros(r.tauxNet)} net).\n`
      + `À verser chaque mois : ${euros(r.verse)} (salaire ${euros(r.salaire)}, entretien ${euros(r.entretien)}${r.repas ? `, repas ${euros(r.repas)}` : ''}${r.km ? `, déplacements ${euros(r.km)}` : ''}).\n`
      + `Pour voir l'aide de la CAF, les cotisations et le coût réel avec vos revenus : ${lienPartage(i)}`;
    await shareText(texte);
  };
  const creerContrat = () => {
    try {
      const prixRepas = TYPES_REPAS.map((t) => i.repas[t]).filter((x) => x > 0);
      sessionStorage.setItem(BROUILLON_CONTRAT, JSON.stringify({
        planning: i.planning, yearType: i.yearType, weeks: r.semaines, majoration: i.majoration, rateNet: r.tauxNet,
        entretienJour: i.entretienMode === 'jour' ? i.entretien : 0, repasPrix: prixRepas[0] ?? 0, repasParJour: prixRepas.length, kmTaux: r.km > 0 ? i.kmTaux : 0,
      }));
    } catch { /* stockage indisponible : le contrat partira des valeurs par défaut */ }
    logUsage('simulateur_contrat', 'simulateur');
    location.hash = connecte ? '#/contrat/nouveau' : '#/';
  };

  return (
    <>
      <Topbar title="Simuler un accueil" back={back} screen="simulateur" />
      <main class="sim-main">
        <div class="sim-form">
        <p class="hint">Pour une famille qui emploie une assistante maternelle. Tout est calculé sur ce téléphone : rien n’est envoyé.</p>

        <section class="card">
          <fieldset>
            <legend>L’accueil</legend>
            <Seg label="Horaires" value={parJour ? 'differents' : 'identiques'} options={[{ v: 'identiques', l: 'Les mêmes chaque jour' }, { v: 'differents', l: 'Selon les jours' }]}
              onChange={(v) => { if (v === 'identiques' && !horairesIdentiques(i.planning)) plagesIdentiques(modele); setParJour(v === 'differents'); }} />
            {!parJour ? (
              <>
                <div class="field">
                  <span class="label" id="sim-jours">Jours d’accueil</span>
                  <div class="chips" role="group" aria-labelledby="sim-jours">
                    {[1, 2, 3, 4, 5, 6, 7].map((w) => (
                      <button type="button" class="chip" aria-pressed={actifs.includes(w)} aria-label={nomJour(w)} onClick={() => basculerJour(w)}>{JOURS_COURTS[w - 1]}</button>
                    ))}
                  </div>
                </div>
                {actifs.length > 0 && <Plages nom="Chaque jour" plages={modele} onChange={plagesIdentiques} />}
              </>
            ) : (
              [1, 2, 3, 4, 5, 6, 7].map((w) => {
                const on = (i.planning[w]?.length ?? 0) > 0;
                return (
                  <div class="plan-day">
                    <Switch label={nomJour(w).replace(/^./, (x) => x.toUpperCase())} checked={on} onChange={(v) => setPlanning({ ...i.planning, [w]: v ? structuredClone(modele) : [] })} />
                    {on && <Plages nom={nomJour(w)} plages={i.planning[w]} onChange={(p) => setPlanning({ ...i.planning, [w]: p })} />}
                  </div>
                );
              })
            )}
            <p class="hint">{r.joursSemaine ? `${hoursLabel(r.minutesSemaine)} par semaine sur ${r.joursSemaine} jour${r.joursSemaine > 1 ? 's' : ''}.` : 'Choisissez au moins un jour d’accueil.'}</p>
            {r.joursTropLongs.length > 0 && <Banner tone="warn">Plus de {HEURES_MAX_JOUR} h entre l’arrivée et le départ le {listeJours(r.joursTropLongs)} : l’assistante maternelle doit avoir 11 h de repos par jour.</Banner>}
            {r.depasseAnnuel && <Banner tone="warn">Ce planning dépasse {nf.format(HEURES_MAX_AN)} h par an, même avec l’accord de l’assistante maternelle : {hoursLabel(Math.round(r.heuresMax * 60))} par semaine au plus sur {r.semainesGarde} semaines travaillées.</Banner>}
            {r.accordNecessaire && <Banner tone="info">Plus de {HEURES_SANS_ACCORD} h par semaine : l’assistante maternelle doit donner son accord écrit, et ne pas dépasser {nf.format(HEURES_MAX_AN)} h par an, tous contrats confondus.</Banner>}
            {r.heuresMajMoisMin > 0 && (
              <NumberInput label="Majoration au-delà de 45 h (%)" hint="10 % au moins (convention collective)" value={i.majoration} min={10} max={100} onChange={(v) => set({ majoration: Math.max(10, v ?? 10) })} />
            )}
            <Seg label="Semaines d’accueil" value={i.yearType} options={[{ v: 'complete', l: '52 semaines' }, { v: 'incomplete', l: 'Moins de 52' }]} onChange={(v) => set({ yearType: v })} />
            {i.yearType === 'incomplete' && (
              <Stepper label="Semaines sans accueil, en plus des 5 semaines de congés" value={Math.max(1, i.semainesAbsence)} min={1} max={30} onChange={(v) => set({ semainesAbsence: v })} />
            )}
            <p class="hint">{i.yearType === 'complete' ? '52 semaines payées par an, dont 5 de congés de l’assistante maternelle' : `${r.semaines} semaines d’accueil par an, plus les congés payés`}, soit {hoursLabel(r.heuresMoisMin)} payées par mois.</p>
          </fieldset>
        </section>

        <section class="card">
          <fieldset>
            <legend>Le tarif</legend>
            <EuroInput label="Salaire horaire brut" hint={`Soit ${euros(r.tauxNet)} net. Minimum : ${euros(r.minimumBrut)} brut (${euros(MINIMUM_AM_AP)} avec le titre AM-AP).`} cents={i.tauxBrut} onChange={(v) => set({ tauxBrut: v ?? 0 })} />
            {r.sousMinimum && <Banner tone="warn">Ce taux est sous le minimum de la convention collective : {euros(r.minimumBrut)} brut de l’heure depuis le 1er juin 2026.</Banner>}
            <Switch label="L’assistante maternelle travaille en Alsace-Moselle" hint="Bas-Rhin, Haut-Rhin ou Moselle : cotisations plus élevées, donc un net plus bas pour le même brut." checked={i.alsaceMoselle} onChange={(v) => set({ alsaceMoselle: v })} />
            <Seg label="Indemnité d’entretien prévue" value={i.entretienMode} options={[{ v: 'jour', l: 'Par jour' }, { v: 'heure', l: 'Par heure' }]} onChange={(v) => set({ entretienMode: v, entretien: 0 })} />
            <EuroInput label={i.entretienMode === 'jour' ? 'Montant par jour d’accueil' : 'Montant par heure d’accueil'} allowEmpty cents={i.entretien || undefined} onChange={(v) => set({ entretien: v ?? 0 })}
              hint={`Minimum légal chaque jour : 0,435 € par heure d’accueil, jamais moins de 2,65 €.${joursAuMinimum.length ? ` Il s’applique le ${listeJours(joursAuMinimum)}.` : ''}`} />
            <Switch label="L’assistante maternelle fournit des repas" checked={repasOuverts}
              onChange={(on) => { setRepasOuverts(on); set({ repas: on ? { petitDej: 0, dejeuner: 400, gouter: 0, diner: 0 } : { petitDej: 0, dejeuner: 0, gouter: 0, diner: 0 } }); }} />
            {repasOuverts && (
              <>
                <p class="hint">Prix de chaque repas fourni. Laissez vide ceux que les parents apportent. Chaque repas est compté les jours où l’enfant est là à son heure.</p>
                <div class="grid2">
                  {TYPES_REPAS.map((t) => (
                    <EuroInput label={REPAS_NOMS[t]} allowEmpty cents={i.repas[t] || undefined} onChange={(v) => set({ repas: { ...i.repas, [t]: v ?? 0 } })}
                      hint={i.repas[t] > 0 ? `${repasParSemaine(t)} par semaine` : REPAS_REGLES[t].replace('les jours où ', 'si ')} />
                  ))}
                </div>
              </>
            )}
            <Switch label="L’assistante maternelle transporte l’enfant en voiture" hint="École, activités : indemnités kilométriques à la charge de la famille." checked={kmOuvert}
              onChange={(on) => { setKmOuvert(on); set(on ? { kmMois: 40, kmTaux: Math.ceil(bornesKm(i.cv, 480).min / 10) } : { kmMois: 0 }); }} />
            {kmOuvert && (
              <>
                <div class="grid2">
                  <NumberInput label="Kilomètres par mois" value={i.kmMois || undefined} min={0} max={5000} onChange={(v) => set({ kmMois: v ?? 0 })} />
                  <EuroInput label="Tarif par km" cents={i.kmTaux || undefined} allowEmpty onChange={(v) => set({ kmTaux: v ?? 0 })} />
                </div>
                <Stepper label="Puissance fiscale de la voiture" value={i.cv} min={3} max={8} unit={i.cv >= 8 ? 'CV et +' : 'CV'} onChange={(v) => set({ cv: v })} />
                <p class="hint">Pour {nf.format(kmAn)} km par an : au moins {prixKm(r.kmBornes.min)} par km (barème de l’administration), au plus {prixKm(r.kmBornes.max)} (barème fiscal).</p>
                {kmHorsBornes && <Banner tone="warn">Ce tarif sort de la fourchette légale : entre {prixKm(r.kmBornes.min)} et {prixKm(r.kmBornes.max)} par km.</Banner>}
              </>
            )}
          </fieldset>
        </section>

        <section class="card">
          <fieldset>
            <legend>La famille</legend>
            <p class="hint">Pour l’aide de la CAF et le crédit d’impôt. L’aide suppose en principe que les parents travaillent (exceptions : études, AAH, RSA…).</p>
            <Choices<AgeEnfant> label="Âge de l’enfant accueilli" value={i.age} onChange={(v) => set({ age: v })}
              options={[{ v: 'moins6', l: 'Moins de 6 ans', sub: 'Au 1er janvier, pour le crédit d’impôt' }, { v: '6a12', l: 'De 6 à 12 ans', sub: 'Aide de la CAF seulement pour un parent seul' }]} />
            {i.age === '6a12' && <Switch label="Parent seul" checked={i.parentSeul} onChange={(v) => set({ parentSeul: v })} />}
            <Stepper label="Enfants à charge dans le foyer" value={i.enfantsACharge} min={1} max={10} onChange={(v) => set({ enfantsACharge: v, enfantsAeeh: Math.min(i.enfantsAeeh, v) })} />
            <Stepper label="Dont enfants qui touchent l’AEEH (allocation pour enfant handicapé)" value={i.enfantsAeeh} min={0} max={i.enfantsACharge} onChange={(v) => set({ enfantsAeeh: v })} />
            <EuroInput label="Revenus mensuels du foyer, pour la CAF" hint={`Le revenu imposable de ${Number(d.slice(0, 4)) - 2} du foyer (avis d’impôt ${Number(d.slice(0, 4)) - 1}), divisé par 12. Ce n’est ni le salaire reçu chaque mois, ni l’impôt payé.`} cents={i.ressourcesMois * 100} onChange={(v) => set({ ressourcesMois: Math.round((v ?? 0) / 100) })} />
          </fieldset>
        </section>

        </div>
        <div class="sim-result">
        {/* Rappel du résultat collé en bas de l'écran pendant la saisie ; il s'efface quand le résultat complet est visible. */}
        <button type="button" class={`sim-sticky ${resultVisible ? 'is-hidden' : ''} ${connecte ? 'with-tabbar' : ''}`} aria-hidden={resultVisible} tabIndex={resultVisible ? -1 : 0}
          onClick={() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span>Coût réel par mois</span><b>{euros(r.reel)}</b><Icon name="right" size={18} />
        </button>

        <section ref={resultRef} class="summary stack" aria-labelledby="sim-t" aria-live="polite">
          <span class="summary-label" id="sim-t">Coût réel pour la famille, par mois</span>
          <span class="total">{euros(r.reel)}</span>
          <span class="summary-sub">après l’aide de la CAF{r.creditEligible ? ' et le crédit d’impôt réparti sur l’année' : ''}</span>
          <span class="summary-note">Estimation</span>
        </section>

        <section class="card" aria-labelledby="sim-d">
          <h2 id="sim-d" style={{ marginBottom: '8px' }}>Le détail</h2>
          <div class="decl">
            <div class="decl-line"><span class="decl-label"><span>Salaire net mensualisé</span><span class="decl-hint">{hoursLabel(r.heuresMoisMin)} par mois</span></span><span class="decl-value">{euros(r.salaire)}</span></div>
            {r.congesMois > 0 && <div class="decl-line"><span class="decl-label"><span>Congés payés</span><span class="decl-hint">environ {euros(r.congesAnnuels)} par an, répartis ici sur 12 mois</span></span><span class="decl-value">{euros(r.congesMois)}</span></div>}
            {r.reductionHeuresMaj > 0 && <div class="decl-line"><span class="decl-label"><span>Réduction de cotisations des heures majorées</span><span class="decl-hint">11,31 % du brut des heures au-delà de 45 h, versés en plus du salaire</span></span><span class="decl-value">{euros(r.reductionHeuresMaj)}</span></div>}
            <div class="decl-line"><span class="decl-label"><span>Indemnités d’entretien</span><span class="decl-hint">{entretienMin === entretienMax ? euros(entretienMin) : `de ${euros(entretienMin)} à ${euros(entretienMax)}`} par jour × {r.joursAn} jours d’accueil par an ÷ 12{r.feriesAn > 0 ? `, ${Math.round(r.feriesAn)} jours fériés retirés` : ''}</span></span><span class="decl-value">{euros(r.entretien)}</span></div>
            {r.repas > 0 && <div class="decl-line"><span class="decl-label"><span>Repas</span><span class="decl-hint">{TYPES_REPAS.filter((t) => r.repasAn[t] > 0).map((t) => `${r.repasAn[t]} ${REPAS_NOMS[t].toLowerCase()}s`).join(', ')} par an ÷ 12</span></span><span class="decl-value">{euros(r.repas)}</span></div>}
            {r.km > 0 && <div class="decl-line"><span class="decl-label"><span>Indemnités kilométriques</span><span class="decl-hint">{nf.format(i.kmMois)} km × {euros(i.kmTaux)} ; ni l’aide de la CAF ni le crédit d’impôt ne les couvrent</span></span><span class="decl-value">{euros(r.km)}</span></div>}
            <div class="decl-line"><span class="decl-label"><span><b>À verser à l’assistante maternelle</b></span><span class="decl-hint">en moyenne par mois</span></span><span class="decl-value">{euros(r.verse)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Cotisations sociales</span><span class="decl-hint">parts salariale et patronale, prélevées par Pajemploi</span></span><span class="decl-value">{euros(r.cotisations)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Prises en charge par la CAF</span><span class="decl-hint">{!r.cmgEligible ? 'aucune : pas d’aide de la CAF pour cet âge' : r.cmg.depassePlafond ? `${Math.round(r.cmg.partCotisations * 100)} % : le coût de l’heure dépasse ${euros(r.cmg.params.plafondHoraire)}` : 'en totalité'}</span></span><span class="decl-value">− {euros(r.cotisationsPrisesEnCharge)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Aide de la CAF (CMG)</span><span class="decl-hint">{r.cmgEligible ? 'versée chaque mois après la déclaration' : 'pas d’aide pour cet âge, sauf parent seul'}</span></span><span class="decl-value">− {euros(r.cmg.montant)}</span></div>
            <div class="decl-line"><span class="decl-label"><span><b>Reste à payer</b></span><span class="decl-hint">en moyenne par mois, soit {euros(r.resteHoraire)} de l’heure</span></span><span class="decl-value">{euros(r.reste)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Crédit d’impôt</span><span class="decl-hint">{r.creditEligible ? `${euros(r.creditAnnuel)} par an, versé l’année suivante : la première année, tout arrive l’été suivant ; ensuite, avance de 60 % en janvier` : 'enfant de 6 ans ou plus au 1er janvier : pas de crédit'}</span></span><span class="decl-value">− {euros(Math.round(r.creditAnnuel / 12))}</span></div>
          </div>
          {!r.cmgEligible && <Banner tone="warn">Sans aide de la CAF, la famille paie toutes les cotisations sociales : {euros(r.cotisationsReste)} par mois en plus du salaire. Elles sont comptées dans le reste à payer.</Banner>}
          {r.congesAnnuels > 0 && <Banner tone="info" icon="sun">Moins de 52 semaines : les congés payés sont versés en juin, au congé principal ou au fil des congés. Le mois où ils sont payés, l’aide de la CAF peut être plafonnée.</Banner>}
          {r.cmgEligible && r.cmg.depassePlafond && <Banner tone="warn">Le coût de l’heure ({euros(r.cmg.coutHoraire)}, entretien et repas compris) dépasse {euros(r.cmg.params.plafondHoraire)}. L’aide de la CAF est calculée sur ce plafond, et elle ne prend en charge que {Math.round(r.cmg.partCotisations * 100)} % des cotisations : {euros(r.cotisationsReste)} par mois restent à la famille.</Banner>}
        </section>

        <div class="btn-row">
          <button class="btn btn-primary btn-lg" onClick={() => void partager()}><Icon name="share" />Envoyer à la famille</button>
          <button class="btn btn-outline btn-lg" onClick={creerContrat}><Icon name="plus" />{connecte ? 'Créer le contrat' : 'Créer mon compte'}</button>
        </div>

        <details class="more">
          <summary>Comment c’est calculé</summary>
          <div class="more-body stack-sm">
            <p>Aide de la CAF (réforme de septembre 2025) : coût du mois × (1 − revenus × taux d’effort ÷ {euros(r.cmg.params.coutReference)}). Le coût compte le salaire net, l’entretien et les repas, dans la limite de {euros(r.cmg.params.plafondHoraire)} de l’heure.</p>
            <p>Cotisations : {i.alsaceMoselle ? '23,18' : '21,88'} % du brut pour la part salariale, 43,55 % pour la part patronale, plus 5 € par mois, comme le simulateur officiel de l’Urssaf. La CAF les prend toutes en charge tant que le coût de l’heure reste sous {euros(r.cmg.params.plafondHoraire)} ; au-delà, au prorata.</p>
            <dl class="kv">
              <dt>Revenus retenus (entre {r.cmg.params.plancher} € et {r.cmg.params.plafond} €)</dt><dd>{r.cmg.ressources} €</dd>
              <dt>Taux d’effort ({i.enfantsACharge} enfant{i.enfantsACharge > 1 ? 's' : ''} à charge)</dt><dd>{(r.cmg.taux * 100).toFixed(4).replace('.', ',')} %</dd>
              <dt>Coût de l’heure avant aides</dt><dd>{euros(r.cmg.coutHoraire)}</dd>
              <dt>Ce que la famille paie par heure, après l’aide</dt><dd>{euros(r.resteHoraire)}</dd>
              {r.creditEligible && (<><dt>Dépenses retenues pour l’impôt</dt><dd>{euros(r.depensesAnnuelles)}</dd></>)}
            </dl>
            <p class="hint">Crédit d’impôt : 50 % du salaire net de l’année, plus 2,65 € par jour d’accueil et les cotisations restées à la charge de la famille, moins l’aide de la CAF, dans la limite de 1 750 € par enfant. Règles en vigueur au 1er novembre 2026. Le montant exact de l’aide est calculé chaque mois par la CAF à partir de la déclaration Pajemploi.</p>
          </div>
        </details>
        </div>
      </main>
    </>
  );
}
