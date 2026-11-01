import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Galets } from '../components/Galets';
import { K, Layer, Phone } from '../components/Phone';
import { Reveal } from '../components/Reveal';
import { C, F } from '../theme';
import taps from '../../public/ecrans/taps.json';

// Prise en main, calée sur la voix « prise-en-main.wav » (t = 0 au début du fichier).
const ease = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Interpolation par images clés : [[t, valeur], …]
function kf(t: number, keys: [number, number][], e = ease) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return interpolate(t, [keys[i - 1][0], keys[i][0]], [keys[i - 1][1], keys[i][1]], { ...cl, easing: e });
  }
  return keys[keys.length - 1][1];
}
const fade = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], cl);

type R = { left: number; top: number; w: number; h: number };
const T = taps as Record<string, { x: number; y: number; w: number; h: number; top: number; left: number }>;
const rect = (k: string, pad = 6): R => ({ left: T[k].left - pad, top: T[k].top - pad, w: T[k].w + pad * 2, h: T[k].h + pad * 2 });

// Écrans affichés (fondu enchaîné, défilement, feuille qui monte)
function layers(t: number): Layer[] {
  const L: Layer[] = [];
  const add = (img: string, from: number, to: number, extra: Partial<Layer> = {}, inDur = 0.22) => {
    const o = Math.min(fade(t, from, from + inDur), 1 - fade(t, to, to + 0.22));
    if (o > 0) L.push({ img, opacity: o, ...extra });
  };
  add('auj-matin', -1, 6.62);
  add('auj-arrivee', 6.62, 7.75);
  add('auj-soir', 7.75, 8.92);
  add('auj-depart', 8.92, 12.2);
  add('auj-avant-modifier', 12.2, 15.6);
  // La fiche « Modifier » monte, puis redescend avant le passage au Carnet
  const sheetIn = interpolate(t, [14.12, 14.5], [1, 0], { ...cl, easing: out });
  const sheetOut = interpolate(t, [14.95, 15.25], [0, 1], { ...cl, easing: ease });
  if (t >= 14.1 && t < 15.3) L.push({ img: 'auj-modifier', opacity: 1 - sheetOut, dy: (sheetIn + sheetOut) * 420 });
  add('carnet-leo', 15.6, 17.0);
  add('carnet-ines', 17.0, 19.42);
  const repasIn = interpolate(t, [19.42, 19.8], [1, 0], { ...cl, easing: out });
  if (t >= 19.4 && t < 20.6) L.push({ img: 'carnet-repas', opacity: 1 - fade(t, 20.42, 20.6), dy: repasIn * 420 });
  add('carnet-note', 20.42, 24.75);
  add('mois', 24.75, 27.3);
  add('mois-long', 27.3, 34.35, { scroll: kf(t, [[27.4, 0], [29.6, 470], [30.6, 470], [31.8, 1020]]), tabbarFrom: 'mois' });
  add('plus-long', 34.35, 41, { scroll: kf(t, [[38.1, 0], [38.9, 560]]), tabbarFrom: 'plus' });
  return L;
}

// Cercles de repère avec leur étiquette, en coordonnées d'écran
type Mark = { r: R; from: number; to: number; label?: string; below?: boolean; right?: boolean; scrollOf?: (t: number) => number };
const scrollMois = (t: number) => kf(t, [[27.4, 0], [29.6, 470], [30.6, 470], [31.8, 1020]]);
const scrollPlus = (t: number) => kf(t, [[38.1, 0], [38.9, 560]]);
const MARKS: Mark[] = [
  { r: { left: 64, top: 470, w: 196, h: 54 }, from: 2.7, to: 5.3, label: 'Horaires prévus', below: true },
  { r: rect('arrivee'), from: 5.6, to: 6.5, label: 'Arrivée' },
  { r: { left: 60, top: 655, w: 120, h: 34 }, from: 6.75, to: 7.7, label: 'L’heure est notée', below: true },
  { r: rect('depart'), from: 7.95, to: 8.8, label: 'Départ' },
  { r: { left: T.annuler.left - 8, top: T.annuler.top - 4, w: T.annuler.w + 16, h: T.annuler.h + 8 }, from: 10.3, to: 12.0, label: 'Annuler' },
  { r: rect('modifier'), from: 12.6, to: 14.0, label: 'Modifier' },
  { r: rect('chipInes', 4), from: 16.2, to: 16.95, label: 'L’enfant', below: true },
  { r: { left: 10, top: 127, w: 370, h: 100 }, from: 17.6, to: 19.25, label: 'Repas · Sieste · Change', below: true },
  { r: rect('ligneNote'), from: 20.75, to: 22.4, label: 'L’heure s’ajoute seule', below: true },
  { r: rect('envoyerResume'), from: 22.2, to: 23.0, label: 'Envoyer aux parents' },
  { r: rect('total', 4), from: 25.2, to: 27.2, label: 'À verser par la famille', below: true },
  { r: { left: 26, top: 640, w: 338, h: 672 }, from: 28.3, to: 30.4, label: 'Lignes à reporter sur Pajemploi', scrollOf: scrollMois },
  { r: rect('envoyerParent'), from: 31.4, to: 33.4, label: 'Envoyer au parent', scrollOf: scrollMois },
  { r: rect('liConges', 2), from: 35.0, to: 36.8, label: 'Congés', right: true, scrollOf: scrollPlus },
  { r: rect('liControle', 2), from: 36.9, to: 38.1, label: 'Bulletins', right: true, scrollOf: scrollPlus },
  { r: rect('liReglages', 2), from: 38.6, to: 39.7, label: 'Réglages', right: true, scrollOf: scrollPlus },
];

// Touchers du doigt (coordonnées d'écran visibles)
const TAPS: { at: number; x: number; y: number }[] = [
  { at: 6.5, x: T.arrivee.x, y: T.arrivee.y },
  { at: 8.8, x: T.depart.x, y: T.depart.y },
  { at: 14.0, x: T.modifier.x, y: T.modifier.y },
  { at: 15.45, x: T.tabCarnet.x, y: T.tabCarnet.y },
  { at: 16.9, x: T.chipInes.x, y: T.chipInes.y },
  { at: 19.3, x: T.repas.x, y: T.repas.y },
  { at: 20.3, x: T.toutMange.x, y: T.toutMange.y },
  { at: 22.95, x: T.envoyerResume.x, y: T.envoyerResume.y },
  { at: 24.6, x: T.tabMois.x, y: T.tabMois.y },
  { at: 32.4, x: T.envoyerParent.x, y: T.envoyerParent.y - 1020 },
  { at: 34.2, x: T.tabPlus.x, y: T.tabPlus.y },
];
export const DIDACTIC_TAPS = TAPS.map((x) => x.at);
export const DIDACTIC_MARKS = MARKS.map((m) => m.from);
export const DIDACTIC_SWIPES = [7.75, 15.6, 24.75, 34.35];

const CHAPTERS = [
  { from: 0.15, to: 15.2, n: '01', name: 'Aujourd’hui', title: 'Pointer en un geste.' },
  { from: 15.35, to: 24.5, n: '02', name: 'Carnet', title: 'Le carnet de liaison.' },
  { from: 24.65, to: 33.95, n: '03', name: 'Mois', title: 'Prêt à déclarer.', note: 'Montants à vérifier avant déclaration · Pajemploi fait foi' },
  { from: 34.1, to: 39.5, n: '04', name: 'Plus', title: 'Tout le reste.' },
];

export const Didactic: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Caméra : point de l'écran (fx, fy) placé en (540, cy) avec un zoom z
  const z = kf(t, [[0, 1], [2.4, 1], [5.4, 1.32], [7.6, 1.32], [7.9, 1.25], [9.6, 1.25], [10.2, 1.18], [12.0, 1.18], [12.6, 1.3], [14.1, 1.3], [14.6, 1], [16.0, 1], [16.5, 1.25], [20.6, 1.25], [21.0, 1.3], [22.2, 1.3], [22.6, 1.15], [24.4, 1.15], [24.8, 1], [25.2, 1.12], [27.3, 1.12], [27.8, 1], [34.2, 1], [34.6, 1.08], [39.4, 1.08], [39.9, 0.6]]);
  const fx = kf(t, [[0, 195], [5.4, 195]]);
  const fy = kf(t, [[0, 422], [2.4, 422], [5.4, 540], [7.6, 540], [7.9, 330], [9.6, 330], [10.2, 640], [12.0, 640], [12.6, 560], [14.1, 560], [14.6, 422], [16.0, 422], [16.5, 260], [20.6, 260], [21.0, 420], [22.2, 420], [22.6, 470], [24.4, 470], [24.8, 422], [25.2, 330], [27.3, 330], [27.8, 422], [34.2, 422], [34.6, 440], [39.4, 440], [39.9, 422]]);
  const cy = kf(t, [[0, 1085], [39.4, 1085], [39.9, 760]]);
  const enter = interpolate(t, [-0.2, 0.75], [1, 0], { ...cl, easing: out });
  const leave = interpolate(t, [39.5, 40.0], [1, 0], cl);
  const ox = 540 - fx * K * z;
  const oy = cy - fy * K * z + enter * 1500;
  const map = (x: number, y: number) => ({ x: ox + x * K * z, y: oy + y * K * z });

  return (
    <AbsoluteFill>
      {/* Le téléphone, cadré par la caméra */}
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${ox}px, ${oy}px) scale(${z})`, opacity: leave }}>
        <Phone
          layers={layers(t)}
          overlay={MARKS.map((m, i) => {
            const k = interpolate(t, [m.from, m.from + 0.35], [0, 1], { ...cl, easing: out });
            const o = Math.min(k, 1 - fade(t, m.to - 0.25, m.to));
            if (o <= 0) return null;
            const sc = m.scrollOf ? m.scrollOf(t) : 0;
            const r = m.r;
            return (
              <div key={i} style={{ position: 'absolute', left: r.left * K, top: (r.top - sc) * K, width: r.w * K, height: r.h * K, opacity: o }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * K, border: `${3.5}px solid ${C.accent}`, boxShadow: `0 0 0 ${interpolate(k, [0, 1], [24, 6])}px rgba(200,125,85,${0.18 * (1 - k) + 0.1})`, scale: String(interpolate(k, [0, 1], [1.08, 1])) }} />
                {m.label && (
                  <div style={{ position: 'absolute', ...(m.right ? { right: 18, top: '50%', translate: '0 -50%' } : { left: '50%', [m.below ? 'top' : 'bottom']: '100%', translate: `-50% ${m.below ? 14 : -14}px` }), whiteSpace: 'nowrap', background: C.ink, color: C.bg, fontFamily: F.body, fontWeight: 650, fontSize: 30, padding: '10px 22px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 16px 30px -12px rgba(30,32,29,0.5)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 6, background: C.accent }} />{m.label}
                  </div>
                )}
              </div>
            );
          })}
        />
      </div>

      {/* Voile albâtre derrière l'en-tête, pour qu'il reste lisible quand le téléphone est zoomé */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420, opacity: Math.min(fade(t, 0, 0.3), 1 - fade(t, 39.3, 39.6)), background: 'linear-gradient(180deg, #F7F4EF 0%, #F7F4EF 66%, rgba(247,244,239,0) 100%)' }} />
      {/* En-tête du chapitre */}
      {CHAPTERS.map((c) => {
        const o = Math.min(fade(t, c.from, c.from + 0.3), 1 - fade(t, c.to - 0.3, c.to));
        if (o <= 0) return null;
        return (
          <div key={c.n} style={{ position: 'absolute', top: 96, left: 0, right: 0, textAlign: 'center', opacity: o }}>
            <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 30, letterSpacing: 7, color: C.accentInk }}>
              <Reveal at={c.from}>{`${c.n} · ${c.name.toUpperCase()}`}</Reveal>
            </div>
            <div style={{ marginTop: 10, fontFamily: F.display, fontWeight: 600, fontSize: 92, lineHeight: 1.05, color: C.ink }}>
              <Reveal at={c.from + 0.1}>{c.title}</Reveal>
            </div>
            {c.note && <div style={{ marginTop: 14, fontFamily: F.body, fontWeight: 500, fontSize: 30, color: C.muted, opacity: fade(t, c.from + 5.5, c.from + 6.0) }}>{c.note}</div>}
          </div>
        );
      })}

      {/* Doigt */}
      {TAPS.map((p, i) => {
        const a = interpolate(t, [p.at - 0.45, p.at - 0.12], [0, 1], cl) * (1 - fade(t, p.at + 0.35, p.at + 0.6));
        if (a <= 0) return null;
        const press = interpolate(t, [p.at - 0.1, p.at, p.at + 0.15], [1, 0.82, 1], cl);
        const wave = fade(t, p.at, p.at + 0.55);
        const pt = map(p.x, p.y);
        return (
          <div key={i} style={{ position: 'absolute', left: pt.x, top: pt.y, opacity: a }}>
            <div style={{ position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: 40, background: 'rgba(30,32,29,0.32)', border: '4px solid rgba(255,255,255,0.95)', scale: String(press), boxShadow: '0 10px 24px -6px rgba(0,0,0,0.35)' }} />
            {t >= p.at && <div style={{ position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: 40, border: `6px solid ${C.accent}`, scale: String(1 + wave * 1.6), opacity: 1 - wave }} />}
          </div>
        );
      })}

      {/* Le résumé part chez les parents */}
      {(() => {
        const k = fade(t, 23.05, 23.9);
        if (k <= 0 || k >= 1) return null;
        const p0 = map(T.envoyerResume.x, T.envoyerResume.y);
        const e = Easing.bezier(0.5, 0, 0.2, 1)(k);
        return (
          <div style={{ position: 'absolute', left: interpolate(e, [0, 1], [p0.x, 900]), top: interpolate(e, [0, 1], [p0.y, 330]), translate: '-50% -50%', scale: String(interpolate(e, [0, 0.3, 1], [0.4, 1, 0.8])), opacity: 1 - fade(t, 23.6, 23.9), background: C.surface, border: `2px solid ${C.border}`, borderRadius: 28, padding: '18px 26px', boxShadow: '0 30px 60px -20px rgba(30,32,29,0.4)', fontFamily: F.body, fontWeight: 600, fontSize: 30, color: C.ink, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: C.ok }} />Résumé envoyé
          </div>
        );
      })()}

      {/* Signature finale */}
      {t > 39.6 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Galets size={380} start={Math.round(39.75 * fps)} pearlFrom={-70} />
          <div style={{ marginTop: 24, fontFamily: F.display, fontWeight: 600, fontSize: 124, color: C.ink, letterSpacing: interpolate(t, [40.0, 40.9], [70, 32], { ...cl, easing: out }), paddingLeft: 32, opacity: fade(t, 40.0, 40.5) }}>ARVELA</div>
          <div style={{ marginTop: 18, fontFamily: F.display, fontStyle: 'italic', fontWeight: 400, fontSize: 64, color: C.ink, textAlign: 'center', lineHeight: 1.15 }}>
            <Reveal at={40.85}>Le carnet de bord</Reveal><br />
            <Reveal at={41.05}>des assistantes maternelles.</Reveal>
          </div>
          <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, opacity: fade(t, 41.9, 42.4) }}>
            <span style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 34, letterSpacing: 10, color: C.accentInk }}>ARVELA.FR</span>
            <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: 34, color: C.muted }}>Gratuit pendant la phase de test</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
