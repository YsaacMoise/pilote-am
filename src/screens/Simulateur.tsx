// Simulateur d'accueil : ce que coûte une assistante maternelle à une famille, avant et après les aides.
// Ouvert à tous (sans compte, depuis l'accueil du site) et dans l'app (Plus › Simuler un accueil).
// Rien n'est envoyé : le calcul se fait sur le téléphone. Le lien partagé ne contient jamais les revenus de la famille.
import { useEffect, useRef, useState } from 'preact/hooks';
import { logUsage } from '../store';
import { today } from '../engine/dates';
import { euros, hoursLabel } from '../engine/money';
import { simuler, simulationParDefaut, type AgeEnfant, type SimInput } from '../engine/simulation';
import { Banner, Choices, EuroInput, NumberInput, Seg, Stepper, Switch, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { shareText } from '../share';

/** Brouillon de contrat laissé par le simulateur, repris par l'écran « Nouveau contrat » (lu une seule fois). */
export const BROUILLON_CONTRAT = 'pam-contrat-brouillon';

// Paramètres partageables : l'accueil et le tarif, jamais la situation de la famille.
const PARTAGE: (keyof SimInput)[] = ['jours', 'heures', 'yearType', 'semainesAbsence', 'majoration', 'tauxNet', 'entretienJour', 'repasPrix', 'repasParJour'];

/** Valeurs admises dans un lien partagé (un lien modifié ne doit pas casser le calcul). */
const BORNES: Partial<Record<keyof SimInput, [number, number]>> = {
  jours: [1, 6], heures: [1, 78], semainesAbsence: [1, 30], majoration: [10, 100],
  tauxNet: [0, 5000], entretienJour: [0, 5000], repasPrix: [0, 5000], repasParJour: [0, 4],
};

function depuisAdresse(base: SimInput): SimInput {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const out: SimInput = { ...base };
  for (const k of PARTAGE) {
    const v = q.get(k);
    if (v === null) continue;
    if (k === 'yearType') { if (v === 'complete' || v === 'incomplete') out.yearType = v; continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const [min, max] = BORNES[k] ?? [0, 100000];
    (out as any)[k] = Math.min(max, Math.max(min, k === 'jours' || k === 'semainesAbsence' || k === 'repasParJour' ? Math.round(n) : n));
  }
  return out;
}

function lienPartage(i: SimInput): string {
  const q = new URLSearchParams();
  for (const k of PARTAGE) q.set(k, String(i[k]));
  return `${location.origin}${location.pathname}#/simulateur?${q.toString()}`;
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
  const repasFournis = i.repasPrix > 0;
  const partager = async () => {
    logUsage('simulateur_partage', 'simulateur');
    const texte = `Simulation d'accueil Arvela : ${i.heures} h par semaine sur ${i.jours} jours, ${r.semaines} semaines par an, ${euros(i.tauxNet)} net de l'heure.\n`
      + `À verser chaque mois : ${euros(r.total)} (salaire ${euros(r.salaire)}, entretien ${euros(r.entretien)}${r.repas ? `, repas ${euros(r.repas)}` : ''}).\n`
      + `Pour voir l'aide de la CAF et le coût réel avec tes revenus : ${lienPartage(i)}`;
    await shareText(texte);
  };
  const creerContrat = () => {
    try {
      sessionStorage.setItem(BROUILLON_CONTRAT, JSON.stringify({
        jours: i.jours, heures: i.heures, yearType: i.yearType, weeks: r.semaines, majoration: i.majoration,
        rateNet: i.tauxNet, entretienJour: i.entretienJour, repasPrix: i.repasPrix, repasParJour: repasFournis ? i.repasParJour : 0,
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
            <Stepper label="Jours par semaine" value={i.jours} min={1} max={6} onChange={(v) => set({ jours: v })} />
            <NumberInput label="Heures par semaine" value={i.heures} min={1} max={i.jours * 13} step={0.5} onChange={(v) => set({ heures: v ?? 0 })} />
            {r.heuresPlafonnees && <Banner tone="warn">Au plus 13 h par jour (11 h de repos obligatoire) : le calcul retient {i.jours * 13} h par semaine.</Banner>}
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
            <EuroInput label="Salaire horaire net" hint={`Soit environ ${euros(r.tauxBrut)} brut. Minimum : ${euros(r.minimumNet)} net (${euros(r.minimumBrut)} brut).`} cents={i.tauxNet} onChange={(v) => set({ tauxNet: v ?? 0 })} />
            {r.sousMinimum && <Banner tone="warn">Ce taux est sous le minimum de la convention collective : {euros(r.minimumNet)} net de l’heure depuis le 1er juin 2026.</Banner>}
            <EuroInput label="Indemnité d’entretien par jour" hint={`Minimum pour cette journée : ${euros(r.entretienMinimum)}. ${i.entretienJour < r.entretienMinimum ? 'Le minimum est utilisé.' : ''}`} cents={i.entretienJour || undefined} allowEmpty onChange={(v) => set({ entretienJour: v ?? 0 })} />
            <Switch label="Les repas sont fournis par l’assistante maternelle" checked={repasFournis} onChange={(on) => set({ repasPrix: on ? 350 : 0 })} />
            {repasFournis && (
              <div class="grid2">
                <EuroInput label="Prix d’un repas" cents={i.repasPrix} onChange={(v) => set({ repasPrix: v ?? 0 })} />
                <Stepper label="Repas par jour" value={i.repasParJour} min={1} max={4} onChange={(v) => set({ repasParJour: v })} />
              </div>
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
            <EuroInput label="Revenus mensuels du foyer, pour la CAF" hint="Le revenu imposable de 2024 du foyer (avis d’impôt 2025), divisé par 12. Ce n’est pas le salaire reçu chaque mois." cents={i.ressourcesMois * 100} onChange={(v) => set({ ressourcesMois: Math.round((v ?? 0) / 100) })} />
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
            <div class="decl-line"><span class="decl-label"><span>Indemnités d’entretien</span><span class="decl-hint">{euros(r.entretienJourRetenu)} × {r.joursAn} jours d’accueil par an ÷ 12</span></span><span class="decl-value">{euros(r.entretien)}</span></div>
            {r.repas > 0 && <div class="decl-line"><span class="decl-label"><span>Repas</span><span class="decl-hint">{euros(i.repasPrix)} × {i.repasParJour} par jour d’accueil</span></span><span class="decl-value">{euros(r.repas)}</span></div>}
            <div class="decl-line"><span class="decl-label"><span><b>À verser à l’assistante maternelle</b></span><span class="decl-hint">{r.cmgEligible ? 'en moyenne par mois ; cotisations prises en charge par la CAF' : 'en moyenne par mois, sans les cotisations (voir plus bas)'}</span></span><span class="decl-value">{euros(r.total)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Aide de la CAF (CMG)</span><span class="decl-hint">{r.cmgEligible ? 'versée chaque mois après la déclaration' : 'pas d’aide pour cet âge, sauf parent seul'}</span></span><span class="decl-value">− {euros(r.cmg.montant)}</span></div>
            <div class="decl-line"><span class="decl-label"><span><b>Reste à payer</b></span><span class="decl-hint">en moyenne par mois, soit {euros(r.resteHoraire)} de l’heure</span></span><span class="decl-value">{euros(r.reste)}</span></div>
            <div class="decl-line"><span class="decl-label"><span>Crédit d’impôt</span><span class="decl-hint">{r.creditEligible ? `${euros(r.creditAnnuel)} par an, versé l’année suivante : la première année, tout arrive l’été suivant ; ensuite, avance de 60 % en janvier` : 'enfant de 6 ans ou plus au 1er janvier : pas de crédit'}</span></span><span class="decl-value">− {euros(Math.round(r.creditAnnuel / 12))}</span></div>
          </div>
          {!r.cmgEligible && <Banner tone="warn">Sans aide de la CAF, les cotisations sociales de l’employeur restent à la charge de la famille. Elles ne sont pas comptées ici : la déclaration Pajemploi les calcule.</Banner>}
          {r.congesAnnuels > 0 && <Banner tone="info" icon="sun">Moins de 52 semaines : les congés payés sont versés en juin, au congé principal ou au fil des congés. Le mois où ils sont payés, l’aide de la CAF peut être plafonnée.</Banner>}
          {r.cmg.depassePlafond && <Banner tone="warn">Le coût de l’heure dépasse {euros(r.cmg.params.plafondHoraire)} : l’aide de la CAF est calculée sur ce plafond, et une partie des cotisations peut rester à la charge de la famille (non comptée ici).</Banner>}
        </section>

        <div class="btn-row">
          <button class="btn btn-primary btn-lg" onClick={() => void partager()}><Icon name="share" />Envoyer à la famille</button>
          <button class="btn btn-outline btn-lg" onClick={creerContrat}><Icon name="plus" />{connecte ? 'Créer le contrat' : 'Créer mon compte'}</button>
        </div>

        <details class="more">
          <summary>Comment c’est calculé</summary>
          <div class="more-body stack-sm">
            <p>Aide de la CAF (réforme de septembre 2025) : coût du mois × (1 − revenus × taux d’effort ÷ {euros(r.cmg.params.coutReference)}). Le coût compte le salaire, l’entretien et les repas, dans la limite de {euros(r.cmg.params.plafondHoraire)} de l’heure.</p>
            <dl class="kv">
              <dt>Revenus retenus (entre {r.cmg.params.plancher} € et {r.cmg.params.plafond} €)</dt><dd>{r.cmg.ressources} €</dd>
              <dt>Taux d’effort ({i.enfantsACharge} enfant{i.enfantsACharge > 1 ? 's' : ''} à charge)</dt><dd>{(r.cmg.taux * 100).toFixed(4).replace('.', ',')} %</dd>
              <dt>Coût de l’heure avant aides</dt><dd>{euros(r.cmg.coutHoraire)}</dd>
              <dt>Ce que la famille paie par heure, après l’aide</dt><dd>{euros(r.resteHoraire)}</dd>
              {r.creditEligible && (<><dt>Dépenses retenues pour l’impôt</dt><dd>{euros(r.depensesAnnuelles)}</dd></>)}
            </dl>
            <p class="hint">Crédit d’impôt : 50 % du salaire net de l’année, plus 2,65 € par jour d’accueil, moins l’aide de la CAF, dans la limite de 1 750 € par enfant. Règles en vigueur au 1er novembre 2026. Le montant exact de l’aide est calculé chaque mois par la CAF à partir de la déclaration Pajemploi.</p>
          </div>
        </details>
        </div>
      </main>
    </>
  );
}
