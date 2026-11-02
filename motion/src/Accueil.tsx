import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Frame } from './components/Frame';
import { Band, Bloc, Bulle, Caption, cl, ease, fade, Halo, inOut, kf, mix, Musique, PhoneBox, Piste, Push, Rect, rgba, Sfx, Sheet, Shot, Signature, SW, Swap, Tap, Voix } from './components/ecran';
import { C, F } from './theme';
import V1 from '../public/voix/accueil-journee.reperes.json';
import V2 from '../public/voix/accueil-soir.reperes.json';
import V3 from '../public/voix/signature.reperes.json';
import JJ from '../public/ecrans/journee/journee.json';
import DD from '../public/ecrans/demo/demo.json';

// « Une journée avec Arvela » — pour l'assistante maternelle qui découvre l'app (écran d'accueil, d'abord en boucle sans le son).
// Idée : une journée qui avance. Le ciel passe de l'aube au soir, la grande heure défile, un geste par moment.
// Quand la voix dit « ses parents le voient », le téléphone se retourne : on voit le même moment côté parents.
// Le soir, le résumé part ; puis le mois apparaît, déjà calculé, case par case.

const J = JJ as unknown as Record<string, Rect> & { texteResume: string };
const D = DD as unknown as Record<string, Rect> & { mLignes: (Rect & { texte: string })[] };
const M1 = V1.mots as Record<string, number>;
const M2 = V2.mots as Record<string, number>;
const M3 = V3.mots as Record<string, number>;

const A1 = 0.25; // la voix commence
const c1 = (k: string) => M1[k] + A1;
const T_SOIR = c1('finDirect') + 0.8;
const c2 = (k: string) => M2[k] + T_SOIR;
const T_SIG = c2('fin') + 0.7;
const A3 = T_SIG + 0.4;
export const DUREE_ACCUEIL = A3 + M3.fin + 1.3;
const PISTES: Piste[] = [
  { fichier: V1.fichier, at: A1, de: 0, jusqua: M1.finDirect + 0.3 },
  { fichier: V2.fichier, at: T_SOIR, de: 0 },
  { fichier: V3.fichier, at: A3, de: 0 },
];

// Ciel : 0 aube, 1 midi, 2 après-midi, 3 soir — teintes tirées de la charte de l'app
function ciel(m: number) {
  const haut = [mix(C.bg, C.accentSoft, 0.75), mix(C.bg, C.accentSoft, 0.3), mix(C.bg, C.accentSoft, 0.85), mix(C.accentSoft, C.accent, 0.45)];
  const bas = [mix(C.bg, C.accentSoft, 0.2), C.bg, mix(C.bg, C.accentSoft, 0.35), mix(C.bg, C.accentSoft, 0.7)];
  const i = Math.min(2, Math.floor(m)), k = m - i;
  return [mix(haut[i], haut[i + 1], k), mix(bas[i], bas[i + 1], k)];
}

const Heure: React.FC<{ t: number; etapes: { at: number; h: string }[] }> = ({ t, etapes }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 96, height: 160, overflow: 'hidden', textAlign: 'center' }}>
    {etapes.map((e, i) => {
      const next = etapes[i + 1];
      const a = fade(t, e.at, e.at + 0.55);
      const o = next ? fade(t, next.at, next.at + 0.45, inOut) : 0;
      if (a <= 0 || o >= 1) return null;
      return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 0, fontFamily: F.display, fontWeight: 600, fontSize: 128, lineHeight: 1.1, color: C.accentInk, translate: `0 ${(1 - a) * 100 - o * 100}%`, fontVariantNumeric: 'tabular-nums' }}>{e.h}</div>;
    })}
  </div>
);

export const Accueil: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fin = DUREE_ACCUEIL;

  // Gestes, calés sur les mots
  const arrive = c1('arrive'), g = c1('geste'), note = c1('note'), mange = c1('mange'), endort = c1('endort'), doux = c1('doux'), parents = c1('parents'), direct = c1('direct');
  const tapArr = arrive + 0.05;
  const pushCarnet = g - 0.62;
  const tapRepas = g + 0.02, tapBien = note - 0.32, rowAM1 = note - 0.12;
  const tapSommeil = endort - 0.5, tapEndort = endort + 0.12, rowAM2 = endort + 0.3;
  const flip1 = parents - 0.45; // l'assistante maternelle → les parents
  const flip2 = T_SOIR - 0.35; // retour, le soir
  const soir = c2('soir'), recopier = c2('recopier'), mois = c2('mois'), calcule = c2('calcule'), declarer = c2('declarer');
  const tapResume = soir + 0.5;
  const pushMois = mois - 0.4;

  // Le téléphone
  const S = 1.56, top = 505;
  const phoneIn = interpolate(t, [0, 0.8], [1, 0], { ...cl, easing: ease });
  const drift = interpolate(t, [0, fin], [1, 1.04]);
  // Retournement : angle 0 → 180 (parents) → 360 (retour à l'assistante maternelle)
  const angle = 180 * fade(t, flip1, flip1 + 0.7, inOut) + 180 * fade(t, flip2, flip2 + 0.7, inOut);
  const coteParents = angle > 90 && angle < 270;

  const m = kf(t, [[0, 0], [g - 0.3, 1], [endort - 0.4, 1.35], [parents, 2], [T_SOIR - 0.3, 2.1], [T_SOIR + 0.6, 3], [fin, 3]]);
  const [haut, bas] = ciel(m);
  const sx = interpolate(t, [0, fin], [150, 930]);
  const sy = 380 - Math.sin(interpolate(t, [0, fin], [0.12, 0.98]) * Math.PI) * 200;

  // Écran de l'assistante maternelle
  const am = (() => {
    if (t >= flip2) {
      // Le soir : la journée complète, l'envoi du résumé, puis le mois
      const pm = fade(t, pushMois, pushMois + 0.45, Easing.linear);
      const lignes = D.mLignes;
      const scroll = kf(t, [[pushMois + 0.5, 0], [calcule - 0.1, Math.max(0, lignes[0].top - 200)], [declarer + 0.3, Math.max(0, lignes[0].top - 120)]]);
      return (
        <Push p={pm}>
          {[
            <div key="soir" style={{ position: 'absolute', inset: 0 }}>
              <Shot src="journee/a-carnet-soir" />
              <Halo t={t} from={soir + 0.1} to={pushMois} r={J.aCarteSoir} />
              <Tap t={t} at={tapResume} r={J.aResume} />
            </div>,
            <div key="mois" style={{ position: 'absolute', inset: 0 }}>
              <Shot src="demo/m-mois-long" scroll={scroll} />
              <Band src="demo/m-mois" y0={D.mTabMois.top - 16} y1={844} />
              {lignes.slice(0, 6).map((l, i) => <Halo key={i} t={t} from={calcule + i * 0.22} to={calcule + i * 0.22 + 0.75} r={l} dy={-scroll} pad={2} />)}
            </div>,
          ]}
        </Push>
      );
    }
    const pk = fade(t, pushCarnet, pushCarnet + 0.42, inOut);
    const ins = fade(t, rowAM1, rowAM1 + 0.35, Easing.linear);
    const swap2 = fade(t, rowAM2 - 0.05, rowAM2 + 0.25, Easing.linear);
    const arr = fade(t, tapArr + 0.06, tapArr + 0.3, Easing.linear);
    return (
      <>
        {pk < 1 && (
          <div style={{ position: 'absolute', inset: 0, translate: `${-pk * SW}px 0` }}>
            <Shot src="journee/a-auj-0" />
            <Shot src="journee/a-auj-1" o={arr} />
            <Halo t={t} from={tapArr + 0.25} to={pushCarnet + 0.2} r={J.aTagArrivee} />
            <Tap t={t} at={tapArr} r={J.aArrivee} />
          </div>
        )}
        {pk > 0 && (
          <div style={{ position: 'absolute', inset: 0, translate: `${(1 - pk) * SW}px 0` }}>
            {swap2 < 1 && <Swap before="journee/a-carnet-0" after="journee/a-carnet-1" y0={J.aLigne1.top - 6} dh={J.aCarte1.h - J.aCarte0.h} p={ins} />}
            <Shot src="journee/a-carnet-2" o={swap2} />
            <Sheet src="journee/a-repas" top={J.aRepasFeuille.top} t={t} up={tapRepas + 0.05} down={tapBien + 0.12} />
            <Sheet src="journee/a-sommeil" top={J.aSommeilFeuille.top} t={t} up={tapSommeil + 0.05} down={tapEndort + 0.12} />
            <Halo t={t} from={rowAM1 + 0.35} to={tapSommeil - 0.1} r={J.aLigne1} />
            <Halo t={t} from={rowAM2 + 0.2} to={flip1 + 0.3} r={J.aDodo} />
            <Tap t={t} at={tapRepas} r={J.aRepas} />
            <Tap t={t} at={tapBien} r={J.aBienMange} />
            <Tap t={t} at={tapSommeil} r={J.aSommeil} />
            <Tap t={t} at={tapEndort} r={J.aEndort} />
          </div>
        )}
      </>
    );
  })();

  // Écran des parents, au même moment
  const par = (
    <>
      <Shot src="journee/p-2" />
      <Halo t={t} from={flip1 + 0.6} to={flip2} r={J.p2ligne} couleur={C.sauge} />
      {(() => {
        const k = fade(t, direct - 0.3, direct + 0.1);
        if (k <= 0) return null;
        const w = ((t - direct) * 1.4) % 1;
        const d = J.p2direct;
        return <div style={{ position: 'absolute', left: d.x - 14, top: d.y - 14, width: 28, height: 28, borderRadius: 14, border: `2.5px solid ${C.ok}`, scale: String(0.6 + w * 1.6), opacity: k * (1 - w) }} />;
      })()}
    </>
  );

  const blocs: Bloc[] = [
    { at: arrive - 0.2, end: g - 0.3, lignes: [{ at: arrive - 0.2, text: 'Adam arrive.' }] },
    { at: g - 0.25, end: mange - 0.3, lignes: [{ at: g - 0.25, text: 'Un geste, c’est noté.' }] },
    { at: mange - 0.28, end: endort - 0.3, lignes: [{ at: mange - 0.28, text: 'Il a bien mangé.' }] },
    { at: endort - 0.28, end: parents - 0.32, lignes: [{ at: endort - 0.28, text: 'Il s’endort,' }, { at: doux - 0.2, text: 'tout doux.', italic: true }] },
    { at: parents - 0.3, end: soir - 0.3, lignes: [{ at: parents - 0.3, text: 'Ses parents le voient,' }, { at: direct - 0.18, text: 'en direct.', italic: true }] },
    { at: soir - 0.25, end: mois - 0.3, lignes: [{ at: soir - 0.25, text: 'Le soir, plus rien' }, { at: recopier - 0.3, text: 'à recopier.' }] },
    { at: mois - 0.3, end: T_SIG + 0.2, lignes: [{ at: mois - 0.3, text: 'Ton mois se calcule' }, { at: c2('seul') - 0.25, text: 'tout seul.', italic: true }] },
  ];
  const etiquette = fade(t, flip1 + 0.3, flip1 + 0.7) * (1 - fade(t, flip2, flip2 + 0.3));

  return (
    <Frame>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${haut} 0%, ${bas} 62%)` }} />
      <div style={{ position: 'absolute', left: sx - 260, top: sy - 260, width: 520, height: 520, borderRadius: 260, background: `radial-gradient(circle, ${rgba(C.accent, 0.42)} 0%, ${rgba(C.accent, 0.16)} 38%, ${rgba(C.accent, 0)} 70%)` }} />
      <Heure t={t} etapes={[{ at: c1('huit') - 0.15, h: '8 h 00' }, { at: pushCarnet + 0.1, h: '11 h 50' }, { at: tapSommeil - 0.35, h: '12 h 40' }, { at: flip2 + 0.2, h: '17 h 30' }, { at: pushMois + 0.1, h: 'Fin du mois' }]} />
      <Caption t={t} blocs={blocs} y={272} size={64} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: top - 70, textAlign: 'center', fontFamily: F.mono, fontSize: 26, letterSpacing: '0.16em', color: C.sauge, opacity: etiquette }}>CÔTÉ PARENTS</div>
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '540px 1200px', transform: `scale(${drift})`, translate: `0 ${phoneIn * 1300}px`, perspective: 2400 }}>
        <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transformOrigin: '540px 1170px', transform: `rotateY(${angle}deg)` }}>
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
            {!coteParents && <PhoneBox cx={540} top={top} S={S}>{am}</PhoneBox>}
          </div>
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            {coteParents && <PhoneBox cx={540} top={top} S={S}>{par}</PhoneBox>}
          </div>
        </div>
      </div>
      <Bulle t={t} from={tapResume + 0.25} to={pushMois + 0.25} titre="Résumé envoyé aux parents" texte={J.texteResume} x={120} y={520} w={840} size={34} />
      <Signature t={t} at={T_SIG} fin={fin} phrase="Le carnet de bord des assistantes maternelles" />
      {PISTES.map((p, i) => <Voix key={i} p={p} />)}
      <Musique fichier="musique/measured-grace.mp3" depart={16.2} fin={fin} pistes={PISTES} fps={fps} />
      {[tapArr, tapRepas, tapBien, tapSommeil, tapEndort, tapResume].map((x) => <Sfx key={'t' + x} at={x} name="tap" volume={0.55} />)}
      {[tapArr + 0.25, rowAM1 + 0.1, rowAM2].map((x) => <Sfx key={'p' + x} at={x} name="pop" volume={0.3} />)}
      <Sfx at={flip1} name="whoosh" volume={0.35} />
      <Sfx at={flip2} name="whoosh" volume={0.35} />
      <Sfx at={tapResume + 0.3} name="envoye" volume={0.35} />
      <Sfx at={T_SIG + 0.2} name="chime" volume={0.4} />
    </Frame>
  );
};
