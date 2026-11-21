import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import { Galets } from './Galets';
import { C, F, s } from '../theme';

// Briques communes aux vidéos : vraies captures de l'app (390 × 844 points), gestes, halos, téléphone, sous-titres.
// Toutes les positions viennent des mesures des scénarios de capture : rien n'est placé à la main.

export type Rect = { left: number; top: number; w: number; h: number; x: number; y: number };
export const SW = 390;
export const SH = 844;
export const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const fade = (t: number, a: number, b: number, e: (x: number) => number = ease) => interpolate(t, [a, b], [0, 1], { ...cl, easing: e });
// Valeur par images clés [[t, v], …], avec adoucissement
export function kf(t: number, keys: [number, number][], e: (x: number) => number = inOut) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return interpolate(t, [t0, t1], [v0, v1], { ...cl, easing: e });
  }
  return keys[keys.length - 1][1];
}
export const rgba = (hex: string, a: number) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
export const mix = (a: string, b: string, k: number) => {
  const p = (h: string) => (h.startsWith('#') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : (h.match(/\d+/g) ?? []).slice(0, 3).map(Number));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};
const img = (src: string) => staticFile(`ecrans/${src}.png`);

// Capture entière (scroll : défilement d'une page longue, en points)
export const Shot: React.FC<{ src: string; o?: number; dx?: number; dy?: number; scroll?: number }> = ({ src, o = 1, dx = 0, dy = 0, scroll = 0 }) =>
  o <= 0.001 ? null : <Img src={img(src)} style={{ position: 'absolute', left: dx, top: dy - scroll, width: SW, opacity: o }} />;

// Bande d'une capture, de y0 à y1, décalée de dy
export const Band: React.FC<{ src: string; y0: number; y1: number; dy?: number; o?: number }> = ({ src, y0, y1, dy = 0, o = 1 }) => (
  <div style={{ position: 'absolute', left: 0, top: y0 + dy, width: SW, height: Math.max(0, y1 - y0), overflow: 'hidden', opacity: o }}>
    <Img src={img(src)} style={{ position: 'absolute', left: 0, top: -y0, width: SW }} />
  </div>
);

// Passage d'un état à l'autre quand une ligne s'ajoute sous y0 : le haut reste, le bas glisse de dh, sans image fantôme
export const Swap: React.FC<{ before: string; after: string; y0: number; dh: number; p: number }> = ({ before, after, y0, dh, p }) => {
  if (p <= 0) return <Shot src={before} />;
  if (p >= 1) return <Shot src={after} />;
  const e = inOut(p);
  return (
    <>
      <Band src={after} y0={0} y1={y0} />
      <Band src={before} y0={y0} y1={SH} dy={e * dh} o={1 - e} />
      <Band src={after} y0={y0} y1={SH} dy={-(1 - e) * dh} o={e} />
    </>
  );
};

// Fondu simple entre deux captures
export const Cross: React.FC<{ a: string; b: string; p: number; scrollA?: number; scrollB?: number }> = ({ a, b, p, scrollA = 0, scrollB = 0 }) => (
  <>
    {p < 1 && <Shot src={a} scroll={scrollA} />}
    {p > 0 && <Shot src={b} o={p} scroll={scrollB} />}
  </>
);

// Glissement latéral d'un écran à l'autre (changement d'onglet ou de page)
export const Push: React.FC<{ p: number; children: [React.ReactNode, React.ReactNode] }> = ({ p, children }) => {
  const e = inOut(p);
  return (
    <>
      {p < 1 && <div style={{ position: 'absolute', inset: 0, translate: `${-e * SW * 0.3}px 0`, opacity: 1 - e * 0.4 }}>{children[0]}</div>}
      {p > 0 && <div style={{ position: 'absolute', inset: 0, translate: `${(1 - e) * SW}px 0`, boxShadow: '-12px 0 30px rgba(0,0,0,0.12)' }}>{children[1]}</div>}
    </>
  );
};

// Feuille qui monte : voile sur l'écran, puis le panneau de la capture « feuille ouverte » glisse du bas (top : haut mesuré de la feuille)
export const Sheet: React.FC<{ src: string; top: number; t: number; up: number; down: number }> = ({ src, top, t, up, down }) => {
  const k = fade(t, up, up + 0.34) * (1 - fade(t, down, down + 0.28, Easing.bezier(0.5, 0, 0.75, 0)));
  if (k <= 0.001) return null;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: rgba(C.ink, 0.45 * Math.min(1, k * 1.4)) }} />
      <div style={{ position: 'absolute', left: 0, top: top + (1 - k) * (SH - top), width: SW, height: SH - top, overflow: 'hidden', borderRadius: '20px 20px 0 0' }}>
        <Img src={img(src)} style={{ position: 'absolute', left: 0, top: -top, width: SW }} />
      </div>
    </>
  );
};

// Doigt qui touche (r : rectangle de l'élément ; dy : décalage dû au défilement)
export const Tap: React.FC<{ t: number; at: number; r: Rect; dy?: number }> = ({ t, at, r, dy = 0 }) => {
  const a = interpolate(t, [at - 0.4, at - 0.12], [0, 1], cl) * (1 - fade(t, at + 0.3, at + 0.55));
  if (a <= 0) return null;
  const press = interpolate(t, [at - 0.1, at, at + 0.14], [1, 0.8, 1], cl);
  const wave = fade(t, at, at + 0.6);
  const d = 46;
  return (
    <div style={{ position: 'absolute', left: r.x, top: r.y + dy, opacity: a }}>
      <div style={{ position: 'absolute', left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d, background: rgba(C.ink, 0.28), border: '2.5px solid rgba(255,255,255,0.95)', scale: String(press), boxShadow: '0 6px 14px -4px rgba(0,0,0,0.3)' }} />
      {t >= at && <div style={{ position: 'absolute', left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d, border: `3.5px solid ${C.accent}`, scale: String(1 + wave * 1.5), opacity: 1 - wave }} />}
    </div>
  );
};

// Halo doux autour d'un élément
export const Halo: React.FC<{ t: number; from: number; to: number; r: Rect; pad?: number; dy?: number; couleur?: string }> = ({ t, from, to, r, pad = 4, dy = 0, couleur = C.accent }) => {
  const k = fade(t, from, from + 0.35) * (1 - fade(t, to - 0.3, to));
  if (k <= 0.001) return null;
  const pulse = 0.5 + 0.5 * Math.sin((t - from) * 5);
  return (
    <div style={{ position: 'absolute', left: r.left - pad, top: r.top - pad + dy, width: r.w + pad * 2, height: r.h + pad * 2, borderRadius: 14, border: `2.5px solid ${couleur}`, boxShadow: `0 0 ${10 + pulse * 10}px ${rgba(couleur, 0.35 + pulse * 0.2)}`, background: rgba(couleur, 0.06 * k), opacity: k }} />
  );
};

// Téléphone : cadre basalte, écran à l'échelle S, centré en cx
export const PhoneBox: React.FC<{ cx: number; top: number; S: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ cx, top, S, children, style }) => {
  const B = 12 * S;
  return (
    <div style={{ position: 'absolute', left: cx - (SW * S) / 2 - B, top: top - B, width: SW * S + 2 * B, height: SH * S + 2 * B, borderRadius: 52 * S, background: C.ink, boxShadow: '0 50px 90px -40px rgba(30,32,29,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset', ...style }}>
      <div style={{ position: 'absolute', left: B, top: B, width: SW * S, height: SH * S, borderRadius: 42 * S, overflow: 'hidden', background: C.bg }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, transformOrigin: '0 0', transform: `scale(${S})` }}>{children}</div>
      </div>
    </div>
  );
};

// Sous-titres animés mot à mot (lisibles sans le son)
export type Ligne = { at: number; text: string; italic?: boolean };
export type Bloc = { at: number; end: number; lignes: Ligne[] };
export const Caption: React.FC<{ t: number; blocs: Bloc[]; y: number; size: number; couleur?: string; accent?: string; gauche?: number; droite?: number }> = ({ t, blocs, y, size, couleur = C.ink, accent = C.accentInk, gauche = 60, droite = 60 }) => (
  <>
    {blocs.map((b, i) => {
      const out = fade(t, b.end - 0.22, b.end, inOut);
      if (t < b.at - 0.05 || out >= 1) return null;
      return (
        <div key={i} style={{ position: 'absolute', left: gauche, right: droite, top: y, textAlign: 'center', fontFamily: F.display, fontWeight: 600, fontSize: size, lineHeight: 1.06, color: couleur, opacity: 1 - out, translate: `0 ${-out * 30}px` }}>
          {b.lignes.map((l, j) => (
            <div key={j}>
              {l.text.split(' ').map((w, k) => {
                const a = fade(t, l.at + k * 0.08, l.at + k * 0.08 + 0.45);
                return (
                  <span key={k} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.1em', marginRight: '0.24em' }}>
                    <span style={{ display: 'inline-block', translate: `0 ${(1 - a) * 100}%`, fontStyle: l.italic ? 'italic' : 'normal', fontWeight: l.italic ? 400 : 600, color: l.italic ? accent : couleur }}>{w}</span>
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

// Message envoyé (le vrai texte partagé par l'app), qui monte au-dessus de l'écran
export const Bulle: React.FC<{ t: number; from: number; to: number; titre: string; texte: string; x: number; y: number; w: number; size?: number }> = ({ t, from, to, titre, texte, x, y, w, size = 30 }) => {
  const k = fade(t, from, from + 0.45) * (1 - fade(t, to - 0.3, to, inOut));
  if (k <= 0.001) return null;
  const lignes = texte.split('\n').filter((l) => l.trim()).slice(0, 9);
  return (
    <div style={{ position: 'absolute', left: x, top: y + (1 - k) * 80, width: w, opacity: k, scale: String(0.94 + 0.06 * k), background: C.surface, borderRadius: 28, padding: '26px 30px', boxShadow: '0 40px 80px -30px rgba(30,32,29,0.55)', border: `2px solid ${C.border}`, fontFamily: F.body }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontWeight: 700, fontSize: size * 0.9, color: C.ink, marginBottom: 12 }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: C.ok }} />{titre}
      </div>
      {lignes.map((l, i) => (
        <div key={i} style={{ fontSize: size * 0.8, lineHeight: 1.35, color: i === 0 ? C.ink : C.muted, opacity: fade(t, from + 0.2 + i * 0.07, from + 0.5 + i * 0.07) }}>{l}</div>
      ))}
    </div>
  );
};

// Signature finale : le logo de l'app s'assemble, le nom, la phrase
export const Signature: React.FC<{ t: number; at: number; fin: number; phrase: string }> = ({ t, at, fin, phrase }) => {
  const k = fade(t, at, at + 0.6);
  if (k <= 0) return null;
  const out = fade(t, fin - 0.35, fin, Easing.linear);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: rgba(C.bg, 0.9 * k), opacity: 1 - out }}>
      <div style={{ translate: `0 ${(1 - k) * 40}px`, opacity: k, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Galets size={190} start={s(at)} />
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 84, letterSpacing: '0.18em', marginTop: 26, color: C.ink }}>ARVELA</div>
        <div style={{ fontFamily: F.display, fontStyle: 'italic', fontSize: 46, color: C.muted, marginTop: 6 }}>{phrase}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 1 }) =>
  at < 0 ? null : (
    <Sequence from={s(at)} durationInFrames={s(2.2)} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );

// Un passage de voix : le fichier de de à jusqua (secondes du fichier), joué à partir de at (secondes de la vidéo)
export type Piste = { fichier: string; at: number; de?: number; jusqua?: number };
export const Voix: React.FC<{ p: Piste }> = ({ p }) => {
  const de = Math.max(0, p.de ?? 0);
  return (
    <Sequence from={s(p.at)} durationInFrames={p.jusqua ? s(p.jusqua - de) : undefined} layout="none">
      <Audio src={staticFile(p.fichier)} trimBefore={de ? s(de) : undefined} />
    </Sequence>
  );
};

// Musique sous la voix : plus basse quand la voix parle, fondue à l'entrée et à la sortie
export const Musique: React.FC<{ fichier: string; depart: number; fin: number; pistes: Piste[]; niveau?: number; fps: number }> = ({ fichier, depart, fin, pistes, niveau = 0.2, fps }) => (
  <Audio
    src={staticFile(fichier)}
    trimBefore={s(depart)}
    volume={(f: number) => {
      const t = f / fps;
      const parle = pistes.some((p) => t > p.at - 0.2 && t < p.at + ((p.jusqua ?? p.at + 99) - (p.de ?? 0)) + 0.2);
      return niveau * Math.min(1, t / 0.8) * Math.max(0, Math.min(1, (fin - t) / 1.2)) * (parle ? 0.6 : 1);
    }}
  />
);

// Sous-titres tirés des phrases mesurées dans la voix (reperes.phrases) : une phrase par bloc,
// coupée en lignes courtes aux virgules ou deux-points ; chaque ligne apparaît au moment où elle est dite.
export type Phrase = { texte: string; debut: number; fin: number };
export function blocsDepuisPhrases(phrases: Phrase[], offset: number, opts: { italique?: string[]; max?: number; finDernier?: number } = {}): Bloc[] {
  const max = opts.max ?? 24;
  return phrases.map((p, i) => {
    const morceaux: string[] = [];
    for (const m of p.texte.split(/(?<=[,:])\s+/)) {
      const dernier = morceaux[morceaux.length - 1];
      if (dernier && (dernier + ' ' + m).length <= max) morceaux[morceaux.length - 1] = dernier + ' ' + m;
      else morceaux.push(m);
    }
    let pos = 0;
    const lignes: Ligne[] = morceaux.map((m) => {
      const at = p.debut + offset - 0.2 + (pos / Math.max(1, p.texte.length)) * (p.fin - p.debut);
      pos += m.length + 1;
      return { at, text: m, italic: (opts.italique ?? []).some((x) => m.includes(x)) };
    });
    const suivante = phrases[i + 1];
    const end = suivante ? suivante.debut + offset - 0.25 : (opts.finDernier ?? p.fin + offset + 0.8);
    return { at: lignes[0].at, end, lignes };
  });
}
