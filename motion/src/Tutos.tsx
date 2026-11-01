import { Sequence, staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { pad, Rect, Tuto, TutoCfg } from './scenes/Tuto';
import { s } from './theme';
import tuto from '../public/ecrans/tuto.json';

// Trois tutoriels courts, calés sur les voix Nika (Gemini) « mois », « inviter », « simulateur ».
const T = tuto as unknown as Record<string, Rect> & { code: string };
export const V0 = 1.0; // la voix commence 1 s après le début de la vidéo

// ---------- Ta fin de mois, prête à déclarer ----------
const SM: [number, number][] = [[8.9, 0], [9.7, 330], [16.4, 330], [17.2, 840], [21.3, 840], [22.1, 1177]];
const SC: [number, number][] = [[29.0, 0], [30.0, 509]];
export const MOIS: TutoCfg = {
  plans: [
    { img: 'm-auj', from: -5, to: 2.45 },
    { img: 'm-mois-long', from: 2.45, to: 28.35, scroll: SM, tabbar: 'm-mois' },
    { img: 'm-controle-long', from: 28.35, to: 99, scroll: SC, tabbar: 'm-controle' },
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
    { from: -0.9, to: 3.45, n: '01', name: 'Fin du mois', title: 'Ouvre l’onglet Mois.' },
    { from: 3.55, to: 8.6, n: '02', name: 'Le total', title: 'Ce que la famille te doit.' },
    { from: 8.7, to: 16.6, n: '03', name: 'Pajemploi', title: 'Les cases, dans l’ordre.', note: 'Montants à vérifier avant déclaration · Pajemploi fait foi', noteAt: 9.6 },
    { from: 16.7, to: 21.6, n: '04', name: 'Le parent', title: 'Envoyé en un geste.' },
    { from: 21.7, to: 26.5, n: '05', name: 'Corriger', title: 'Un jour à reprendre ?' },
    { from: 26.6, to: 31.9, n: '06', name: 'Le bulletin', title: 'Vérifié pour toi.' },
  ],
  bulles: [
    { from: 18.8, to: 21.5, kind: 'message', titre: 'Message au parent', y: 430, lignes: ['Bonjour, voici les éléments à déclarer sur Pajemploi pour Léo, octobre 2026 :', '• Heures normales : 186 h', '• Jours d’activité : 21', '• Salaire net : 713,81 €', '• Indemnités d’entretien : 82,88 €'] },
  ],
  zoom: [[0, 1], [3.4, 1], [4.0, 1.18], [8.2, 1.18], [8.8, 1], [17.1, 1], [17.6, 1.14], [18.7, 1.14], [19.0, 1], [22.2, 1], [22.7, 1.1], [26.3, 1.1], [26.6, 1.12], [28.2, 1.12], [28.5, 1], [29.8, 1], [30.2, 1.08]],
  focus: [[0, 422], [3.4, 422], [4.0, 330], [8.2, 330], [8.8, 422], [17.1, 422], [17.6, 500], [18.7, 500], [19.0, 422], [22.2, 422], [22.7, 560], [26.3, 560], [26.6, 330], [28.2, 330], [28.5, 422], [29.8, 422], [30.2, 440]],
  fin: 32.1,
};

// ---------- Inviter les parents ----------
const SI: [number, number][] = [[0, 3416]];
const lignesJour = { left: 28, top: T.iPRepas.top - 12, w: 334, h: T.iPReveil.top + T.iPReveil.h + 14 - (T.iPRepas.top - 12) };
export const INVITER: TutoCfg = {
  plans: [
    { img: 'i-p-auj', from: -5, to: 4.85 },
    { img: 'i-plus', from: 4.85, to: 7.0 },
    { img: 'i-contrat-long', from: 7.0, to: 8.75, scroll: [[7.0, 2950], [7.65, 3416]], tabbar: 'i-plus' },
    { img: 'i-contrat-code-long', from: 8.75, to: 17.2, scroll: SI, tabbar: 'i-plus' },
    { img: 'i-p-code', from: 17.2, to: 18.75 },
    { img: 'i-p-auj', from: 18.75, to: 22.0 },
    { img: 'i-p-mois', from: 22.0, to: 24.9 },
    { img: 'i-contrat-code-long', from: 24.9, to: 99, scroll: SI, tabbar: 'i-plus' },
  ],
  marks: [
    { r: pad(T.iPJour, 4), from: 0.6, to: 2.4, label: 'La journée de Léo', below: true },
    { r: pad(T.iLeo, 2), from: 5.6, to: 6.95, label: 'La fiche de l’enfant', below: true },
    { r: pad(T.iCreer), from: 7.8, to: 8.65, label: 'Créer le lien', scroll: SI },
    { r: pad(T.iCode, 4), from: 9.1, to: 11.3, label: 'Code à 4 chiffres', below: true, scroll: SI },
    { r: pad(T.iUrl, 4), from: 12.3, to: 14.1, label: 'Le lien, sans le code', scroll: SI },
    { r: pad(T.iEnvoyer), from: 14.2, to: 14.95, label: 'Envoyer le lien', below: true, scroll: SI },
    { r: pad(T.iPCode, 4), from: 17.3, to: 18.6, label: 'Le code, donné de vive voix', below: true },
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
    { from: -0.9, to: 4.75, n: '01', name: 'Les parents', title: 'La journée, en direct.', note: 'Sans compte · sans mot de passe', noteAt: 2.8 },
    { from: 4.85, to: 11.4, n: '02', name: 'Le lien', title: 'Créer le lien.' },
    { from: 11.5, to: 17.1, n: '03', name: 'Le code', title: 'De vive voix.' },
    { from: 17.2, to: 24.8, n: '04', name: 'Côté parents', title: 'Ils voient tout.' },
    { from: 24.9, to: 28.8, n: '05', name: 'À tout moment', title: 'Tu gardes la main.' },
  ],
  bulles: [
    { from: 15.1, to: 17.25, kind: 'message', titre: 'Message aux parents de Léo', y: 430, lignes: ['Bonjour, voici le lien pour suivre la journée de Léo et retrouver la déclaration Pajemploi du mois :', 'arvela.fr/#/p/…', 'Je vous donne le code à 4 chiffres de vive voix.'] },
    { from: 23.3, to: 24.85, kind: 'pastille', y: 1700, lignes: ['Lecture seule : rien à modifier'] },
  ],
  zoom: [[0, 1], [8.9, 1], [9.3, 1.2], [11.2, 1.2], [11.6, 1], [12.2, 1], [12.6, 1.14], [14.3, 1.14], [14.7, 1], [17.3, 1], [17.6, 1.12], [18.6, 1.12], [18.9, 1], [25.2, 1], [25.6, 1.12]],
  focus: [[0, 422], [8.9, 422], [9.3, 360], [11.2, 360], [11.6, 422], [12.2, 422], [12.6, 500], [14.3, 500], [14.7, 422], [17.3, 422], [17.6, 330], [18.6, 330], [18.9, 422], [25.2, 422], [25.6, 560]],
  fin: 29.0,
};

// ---------- Simuler un accueil ----------
const SS: [number, number][] = [[6.1, 0], [8.2, 0], [8.7, 600], [11.3, 600], [11.75, 1750], [12.75, 1750], [13.2, 2700], [14.35, 2700], [14.9, 3500], [16.6, 3500], [17.1, 4250], [18.9, 4250], [19.5, 4800], [22.3, 5450], [22.95, 7697]];
export const SIMULATEUR: TutoCfg = {
  plans: [
    { img: 's-plus-long', from: -5, to: 6.1, scroll: [[0, 420]], tabbar: 's-plus' },
    { img: 's-sim-long', from: 6.1, to: 99, scroll: SS, tabbar: 's-plus' },
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
    { from: -0.9, to: 4.6, n: '01', name: 'Une famille appelle', title: 'Combien ça lui coûte ?' },
    { from: 4.7, to: 11.5, n: '02', name: 'L’accueil', title: 'Tes horaires, ton tarif.' },
    { from: 11.6, to: 14.45, n: '03', name: 'La famille', title: 'Sa situation.' },
    { from: 14.55, to: 22.45, n: '04', name: 'Le coût réel', title: 'Aides comprises.', note: 'Estimation aux barèmes actuels', noteAt: 15.4 },
    { from: 22.55, to: 29.0, n: '05', name: 'Envoyer', title: 'Envoyer à la famille.' },
  ],
  bulles: [
    { from: 0.25, to: 3.95, kind: 'appel', titre: 'Appel entrant', y: 470, lignes: ['Une famille cherche une place', 'Pour son bébé, à partir de janvier'] },
    { from: 24.5, to: 27.35, kind: 'message', titre: 'Message à la famille', y: 430, lignes: ['Simulation d’accueil Arvela : 45 h par semaine sur 5 jours, 4,60 € brut de l’heure.', 'À verser chaque mois : 852,49 €.', 'Pour voir l’aide de la CAF et le coût réel avec vos revenus : arvela.fr/#/simulateur…'] },
    { from: 27.4, to: 29.0, kind: 'pastille', y: 1700, lignes: ['Ses revenus ne te sont jamais envoyés'] },
  ],
  zoom: [[0, 1], [7.0, 1], [7.4, 1.1], [14.4, 1.1], [14.8, 1], [24.3, 1]],
  focus: [[0, 422], [7.0, 422], [7.4, 440], [14.4, 440], [14.8, 422]],
  fin: 29.3,
};

// Moments où la voix parle (secondes du fichier) : la musique baisse dessous
export const PAROLE: Record<string, [number, number][]> = {
  mois: [[0.23, 2.87], [3.68, 12.91], [13.66, 16.47], [17.42, 21.16], [22.01, 26.22], [26.67, 31.24]],
  inviter: [[0.23, 4.66], [5.33, 11.01], [11.68, 16.85], [17.59, 19.16], [20.06, 24.46], [25.22, 28.37]],
  simulateur: [[0.30, 3.89], [4.77, 6.45], [7.15, 13.90], [14.94, 18.71], [19.50, 23.30], [24.13, 28.49]],
};
const smooth = (x: number) => x * x * (3 - 2 * x);
function volume(t: number, fin: number, parole: [number, number][]) {
  let v = 0;
  for (const [a0, b0] of parole) {
    const a = a0 + V0, b = b0 + V0, r = 0.35;
    const k = t < a ? 1 - (a - t) / r : t > b ? 1 - (t - b) / r : 1;
    v = Math.max(v, smooth(Math.max(0, Math.min(1, k))));
  }
  const base = 0.30 - 0.17 * v;
  return base * Math.min(1, t / 1.2) * Math.max(0, Math.min(1, (fin - t) / 2.2));
}

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume: vol = 1 }) => (
  <Sequence from={s(at)} durationInFrames={s(2.4)} layout="none">
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol} />
  </Sequence>
);

export const duree = (cfg: TutoCfg) => V0 + cfg.fin + 4.0;

export const TutoVideo: React.FC<{ cfg: TutoCfg; voix: 'mois' | 'inviter' | 'simulateur'; musique?: string }> = ({ cfg, voix, musique = 'measured-grace' }) => {
  const { fps } = useVideoConfig();
  const fin = duree(cfg);
  const changements = cfg.plans.slice(1).map((p) => p.from).filter((x) => x > 0);
  return (
    <Frame>
      <Tuto cfg={cfg} v0={V0} />
      <Sequence from={s(V0)} layout="none"><Audio src={staticFile(`voix/${voix}.wav`)} /></Sequence>
      <Audio src={staticFile(`musique/${musique}.mp3`)} trimBefore={s(7.8)} volume={(f: number) => volume(f / fps, fin, PAROLE[voix])} />
      {cfg.taps.map((p) => <Sfx key={'t' + p.at} at={V0 + p.at} name="tap" volume={0.7} />)}
      {cfg.marks.map((m) => <Sfx key={'m' + m.from} at={V0 + m.from} name="pop" volume={0.32} />)}
      {changements.map((a) => <Sfx key={'s' + a} at={V0 + a - 0.1} name="swipe" volume={0.45} />)}
      {(cfg.bulles ?? []).filter((b) => b.kind === 'message').map((b) => <Sfx key={'e' + b.from} at={V0 + b.from} name="envoye" volume={0.5} />)}
      {(cfg.bulles ?? []).filter((b) => b.kind === 'appel').map((b) => <Sfx key={'a' + b.from} at={V0 + b.from} name="chime" volume={0.45} />)}
      <Sfx at={V0 + cfg.fin + 0.45} name="chime" volume={0.5} />
    </Frame>
  );
};
