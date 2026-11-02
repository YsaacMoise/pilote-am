import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { Galets } from './components/Galets';
import { C, F, s } from './theme';
import voix from '../public/voix/accueil-journee.reperes.json';
import E from '../public/ecrans/essais/essais.json';

// Deux essais de 10 secondes, ton chaleureux et doux, voix Nika :
// A « Deux téléphones » : chaque geste de l'assistante maternelle arrive chez les parents.
// B « La journée qui se raconte » : un seul téléphone, la journée avance (ciel, heure), chaque moment se note d'un geste.

type Rect = { left: number; top: number; w: number; h: number; x: number; y: number };
const R = E as unknown as Record<string, Rect>;
const M = voix.mots as Record<string, number>;
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const fade = (t: number, a: number, b: number, e = ease) => interpolate(t, [a, b], [0, 1], { ...cl, easing: e });
const SW = 390;
const SH = 844;
const img = (n: string) => staticFile(`ecrans/essais/${n}.png`);
// Couleur de la charte avec une transparence (les teintes suivent l'app)
const rgba = (hex: string, a: number) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

// ---------- Briques d'écran (coordonnées de l'écran du téléphone, 390 × 844) ----------
const Full: React.FC<{ n: string; o?: number; dx?: number; dy?: number }> = ({ n, o = 1, dx = 0, dy = 0 }) =>
  o <= 0.001 ? null : <Img src={img(n)} style={{ position: 'absolute', left: dx, top: dy, width: SW, opacity: o }} />;

// Bande d'une capture, de y0 à y1, décalée de dy
const Band: React.FC<{ n: string; y0: number; y1: number; dy?: number; o?: number }> = ({ n, y0, y1, dy = 0, o = 1 }) => (
  <div style={{ position: 'absolute', left: 0, top: y0 + dy, width: SW, height: Math.max(0, y1 - y0), overflow: 'hidden', opacity: o }}>
    <Img src={img(n)} style={{ position: 'absolute', left: 0, top: -y0, width: SW }} />
  </div>
);

// Première ligne d'une carte vide : le texte d'attente laisse la place à la ligne
const Swap: React.FC<{ before: string; after: string; y0: number; dh: number; p: number }> = ({ before, after, y0, dh, p }) => {
  if (p <= 0) return <Full n={before} />;
  if (p >= 1) return <Full n={after} />;
  const e = inOut(p);
  // Avant et après restent alignés pendant le fondu : le bas de la carte descend de dh, sans image fantôme
  return (
    <>
      <Band n={after} y0={0} y1={y0} />
      <Band n={before} y0={y0} y1={SH} dy={e * dh} o={1 - e} />
      <Band n={after} y0={y0} y1={SH} dy={-(1 - e) * dh} o={e} />
    </>
  );
};

// Une nouvelle ligne s'insère : le haut reste, la ligne s'ouvre, le bas descend (vraies captures avant / après)
const Insert: React.FC<{ before: string; after: string; top: number; h: number; p: number }> = ({ before, after, top, h, p }) => {
  if (p <= 0) return <Full n={before} />;
  if (p >= 1) return <Full n={after} />;
  const e = inOut(p);
  return (
    <>
      <Band n={after} y0={0} y1={top} />
      <div style={{ position: 'absolute', left: 0, top, width: SW, height: h * e, overflow: 'hidden' }}>
        <Img src={img(after)} style={{ position: 'absolute', left: 0, top: -top - (1 - e) * 12, width: SW, opacity: fade(p, 0.25, 1) }} />
      </div>
      <Band n={before} y0={top} y1={SH} dy={h * e} />
      <Full n={after} o={fade(p, 0.82, 1, Easing.linear)} />
    </>
  );
};

// Feuille qui monte : voile sombre sur l'écran, puis le panneau de la capture « feuille ouverte » glisse du bas
const SHEET_TOP: Record<string, number> = { 'a-repas': R.aRepasFeuille.top, 'a-sommeil': R.aSommeilFeuille.top };
const Sheet: React.FC<{ n: string; t: number; up: number; down: number }> = ({ n, t, up, down }) => {
  const k = fade(t, up, up + 0.34) * (1 - fade(t, down, down + 0.28, Easing.bezier(0.5, 0, 0.75, 0)));
  if (k <= 0.001) return null;
  const top = SHEET_TOP[n];
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: rgba(C.ink, 0.45 * Math.min(1, k * 1.4)) }} />
      <div style={{ position: 'absolute', left: 0, top: top + (1 - k) * (SH - top), width: SW, height: SH - top, overflow: 'hidden', borderRadius: '20px 20px 0 0' }}>
        <Img src={img(n)} style={{ position: 'absolute', left: 0, top: -top, width: SW }} />
      </div>
    </>
  );
};

// Doigt qui touche
const Tap: React.FC<{ t: number; at: number; r: Rect }> = ({ t, at, r }) => {
  const a = interpolate(t, [at - 0.4, at - 0.12], [0, 1], cl) * (1 - fade(t, at + 0.3, at + 0.55));
  if (a <= 0) return null;
  const press = interpolate(t, [at - 0.1, at, at + 0.14], [1, 0.8, 1], cl);
  const wave = fade(t, at, at + 0.6);
  const d = 46;
  return (
    <div style={{ position: 'absolute', left: r.x, top: r.y, opacity: a }}>
      <div style={{ position: 'absolute', left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d, background: 'rgba(30,32,29,0.28)', border: '2.5px solid rgba(255,255,255,0.95)', scale: String(press), boxShadow: '0 6px 14px -4px rgba(0,0,0,0.3)' }} />
      {t >= at && <div style={{ position: 'absolute', left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d, border: `3.5px solid ${C.accent}`, scale: String(1 + wave * 1.5), opacity: 1 - wave }} />}
    </div>
  );
};

// Halo doux autour d'un élément (nouvelle ligne, bandeau)
const Halo: React.FC<{ t: number; from: number; to: number; r: Rect; pad?: number }> = ({ t, from, to, r, pad = 4 }) => {
  const k = fade(t, from, from + 0.35) * (1 - fade(t, to - 0.3, to));
  if (k <= 0.001) return null;
  const pulse = 0.5 + 0.5 * Math.sin((t - from) * 5);
  return (
    <div style={{ position: 'absolute', left: r.left - pad, top: r.top - pad, width: r.w + pad * 2, height: r.h + pad * 2, borderRadius: 14, border: `2.5px solid ${C.accent}`, boxShadow: `0 0 ${10 + pulse * 10}px ${rgba(C.accent, 0.35 + pulse * 0.2)}`, background: rgba(C.accentSoft, 0.18 * k), opacity: k }} />
  );
};

// Téléphone : cadre basalte, écran à l'échelle S, centré en cx
const PhoneBox: React.FC<{ cx: number; top: number; S: number; children: React.ReactNode }> = ({ cx, top, S, children }) => {
  const B = 12 * S;
  return (
    <div style={{ position: 'absolute', left: cx - (SW * S) / 2 - B, top: top - B, width: SW * S + 2 * B, height: SH * S + 2 * B, borderRadius: 52 * S, background: C.ink, boxShadow: '0 50px 90px -40px rgba(30,32,29,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset' }}>
      <div style={{ position: 'absolute', left: B, top: B, width: SW * S, height: SH * S, borderRadius: 42 * S, overflow: 'hidden', background: C.bg }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, transformOrigin: '0 0', transform: `scale(${S})` }}>{children}</div>
      </div>
    </div>
  );
};

// Sous-titres animés, mot à mot (lisibles sans le son)
type Ligne = { at: number; text: string; italic?: boolean };
type Bloc = { at: number; end: number; lignes: Ligne[] };
const Caption: React.FC<{ t: number; blocs: Bloc[]; y: number; size: number }> = ({ t, blocs, y, size }) => (
  <>
    {blocs.map((b, i) => {
      const out = fade(t, b.end - 0.22, b.end, inOut);
      if (t < b.at - 0.05 || out >= 1) return null;
      return (
        <div key={i} style={{ position: 'absolute', left: 60, right: 60, top: y, textAlign: 'center', fontFamily: F.display, fontWeight: 600, fontSize: size, lineHeight: 1.04, color: C.ink, opacity: 1 - out, translate: `0 ${-out * 30}px` }}>
          {b.lignes.map((l, j) => (
            <div key={j}>
              {l.text.split(' ').map((w, k) => {
                const a = fade(t, l.at + k * 0.09, l.at + k * 0.09 + 0.5);
                return (
                  <span key={k} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.1em', marginRight: '0.24em' }}>
                    <span style={{ display: 'inline-block', translate: `0 ${(1 - a) * 100}%`, fontStyle: l.italic ? 'italic' : 'normal', fontWeight: l.italic ? 500 : 600, color: l.italic ? C.accentInk : C.ink }}>{w}</span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      );
    })}
  </>
);

// Signature finale
const Signature: React.FC<{ t: number; at: number; fin: number }> = ({ t, at, fin }) => {
  const k = fade(t, at, at + 0.6);
  if (k <= 0) return null;
  const out = fade(t, fin - 0.35, fin, Easing.linear);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: rgba(C.bg, 0.86 * k), opacity: 1 - out }}>
      <div style={{ translate: `0 ${(1 - k) * 40}px`, opacity: k, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Galets size={190} start={s(at)} />
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 84, letterSpacing: '0.18em', marginTop: 26, color: C.ink }}>ARVELA</div>
        <div style={{ fontFamily: F.display, fontStyle: 'italic', fontSize: 46, color: C.muted, marginTop: 6 }}>Le carnet de bord des assistantes maternelles</div>
      </div>
    </AbsoluteFill>
  );
};

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 1 }) =>
  at < 0 ? null : (
    <Sequence from={s(at)} durationInFrames={s(2.2)} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );

const Bande: React.FC<{ off: number; from: string; to: string; fin: number; taps: number[]; pops: number[]; envois?: number[] }> = ({ off, from, to, fin, taps, pops, envois = [] }) => {
  const { fps } = useVideoConfig();
  const a = Math.max(0, M[from] - 0.35);
  const b = M[to] + 0.45;
  return (
    <>
      <Sequence from={s(a - off)} durationInFrames={s(b - a)} layout="none">
        <Audio src={staticFile(voix.fichier)} trimBefore={s(a)} />
      </Sequence>
      <Audio src={staticFile('musique/measured-grace.mp3')} trimBefore={s(16.2)} volume={(f: number) => { const t = f / fps; return 0.2 * Math.min(1, t / 0.8) * Math.max(0, Math.min(1, (fin - t) / 1.2)) * (t > a - off && t < b - off ? 0.62 : 1); }} />
      {taps.map((x) => <Sfx key={'t' + x} at={x} name="tap" volume={0.55} />)}
      {pops.map((x) => <Sfx key={'p' + x} at={x} name="pop" volume={0.3} />)}
      {envois.map((x) => <Sfx key={'e' + x} at={x} name="envoye" volume={0.32} />)}
      <Sfx at={fin - 2.0} name="chime" volume={0.4} />
    </>
  );
};

// ================= A · Deux téléphones =================
const OFF_A = M.geste - 1.0; // le mot « geste » tombe à 1,0 s
const cA = (k: string) => M[k] - OFF_A;
export const DUREE_A = cA('finDirect') + 2.6;

export const EssaiDeuxTelephones: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const g = cA('geste'), note = cA('note'), mange = cA('mange'), endort = cA('endort'), doux = cA('doux'), parents = cA('parents'), direct = cA('direct'), fin = DUREE_A;

  // Gestes côté assistante maternelle
  const tapRepas = g, tapBien = note - 0.32, tapSommeil = endort - 0.5, tapEndort = endort + 0.12;
  const rowAM1 = note - 0.12, rowAM2 = endort + 0.3;
  // Envoi vers les parents (la perle) puis arrivée de la ligne
  const send1 = rowAM1 + 0.25, arrive1 = mange - 0.15;
  const send2 = rowAM2 + 0.2, arrive2 = doux - 0.2;

  const S = 1.26;
  const top = 520;
  const xAM = 272, xP = 808;
  const sigAt = fin - 2.1;

  // Caméra : léger souffle, puis on se rapproche du téléphone des parents
  const zoom = interpolate(t, [parents - 0.4, parents + 0.5, sigAt - 0.2, sigAt + 0.4], [1, 1.07, 1.07, 1.0], { ...cl, easing: inOut });
  const fx = interpolate(t, [parents - 0.4, parents + 0.5], [540, xP], { ...cl, easing: inOut });
  const fy = 1060;
  const enter = (d: number) => interpolate(t, [d, d + 0.75], [1, 0], { ...cl, easing: ease });

  // Écran assistante maternelle
  const am = (() => {
    const insert1 = fade(t, rowAM1, rowAM1 + 0.35, Easing.linear);
    const swap2 = fade(t, rowAM2 - 0.05, rowAM2 + 0.25, Easing.linear);
    return (
      <>
        {swap2 < 1 && <Swap before="a-carnet-0" after="a-carnet-1" y0={R.aLigne1.top - 6} dh={R.aCarte1.h - R.aCarte0.h} p={insert1} />}
        <Full n="a-carnet-2" o={swap2} />
        <Sheet n="a-repas" t={t} up={tapRepas + 0.05} down={tapBien + 0.12} />
        <Sheet n="a-sommeil" t={t} up={tapSommeil + 0.05} down={tapEndort + 0.12} />
        <Halo t={t} from={rowAM1 + 0.35} to={send1 + 0.9} r={R.aLigne1} />
        <Halo t={t} from={rowAM2 + 0.2} to={send2 + 1.0} r={R.aDodo} />
        <Tap t={t} at={tapRepas} r={R.aRepas} />
        <Tap t={t} at={tapBien} r={R.aBienMange} />
        <Tap t={t} at={tapSommeil} r={R.aSommeil} />
        <Tap t={t} at={tapEndort} r={R.aEndort} />
      </>
    );
  })();

  // Écran parents : les lignes arrivent en direct
  const par = (() => {
    const p1 = fade(t, arrive1, arrive1 + 0.5, Easing.linear);
    const p2 = fade(t, arrive2, arrive2 + 0.5, Easing.linear);
    return (
      <>
        {p2 <= 0 ? <Insert before="p-0" after="p-1" top={R.p1ligne.top - 4} h={R.p1carte.h - R.p0carte.h} p={p1} /> : <Insert before="p-1" after="p-2" top={R.p2ligne.top - 4} h={R.p2carte.h - R.p1carte.h} p={p2} />}
        <Halo t={t} from={arrive1 + 0.3} to={arrive2 - 0.1} r={R.p1ligne} />
        <Halo t={t} from={arrive2 + 0.3} to={sigAt} r={R.p2ligne} />
        {/* Point « en direct » qui bat */}
        {(() => {
          const k = fade(t, direct - 0.3, direct + 0.1);
          if (k <= 0) return null;
          const w = ((t - direct) * 1.4) % 1;
          const d = R.p2direct;
          return <div style={{ position: 'absolute', left: d.x - 14, top: d.y - 14, width: 28, height: 28, borderRadius: 14, border: `2.5px solid ${C.ok}`, scale: String(0.6 + w * 1.6), opacity: k * (1 - w) }} />;
        })()}
      </>
    );
  })();

  // La perle part de la ligne notée et rejoint le téléphone des parents
  const perle = (from: number, to: number, src: Rect, dst: Rect) => {
    const k = fade(t, from, to, inOut);
    if (k <= 0 || k >= 1) return null;
    const x0 = xAM - (SW * S) / 2 + src.x * S, y0 = top + src.y * S;
    const x1 = xP - (SW * S) / 2 + dst.x * S, y1 = top + dst.y * S;
    const pts = [0, 0.06, 0.12].map((lag, i) => {
      const u = Math.max(0, k - lag);
      const x = interpolate(u, [0, 1], [x0, x1]);
      const y = interpolate(u, [0, 1], [y0, y1]) - Math.sin(u * Math.PI) * 260;
      return <div key={i} style={{ position: 'absolute', left: x - 17 + i * 3, top: y - 17 + i * 3, width: 34 - i * 6, height: 34 - i * 6, borderRadius: 20, background: C.accent, opacity: (1 - i * 0.35) * Math.min(1, k * 6, (1 - k) * 8), boxShadow: i === 0 ? `0 8px 20px -6px ${rgba(C.accentInk, 0.6)}` : 'none' }} />;
    });
    return <>{pts}</>;
  };

  const blocs: Bloc[] = [
    { at: g - 0.12, end: mange - 0.32, lignes: [{ at: g - 0.12, text: 'Un geste,' }, { at: note - 0.3, text: 'c’est noté.' }] },
    { at: mange - 0.3, end: endort - 0.3, lignes: [{ at: mange - 0.3, text: 'Il a bien mangé.' }] },
    { at: endort - 0.28, end: parents - 0.32, lignes: [{ at: endort - 0.28, text: 'Il s’endort,' }, { at: doux - 0.2, text: 'tout doux.', italic: true }] },
    { at: parents - 0.3, end: sigAt + 0.1, lignes: [{ at: parents - 0.3, text: 'Ses parents le voient,' }, { at: direct - 0.18, text: 'en direct.', italic: true }] },
  ];

  const label = (txt: string, cx: number, d: number) => (
    <div style={{ position: 'absolute', left: cx - 260, width: 520, top: top + SH * S + 46, textAlign: 'center', fontFamily: F.mono, fontSize: 25, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, opacity: 1 - enter(d) }}>{txt}</div>
  );

  return (
    <Frame>
      {/* Fond : deux halos doux qui respirent */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${30 + Math.sin(t * 0.5) * 6}% 62%, ${rgba(C.accentSoft, 0.75)}, ${rgba(C.bg, 0)} 46%), radial-gradient(circle at ${72 - Math.sin(t * 0.4) * 6}% 58%, ${rgba(C.sauge, 0.16)}, ${rgba(C.bg, 0)} 44%)` }} />
      <AbsoluteFill style={{ transformOrigin: `${fx}px ${fy}px`, transform: `scale(${zoom}) translateX(${(540 - fx) * (zoom - 1) / zoom}px)` }}>
        <div style={{ position: 'absolute', inset: 0, translate: `0 ${enter(0) * 1200}px`, opacity: 1 - 0.55 * fade(t, parents - 0.4, parents + 0.4, inOut) * (1 - fade(t, sigAt - 0.3, sigAt + 0.2)) }}>
          <PhoneBox cx={xAM} top={top} S={S}>{am}</PhoneBox>
          {label('L’assistante maternelle', xAM, 0.2)}
        </div>
        <div style={{ position: 'absolute', inset: 0, translate: `0 ${enter(0.18) * 1200}px` }}>
          <PhoneBox cx={xP} top={top} S={S}>{par}</PhoneBox>
          {label('Les parents', xP, 0.38)}
        </div>
        {perle(send1, arrive1, R.aLigne1, R.p1ligne)}
        {perle(send2, arrive2, R.aDodo, R.p2ligne)}
      </AbsoluteFill>
      <Caption t={t} blocs={blocs} y={190} size={92} />
      <Signature t={t} at={sigAt} fin={fin} />
      <Bande off={OFF_A} from="geste" to="direct" fin={fin} taps={[tapRepas, tapBien, tapSommeil, tapEndort]} pops={[rowAM1 + 0.1, rowAM2]} envois={[arrive1, arrive2]} />
    </Frame>
  );
};

// ================= B · La journée qui se raconte =================
const OFF_B = M.huit - 0.55;
const cB = (k: string) => M[k] - OFF_B;
export const DUREE_B = cB('finDoux') + 2.7;

const mix = (a: string, b: string, k: number) => {
  const p = (h: string) => (h.startsWith('#') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : (h.match(/\d+/g) ?? []).slice(0, 3).map(Number));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};
// Couleur du ciel selon le moment de la journée (0 aube, 1 midi, 2 après-midi), tirée des couleurs de l'app
const ciel = (m: number) => {
  const haut = [mix(C.bg, C.accentSoft, 0.75), mix(C.bg, C.accentSoft, 0.3), mix(C.bg, C.accentSoft, 0.85)];
  const bas = [mix(C.bg, C.accentSoft, 0.2), C.bg, mix(C.bg, C.accentSoft, 0.35)];
  const i = Math.min(1, Math.floor(m)), k = m - i;
  return [mix(haut[i], haut[i + 1], k), mix(bas[i], bas[i + 1], k)];
};

const Heure: React.FC<{ t: number; etapes: { at: number; h: string }[] }> = ({ t, etapes }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 100, height: 160, overflow: 'hidden', textAlign: 'center' }}>
    {etapes.map((e, i) => {
      const next = etapes[i + 1];
      const a = fade(t, e.at, e.at + 0.55);
      const o = next ? fade(t, next.at, next.at + 0.45, inOut) : 0;
      if (a <= 0 || o >= 1) return null;
      return (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 0, fontFamily: F.display, fontWeight: 500, fontSize: 132, lineHeight: 1.1, color: C.accentInk, translate: `0 ${(1 - a) * 100 - o * 100}%`, fontVariantNumeric: 'tabular-nums' }}>{e.h}</div>
      );
    })}
  </div>
);

export const EssaiJournee: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const huit = cB('huit'), arrive = cB('arrive'), g = cB('geste'), note = cB('note'), mange = cB('mange'), endort = cB('endort'), doux = cB('doux'), fin = DUREE_B;
  const sigAt = fin - 2.15;

  const tapArr = arrive + 0.05;
  const push = g - 0.62;
  const tapRepas = g + 0.02, tapBien = note - 0.32, rowAM1 = note - 0.12;
  const tapSommeil = endort - 0.5, tapEndort = endort + 0.12, rowAM2 = endort + 0.3;

  const S = 1.56;
  const top = 505;
  const phoneIn = interpolate(t, [0, 0.8], [1, 0], { ...cl, easing: ease });
  const drift = interpolate(t, [0, fin], [1, 1.045]);
  const m = interpolate(t, [0, g - 0.3, endort - 0.4, sigAt], [0, 1, 1.35, 2], cl);
  const [haut, bas] = ciel(m);
  // Le soleil (un galet d'argile) traverse le ciel
  const sx = interpolate(t, [0, fin], [150, 930]);
  const sy = 380 - Math.sin(interpolate(t, [0, fin], [0.15, 0.95]) * Math.PI) * 200;

  const ecran = (() => {
    const pk = fade(t, push, push + 0.42, inOut);
    const ins = fade(t, rowAM1, rowAM1 + 0.35, Easing.linear);
    const swap2 = fade(t, rowAM2 - 0.05, rowAM2 + 0.25, Easing.linear);
    const arr = fade(t, tapArr + 0.06, tapArr + 0.3, Easing.linear);
    return (
      <>
        {pk < 1 && (
          <div style={{ position: 'absolute', inset: 0, translate: `${-pk * SW}px 0` }}>
            <Full n="a-auj-0" />
            <Full n="a-auj-1" o={arr} />
            <Halo t={t} from={tapArr + 0.25} to={push + 0.2} r={R.aTagArrivee} />
            <Tap t={t} at={tapArr} r={R.aArrivee} />
          </div>
        )}
        {pk > 0 && (
          <div style={{ position: 'absolute', inset: 0, translate: `${(1 - pk) * SW}px 0` }}>
            {swap2 < 1 && <Swap before="a-carnet-0" after="a-carnet-1" y0={R.aLigne1.top - 6} dh={R.aCarte1.h - R.aCarte0.h} p={ins} />}
            <Full n="a-carnet-2" o={swap2} />
            <Sheet n="a-repas" t={t} up={tapRepas + 0.05} down={tapBien + 0.12} />
            <Sheet n="a-sommeil" t={t} up={tapSommeil + 0.05} down={tapEndort + 0.12} />
            <Halo t={t} from={rowAM1 + 0.35} to={tapSommeil - 0.1} r={R.aLigne1} />
            <Halo t={t} from={rowAM2 + 0.2} to={sigAt + 0.2} r={R.aDodo} />
            <Tap t={t} at={tapRepas} r={R.aRepas} />
            <Tap t={t} at={tapBien} r={R.aBienMange} />
            <Tap t={t} at={tapSommeil} r={R.aSommeil} />
            <Tap t={t} at={tapEndort} r={R.aEndort} />
          </div>
        )}
      </>
    );
  })();

  const blocs: Bloc[] = [
    { at: arrive - 0.2, end: g - 0.3, lignes: [{ at: arrive - 0.2, text: 'Adam arrive.' }] },
    { at: g - 0.25, end: mange - 0.3, lignes: [{ at: g - 0.25, text: 'Un geste, c’est noté.' }] },
    { at: mange - 0.28, end: endort - 0.3, lignes: [{ at: mange - 0.28, text: 'Il a bien mangé.' }] },
    { at: endort - 0.28, end: sigAt + 0.1, lignes: [{ at: endort - 0.28, text: 'Il s’endort,' }, { at: doux - 0.2, text: 'tout doux.', italic: true }] },
  ];

  return (
    <Frame>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${haut} 0%, ${bas} 62%)` }} />
      <div style={{ position: 'absolute', left: sx - 260, top: sy - 260, width: 520, height: 520, borderRadius: 260, background: `radial-gradient(circle, ${rgba(C.accent, 0.42)} 0%, ${rgba(C.accent, 0.16)} 38%, ${rgba(C.accent, 0)} 70%)` }} />
      <Heure t={t} etapes={[{ at: huit - 0.15, h: '8 h 00' }, { at: push + 0.1, h: '11 h 50' }, { at: tapSommeil - 0.35, h: '12 h 40' }]} />
      <Caption t={t} blocs={blocs} y={276} size={66} />
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '540px 1200px', transform: `scale(${drift})`, translate: `0 ${phoneIn * 1300}px` }}>
        <PhoneBox cx={540} top={top} S={S}>{ecran}</PhoneBox>
      </div>
      <Signature t={t} at={sigAt} fin={fin} />
      <Bande off={OFF_B} from="huit" to="doux" fin={fin} taps={[tapArr, tapRepas, tapBien, tapSommeil, tapEndort]} pops={[tapArr + 0.25, rowAM1 + 0.1, rowAM2]} />
    </Frame>
  );
};
