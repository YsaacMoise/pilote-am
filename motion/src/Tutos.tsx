import { Sequence, staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { Accroche, AccrocheCfg } from './scenes/Accroche';
import { pad, Rect, Tuto, TutoCfg } from './scenes/Tuto';
import { s } from './theme';
import tuto from '../public/ecrans/tuto.json';

// Trois tutoriels (voix Nika) : une accroche en motion design, le tutoriel sur les vrais écrans, la signature dite.
// Musique « Patterns in the Grain » calée pour que le logo tombe sur un temps fort.
const T = tuto as unknown as Record<string, Rect> & { code: string };

type Piste = { src: string; at: number; trim?: number; fin?: number };
export type Montage = {
  accroche: AccrocheCfg;
  tuto: TutoCfg;
  v0: number; // temps vidéo = temps du fichier de voix principal + v0
  pistes: Piste[];
  parole: [number, number][]; // en temps vidéo
  musique: number; // seconde de la musique jouée à t = 0
  duree: number;
};
const decale = (w: [number, number][], d: number) => w.map(([a, b]) => [a + d, b + d] as [number, number]);
const signature = (v0: number, fin: number): Piste => ({ src: 'voix/signature.wav', at: v0 + fin + 0.2 });

// ---------- Ta fin de mois, prête à déclarer ----------
const SM: [number, number][] = [[8.9, 0], [9.7, 330], [16.4, 330], [17.2, 840], [21.3, 840], [22.1, 1177]];
const SC: [number, number][] = [[29.0, 0], [30.0, 509]];
const MOIS_TUTO: TutoCfg = {
  debut: 1.4,
  plans: [
    { img: 'm-auj', from: -5, to: 2.45 },
    { img: 'm-mois-long', from: 2.45, to: 28.35, scroll: SM, tabbar: 'm-mois' },
    { img: 'm-controle-long', from: 28.35, to: 99, scroll: SC, tabbar: 'm-controle', trans: 'pousse' },
  ],
  marks: [
    { r: pad(T.mTotal, 4), from: 3.7, to: 8.3, label: 'À verser par la famille', below: true, scroll: SM },
    { r: { left: 26, top: 645, w: 338, h: 440 }, from: 9.8, to: 12.9, label: 'Dans l’ordre des cases', scroll: SM },
    { r: pad(T.mDeclHint, 6), from: 13.6, to: 16.5, label: 'Une par enfant · le parent déclare', below: true, scroll: SM },
    { r: pad(T.mEnvoyer), from: 17.4, to: 18.6, label: 'Envoyer au parent', scroll: SM },
    { r: pad(T.mExc, 4), from: 22.5, to: 26.3, label: 'Ce qui a changé ce mois-ci', scroll: SM },
    { r: pad(T.mControle), from: 26.8, to: 28.2, label: 'Contrôler le bulletin', below: true, scroll: SM },
    { r: pad(T.mCtrlRes, 2), from: 30.0, to: 31.8, label: 'Conforme à tes chiffres', scroll: SC },
  ],
  taps: [
    { at: 2.3, x: T.mTabMois.x, y: T.mTabMois.y },
    { at: 18.55, x: T.mEnvoyer.x, y: T.mEnvoyer.y - 840 },
    { at: 28.15, x: T.mControle.x, y: T.mControle.y - 1177 },
  ],
  chaps: [
    { from: 1.1, to: 3.45, n: '01', name: 'Fin du mois', title: 'Ouvre l’onglet Mois.' },
    { from: 3.55, to: 8.6, n: '02', name: 'Le total', title: 'Ce que la famille te doit.' },
    { from: 8.7, to: 16.6, n: '03', name: 'Pajemploi', title: 'Les cases, dans l’ordre.', note: 'Montants à vérifier avant déclaration · Pajemploi fait foi', noteAt: 9.6 },
    { from: 16.7, to: 21.6, n: '04', name: 'Le parent', title: 'Envoyé en un geste.' },
    { from: 21.7, to: 26.5, n: '05', name: 'Corriger', title: 'Un jour à reprendre ?' },
    { from: 26.6, to: 31.9, n: '06', name: 'Le bulletin', title: 'Vérifié pour toi.' },
  ],
  bulles: [
    { from: 18.8, to: 21.5, kind: 'message', titre: 'Message au parent', y: 430, lignes: ['Bonjour, voici les éléments à déclarer sur Pajemploi pour Léo, octobre 2026 :', '• Heures normales : 186 h', '• Jours d’activité : 21', '• Salaire net : 713,81 €', '• Indemnités d’entretien : 82,88 €'] },
  ],
  cam: [
    [1.4, 1, 422], [3.5, 1, 422], [3.95, 1.32, 320], [8.2, 1.32, 320], [8.7, 1, 422],
    [9.5, 1.12, 520], [12.9, 1.12, 520], [13.4, 1.38, 230], [16.3, 1.38, 230], [16.8, 1, 422],
    [17.3, 1.32, 520], [18.6, 1.32, 520], [19.0, 1, 422], [22.2, 1, 422], [22.6, 1.18, 590], [26.3, 1.18, 590],
    [26.7, 1.34, 300], [28.2, 1.34, 300], [28.5, 1, 422], [29.9, 1, 422], [30.3, 1.14, 440],
  ],
  fin: 32.1,
};
const MOIS_V0 = 10.45;
export const MOIS: Montage = {
  accroche: {
    mots: [{ w: 'Heures', t: 0.62, chip: '186 h' }, { w: 'Jours d’activité', t: 1.71, chip: '21' }, { w: 'Entretien', t: 2.7, chip: '82,88 €' }, { w: 'Repas', t: 3.7, chip: '60,00 €' }],
    intro: { t: 5.58, texte: 'À la fin du mois,' },
    punch: { t: 6.45, texte: 'tout doit tomber juste.' },
    chute: 7.87,
    phrases: [{ t: 9.48, texte: 'Ton mois est' }, { t: 10.05, texte: 'déjà prêt.', italique: true }],
    fin: 11.5,
  },
  tuto: MOIS_TUTO,
  v0: MOIS_V0,
  pistes: [{ src: 'voix/accroche-mois.wav', at: 0.3 }, { src: 'voix/mois.wav', at: MOIS_V0 + 1.45, trim: 1.45 }, signature(MOIS_V0, MOIS_TUTO.fin)],
  parole: [[0.52, 10.61], ...decale([[1.57, 2.87], [3.68, 12.91], [13.66, 16.47], [17.42, 21.16], [22.01, 26.22], [26.67, 31.24]], MOIS_V0), [MOIS_V0 + MOIS_TUTO.fin + 0.3, MOIS_V0 + MOIS_TUTO.fin + 3.2]],
  musique: 6.007,
  duree: MOIS_V0 + MOIS_TUTO.fin + 4.4,
};

// ---------- Inviter les parents ----------
const SI: [number, number][] = [[0, 3416]];
const lignesJour = { left: 28, top: T.iPRepas.top - 12, w: 334, h: T.iPReveil.top + T.iPReveil.h + 14 - (T.iPRepas.top - 12) };
const INV_TUTO: TutoCfg = {
  debut: 2.5,
  plans: [
    { img: 'i-p-auj', from: -5, to: 4.85 },
    { img: 'i-plus', from: 4.85, to: 7.0 },
    { img: 'i-contrat-long', from: 7.0, to: 8.75, scroll: [[7.0, 2950], [7.65, 3416]], tabbar: 'i-plus', trans: 'pousse' },
    { img: 'i-contrat-code-long', from: 8.75, to: 17.2, scroll: SI, tabbar: 'i-plus' },
    { img: 'i-p-code', from: 17.2, to: 18.75, trans: 'monte' },
    { img: 'i-p-auj', from: 18.75, to: 22.0 },
    { img: 'i-p-mois', from: 22.0, to: 24.9 },
    { img: 'i-contrat-code-long', from: 24.9, to: 99, scroll: SI, tabbar: 'i-plus', trans: 'retour' },
  ],
  marks: [
    { r: pad(T.iPJour, 4), from: 2.9, to: 4.7, label: 'La journée de Léo, en direct', below: true },
    { r: pad(T.iLeo, 2), from: 5.6, to: 6.95, label: 'La fiche de l’enfant', below: true },
    { r: pad(T.iCreer), from: 7.8, to: 8.65, label: 'Créer le lien', scroll: SI },
    { r: pad(T.iCode, 4), from: 9.1, to: 11.3, label: 'Code à 4 chiffres', below: true, scroll: SI },
    { r: pad(T.iUrl, 4), from: 12.3, to: 14.1, label: 'Le lien, sans le code', scroll: SI },
    { r: pad(T.iEnvoyer), from: 14.2, to: 14.95, label: 'Envoyer le lien', below: true, scroll: SI },
    { r: pad(T.iPCode, 4), from: 17.4, to: 18.6, label: 'Le code, donné de vive voix', below: true },
    { r: { left: 28, top: T.iPArr.top - 12, w: 334, h: 52 }, from: 19.0, to: 20.4, label: 'Les arrivées', below: true },
    { r: lignesJour, from: 20.4, to: 21.75, label: 'Le carnet' },
    { r: { left: T.iPDecl.left, top: T.iPDecl.top, w: T.iPDecl.w, h: 380 }, from: 22.4, to: 24.7, label: 'Leurs cases Pajemploi' },
    { r: pad(T.iCouper), from: 25.4, to: 28.6, label: 'Couper le lien', below: true, scroll: SI },
  ],
  taps: [
    { at: 6.85, x: T.iLeo.x, y: T.iLeo.y },
    { at: 8.55, x: T.iCreer.x, y: T.iCreer.y - 3416 },
    { at: 14.9, x: T.iEnvoyer.x, y: T.iEnvoyer.y - 3416 },
    { at: 21.85, x: T.iPMoisTab.x, y: T.iPMoisTab.y },
  ],
  frappe: { from: 17.75, to: 18.45, texte: T.code, r: T.iPCode },
  chaps: [
    { from: 2.2, to: 4.75, n: '01', name: 'Pour les parents', title: 'Sans mot de passe.' },
    { from: 4.85, to: 11.4, n: '02', name: 'Le lien', title: 'Créer le lien.' },
    { from: 11.5, to: 17.1, n: '03', name: 'Le code', title: 'De vive voix.' },
    { from: 17.2, to: 24.8, n: '04', name: 'Côté parents', title: 'Ils voient tout.' },
    { from: 24.9, to: 28.8, n: '05', name: 'À tout moment', title: 'Tu gardes la main.' },
  ],
  bulles: [
    { from: 15.1, to: 17.25, kind: 'message', titre: 'Message aux parents de Léo', y: 430, lignes: ['Bonjour, voici le lien pour suivre la journée de Léo et retrouver la déclaration Pajemploi du mois :', 'arvela.fr/#/p/…', 'Je vous donne le code à 4 chiffres de vive voix.'] },
    { from: 23.3, to: 24.85, kind: 'pastille', y: 1700, lignes: ['Lecture seule : rien à modifier'] },
  ],
  cam: [
    [2.5, 1, 422], [2.8, 1, 422], [3.2, 1.15, 340], [4.7, 1.15, 340], [5.0, 1, 422], [5.4, 1.32, 250], [6.9, 1.32, 250], [7.15, 1, 422],
    [7.6, 1.26, 600], [8.7, 1.26, 600], [9.0, 1.32, 380], [11.3, 1.32, 380], [12.0, 1.3, 480], [14.1, 1.3, 500], [14.3, 1.3, 560], [15.0, 1, 422],
    [17.3, 1.32, 360], [18.6, 1.32, 360], [18.9, 1, 422], [19.0, 1.26, 300], [20.4, 1.26, 300], [20.6, 1.15, 400], [21.6, 1.15, 400], [21.9, 1, 422],
    [22.3, 1.12, 520], [24.7, 1.12, 520], [25.0, 1, 422], [25.3, 1.3, 620],
  ],
  fin: 29.0,
};
const INV_V0 = 7.4;
export const INVITER: Montage = {
  accroche: {
    bulles: [{ texte: 'Il a bien mangé ?', t: 0.58 }, { texte: 'Il a dormi ?', t: 1.6 }],
    intro: { t: 3.0, texte: 'Les parents se posent la question' },
    punch: { t: 4.2, texte: 'chaque jour.' },
    chute: 5.0,
    phrases: [{ t: 6.37, texte: 'Ils suivent sa journée' }, { t: 7.97, texte: 'en direct.', italique: true }],
    fin: 9.6,
  },
  tuto: INV_TUTO,
  v0: INV_V0,
  pistes: [{ src: 'voix/accroche-inviter.wav', at: 0.3 }, { src: 'voix/inviter.wav', at: INV_V0 + 2.6, trim: 2.6 }, signature(INV_V0, INV_TUTO.fin)],
  parole: [[0.58, 8.5], ...decale([[2.79, 4.66], [5.33, 11.01], [11.68, 16.85], [17.59, 19.16], [20.06, 24.46], [25.22, 28.37]], INV_V0), [INV_V0 + INV_TUTO.fin + 0.3, INV_V0 + INV_TUTO.fin + 3.2]],
  musique: 6.625,
  duree: INV_V0 + INV_TUTO.fin + 4.4,
};

// ---------- Simuler un accueil ----------
const SS: [number, number][] = [[6.1, 0], [8.2, 0], [8.7, 600], [11.3, 600], [11.75, 1750], [12.75, 1750], [13.2, 2700], [14.35, 2700], [14.9, 3500], [16.6, 3500], [17.1, 4250], [18.9, 4250], [19.5, 4800], [22.3, 5450], [22.95, 7697]];
const SIM_TUTO: TutoCfg = {
  debut: 4.5,
  plans: [
    { img: 's-plus-long', from: -5, to: 6.1, scroll: [[0, 420]], tabbar: 's-plus' },
    { img: 's-sim-long', from: 6.1, to: 99, scroll: SS, tabbar: 's-plus', trans: 'pousse' },
  ],
  marks: [
    { r: pad(T.sItem, 2), from: 4.8, to: 6.0, label: 'Simuler un accueil', scroll: [[0, 420]] },
    { r: { left: 27, top: 403, w: 282, h: 60 }, from: 7.2, to: 8.3, label: 'Les horaires', below: true, scroll: SS },
    { r: pad(T.sSalaire), from: 8.8, to: 9.65, label: 'Ton tarif brut', below: true, scroll: SS },
    { r: pad(T.sEntretien), from: 9.7, to: 10.4, label: 'L’entretien', below: true, scroll: SS },
    { r: { left: 27, top: T.sRepas.top - 6, w: 336, h: T.sRepas.h + 12 }, from: 10.45, to: 11.3, label: 'Les repas', scroll: SS },
    { r: { left: 33, top: T.sFoyer.top - 5, w: 324, h: T.sFoyer.h + 10 }, from: 11.9, to: 12.8, label: 'Sa situation', below: true, scroll: SS },
    { r: pad(T.sRfr), from: 13.3, to: 14.35, label: 'Son revenu', below: true, scroll: SS },
    { r: pad(T.sResult, 4), from: 15.0, to: 16.6, label: 'Coût réel par mois', below: true, scroll: SS },
    { r: { left: 26, top: T.sCaf.top - 10, w: 338, h: 74 }, from: 17.2, to: 18.0, label: 'Aide de la CAF', below: true, scroll: SS },
    { r: { left: 26, top: T.sCredit.top - 10, w: 338, h: 112 }, from: 18.0, to: 18.85, label: 'Crédit d’impôt', below: true, scroll: SS },
    { r: { left: 26, top: T.sJuil.top - 12, w: 338, h: 76 }, from: 20.9, to: 22.35, label: 'Quand les aides arrivent', scroll: SS },
    { r: pad(T.sEnvoyer), from: 23.2, to: 24.35, label: 'Envoyer à la famille', scroll: SS },
  ],
  taps: [
    { at: 5.95, x: T.sItem.x, y: T.sItem.y - 420 },
    { at: 24.25, x: T.sEnvoyer.x, y: T.sEnvoyer.y - 7697 },
  ],
  chaps: [
    { from: 4.3, to: 6.9, n: '01', name: 'Simuler', title: 'Ouvre le simulateur.' },
    { from: 7.0, to: 11.5, n: '02', name: 'L’accueil', title: 'Tes horaires, ton tarif.' },
    { from: 11.6, to: 14.45, n: '03', name: 'La famille', title: 'Sa situation.' },
    { from: 14.55, to: 22.45, n: '04', name: 'Le coût réel', title: 'Aides comprises.', note: 'Estimation aux barèmes actuels', noteAt: 15.4 },
    { from: 22.55, to: 29.0, n: '05', name: 'Envoyer', title: 'Envoyer à la famille.' },
  ],
  bulles: [
    { from: 24.5, to: 27.35, kind: 'message', titre: 'Message à la famille', y: 430, lignes: ['Simulation d’accueil Arvela : 45 h par semaine sur 5 jours, 4,60 € brut de l’heure.', 'À verser chaque mois : 852,49 €.', 'Pour voir l’aide de la CAF et le coût réel avec vos revenus : arvela.fr/#/simulateur…'] },
    { from: 27.4, to: 29.0, kind: 'pastille', y: 1700, lignes: ['Ses revenus ne te sont jamais envoyés'] },
  ],
  cam: [
    [4.5, 1, 422], [4.7, 1.3, 415], [6.0, 1.3, 415], [6.3, 1, 422], [7.0, 1.3, 430], [8.3, 1.3, 430], [8.7, 1.3, 300], [9.6, 1.3, 300],
    [9.9, 1.3, 590], [10.4, 1.3, 620], [11.3, 1.25, 620], [11.8, 1.3, 360], [12.8, 1.3, 360], [13.2, 1.3, 360], [14.35, 1.3, 360],
    [14.8, 1.2, 340], [16.6, 1.2, 340], [17.1, 1.22, 360], [18.9, 1.22, 360], [19.3, 1, 422], [20.9, 1.12, 420], [22.4, 1.12, 420],
    [23.0, 1.3, 560], [24.4, 1.3, 560], [24.6, 1, 422],
  ],
  fin: 29.3,
};
const SIM_V0 = 11.8;
export const SIMULATEUR: Montage = {
  accroche: {
    appel: { from: 0.2, to: 4.4, question: { t: 3.0, lignes: ['Combien va lui coûter', 'l’accueil ?'] } },
    mots: [{ w: 'Salaire', t: 4.86, chip: '852,49 €' }, { w: 'Entretien', t: 6.01, chip: '76,22 €' }, { w: 'Aide de la CAF', t: 7.15, chip: '−512,12 €' }, { w: 'Crédit d’impôt', t: 8.29, chip: '−119,21 €' }],
    intro: { t: 9.77, texte: 'Le vrai prix est' },
    punch: { t: 10.7, texte: 'difficile à calculer.' },
    chute: 12.08,
    phrases: [{ t: 13.52, texte: 'Tu le lui montres' }, { t: 14.4, texte: 'en une minute.', italique: true }],
    fin: 16.0,
  },
  tuto: SIM_TUTO,
  v0: SIM_V0,
  pistes: [{ src: 'voix/simulateur.wav', at: 0, fin: 4.2 }, { src: 'voix/accroche-simulateur.wav', at: 4.6 }, { src: 'voix/simulateur.wav', at: SIM_V0 + 4.6, trim: 4.6 }, signature(SIM_V0, SIM_TUTO.fin)],
  parole: [[0.3, 3.89], [4.86, 14.88], ...decale([[4.77, 6.45], [7.15, 13.90], [14.94, 18.71], [19.50, 23.30], [24.13, 28.49]], SIM_V0), [SIM_V0 + SIM_TUTO.fin + 0.3, SIM_V0 + SIM_TUTO.fin + 3.2]],
  musique: 6.348,
  duree: SIM_V0 + SIM_TUTO.fin + 4.4,
};

// ---------- Mixage ----------
const smooth = (x: number) => x * x * (3 - 2 * x);
function volume(t: number, m: Montage) {
  let v = 0;
  for (const [a, b] of m.parole) {
    const r = 0.3;
    const k = t < a ? 1 - (a - t) / r : t > b ? 1 - (t - b) / r : 1;
    v = Math.max(v, smooth(Math.max(0, Math.min(1, k))));
  }
  const base = 0.36 - 0.18 * v; // −6 dB sous la voix : la musique reste présente
  return base * Math.min(1, t / 0.6) * Math.max(0, Math.min(1, (m.duree - t) / 2.0));
}

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume: vol = 1 }) => (
  <Sequence from={s(at)} durationInFrames={s(2.4)} layout="none">
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol} />
  </Sequence>
);

export const TutoVideo: React.FC<{ m: Montage }> = ({ m }) => {
  const { fps } = useVideoConfig();
  const { tuto, accroche: a, v0 } = m;
  const changements = tuto.plans.slice(1).map((p) => p.from + v0).filter((x) => x > 0);
  const impact = a.chute + 0.38;
  return (
    <Frame>
      <Accroche cfg={a} />
      <Tuto cfg={tuto} v0={v0} />
      {m.pistes.map((p, i) => (
        <Sequence key={i} from={s(p.at)} durationInFrames={p.fin ? s(p.fin) : undefined} layout="none">
          <Audio src={staticFile(p.src)} trimBefore={p.trim ? s(p.trim) : undefined} />
        </Sequence>
      ))}
      <Audio src={staticFile('musique/patterns-in-the-grain.mp3')} trimBefore={s(m.musique)} volume={(f: number) => volume(f / fps, m)} />
      {(a.mots ?? []).map((x) => <Sfx key={'w' + x.t} at={x.t + 0.2} name="pop" volume={0.45} />)}
      {(a.bulles ?? []).map((x) => <Sfx key={'b' + x.t} at={x.t} name="pop" volume={0.55} />)}
      {a.appel && <Sfx at={a.appel.from + 0.1} name="chime" volume={0.4} />}
      {a.punch && <Sfx at={a.punch.t + 0.3} name="swipe" volume={0.4} />}
      <Sfx at={a.chute} name="whoosh" volume={0.7} />
      <Sfx at={impact + 0.5} name="chime" volume={0.5} />
      <Sfx at={v0 + tuto.debut - 1.0} name="whoosh" volume={0.45} />
      {tuto.taps.map((p) => <Sfx key={'t' + p.at} at={v0 + p.at} name="tap" volume={0.7} />)}
      {tuto.marks.map((x) => <Sfx key={'m' + x.from} at={v0 + x.from} name="pop" volume={0.3} />)}
      {changements.map((x) => <Sfx key={'s' + x} at={x - 0.08} name="swipe" volume={0.45} />)}
      {(tuto.bulles ?? []).filter((b) => b.kind === 'message').map((b) => <Sfx key={'e' + b.from} at={v0 + b.from} name="envoye" volume={0.5} />)}
      <Sfx at={v0 + tuto.fin + 0.3} name="chime" volume={0.45} />
    </Frame>
  );
};
export const duree = (m: Montage) => m.duree;
