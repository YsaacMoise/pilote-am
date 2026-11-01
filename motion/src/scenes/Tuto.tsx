import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Galets } from '../components/Galets';
import { K, Layer, Phone } from '../components/Phone';
import { Reveal } from '../components/Reveal';
import { C, F } from '../theme';

// Tutoriel court, piloté par des données : écrans réels, repères, doigt, bulles, en-tête de chapitre, signature.
// Le temps t de la scène est celui de la voix (t = 0 au début du fichier son).
const ease = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export function kf(t: number, keys: [number, number][], e = ease) {
  if (!keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return interpolate(t, [keys[i - 1][0], keys[i][0]], [keys[i - 1][1], keys[i][1]], { ...cl, easing: e });
  }
  return keys[keys.length - 1][1];
}
const fade = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], cl);

export type R = { left: number; top: number; w: number; h: number };
export type Rect = R & { x: number; y: number };
export const pad = (r: R, p = 6): R => ({ left: r.left - p, top: r.top - p, w: r.w + p * 2, h: r.h + p * 2 });

export type Plan = { img: string; from: number; to: number; scroll?: [number, number][]; tabbar?: string; monte?: boolean };
export type Mark = { r: R; from: number; to: number; label?: string; below?: boolean; right?: boolean; scroll?: [number, number][] };
export type Tap = { at: number; x: number; y: number };
export type Chap = { from: number; to: number; n: string; name: string; title: string; note?: string; noteAt?: number };
export type Bulle = { from: number; to: number; kind: 'message' | 'appel' | 'pastille'; titre?: string; lignes: string[]; y?: number };
export type Frappe = { from: number; to: number; texte: string; r: R };
export type TutoCfg = {
  plans: Plan[];
  marks: Mark[];
  taps: Tap[];
  chaps: Chap[];
  bulles?: Bulle[];
  frappe?: Frappe;
  zoom: [number, number][];
  focus: [number, number][];
  fin: number; // début de la signature
  devise?: [string, string];
};

function layers(cfg: TutoCfg, t: number): Layer[] {
  const L: Layer[] = [];
  for (const p of cfg.plans) {
    if (p.monte) {
      // Écran qui monte du bas, comme une page qui s'ouvre
      const k = interpolate(t, [p.from, p.from + 0.45], [1, 0], { ...cl, easing: out });
      const o = 1 - fade(t, p.to, p.to + 0.22);
      if (t >= p.from && o > 0) L.push({ img: p.img, opacity: o, dy: k * 844, scroll: p.scroll ? kf(t, p.scroll) : 0, tabbarFrom: p.tabbar });
      continue;
    }
    const o = Math.min(fade(t, p.from, p.from + 0.22), 1 - fade(t, p.to, p.to + 0.22));
    if (o > 0) L.push({ img: p.img, opacity: o, scroll: p.scroll ? kf(t, p.scroll) : 0, tabbarFrom: p.tabbar });
  }
  return L;
}

const Pastille: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 30 }) => (
  <div style={{ whiteSpace: 'nowrap', background: C.ink, color: C.bg, fontFamily: F.body, fontWeight: 650, fontSize: size, padding: '10px 22px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 16px 30px -12px rgba(30,32,29,0.5)' }}>
    <span style={{ width: 12, height: 12, borderRadius: 6, background: C.accent }} />{children}
  </div>
);

export const Tuto: React.FC<{ cfg: TutoCfg; v0: number }> = ({ cfg, v0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - v0;
  const fin = cfg.fin;

  const z = kf(t, [...cfg.zoom, [fin - 0.5, kf(fin - 0.5, cfg.zoom)], [fin, 0.6]]);
  const fy = kf(t, cfg.focus);
  const cy = kf(t, [[0, 1085], [fin - 0.5, 1085], [fin, 760]]);
  const enter = interpolate(t, [-v0, -v0 + 0.95], [1, 0], { ...cl, easing: out });
  const leave = interpolate(t, [fin - 0.4, fin + 0.1], [1, 0], cl);
  const ox = 540 - 195 * K * z;
  const oy = cy - fy * K * z + enter * 1500;
  const map = (x: number, y: number) => ({ x: ox + x * K * z, y: oy + y * K * z });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${ox}px, ${oy}px) scale(${z})`, opacity: leave }}>
        <Phone
          layers={layers(cfg, t)}
          overlay={
            <>
              {cfg.frappe && t >= cfg.frappe.from && t < cfg.frappe.to + 0.3 && (() => {
                const f = cfg.frappe!;
                const n = Math.floor(interpolate(t, [f.from, f.to], [0, f.texte.length], cl));
                return (
                  <div style={{ position: 'absolute', left: (f.r.left + 16) * K, top: f.r.top * K, height: f.r.h * K, display: 'flex', alignItems: 'center', fontFamily: F.mono, fontSize: 30 * K, letterSpacing: 10 * K, color: C.ink, opacity: 1 - fade(t, f.to, f.to + 0.3) }}>
                    {f.texte.slice(0, n)}<span style={{ width: 3 * K, height: 34 * K, background: C.accent, opacity: Math.floor(t * 3) % 2 ? 1 : 0.2, marginLeft: 4 }} />
                  </div>
                );
              })()}
              {cfg.marks.map((m, i) => {
                const k = interpolate(t, [m.from, m.from + 0.35], [0, 1], { ...cl, easing: out });
                const o = Math.min(k, 1 - fade(t, m.to - 0.25, m.to));
                if (o <= 0) return null;
                const sc = m.scroll ? kf(t, m.scroll) : 0;
                const r = m.r;
                return (
                  <div key={i} style={{ position: 'absolute', left: r.left * K, top: (r.top - sc) * K, width: r.w * K, height: r.h * K, opacity: o }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * K, border: '3.5px solid ' + C.accent, boxShadow: `0 0 0 ${interpolate(k, [0, 1], [24, 6])}px rgba(200,125,85,${0.18 * (1 - k) + 0.1})`, scale: String(interpolate(k, [0, 1], [1.08, 1])) }} />
                    {m.label && (
                      <div style={{ position: 'absolute', ...(m.right ? { right: 18, top: '50%', translate: '0 -50%' } : { left: '50%', [m.below ? 'top' : 'bottom']: '100%', translate: `-50% ${m.below ? 14 : -14}px` }) }}>
                        <Pastille>{m.label}</Pastille>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          }
        />
      </div>

      {/* Voile albâtre derrière l'en-tête */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420, opacity: 1 - fade(t, fin - 0.4, fin - 0.1), background: 'linear-gradient(180deg, #F7F4EF 0%, #F7F4EF 66%, rgba(247,244,239,0) 100%)' }} />
      {cfg.chaps.map((c) => {
        const o = Math.min(fade(t, c.from, c.from + 0.3), 1 - fade(t, c.to - 0.3, c.to));
        if (o <= 0) return null;
        return (
          <div key={c.n} style={{ position: 'absolute', top: 96, left: 40, right: 40, textAlign: 'center', opacity: o }}>
            <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 30, letterSpacing: 7, color: C.accentInk }}>
              <Reveal at={c.from + v0 + 0}>{`${c.n} · ${c.name.toUpperCase()}`}</Reveal>
            </div>
            <div style={{ marginTop: 10, fontFamily: F.display, fontWeight: 600, fontSize: 88, lineHeight: 1.05, color: C.ink }}>
              <Reveal at={c.from + v0 + 0.1}>{c.title}</Reveal>
            </div>
            {c.note && <div style={{ marginTop: 14, fontFamily: F.body, fontWeight: 500, fontSize: 30, color: C.muted, opacity: fade(t, c.noteAt ?? c.from + 0.6, (c.noteAt ?? c.from + 0.6) + 0.4) }}>{c.note}</div>}
          </div>
        );
      })}

      {/* Doigt */}
      {cfg.taps.map((p, i) => {
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

      {/* Bulles : message envoyé, appel, pastille */}
      {(cfg.bulles ?? []).map((b, i) => {
        const kin = interpolate(t, [b.from, b.from + 0.5], [0, 1], { ...cl, easing: out });
        const kout = interpolate(t, [b.to - 0.35, b.to], [0, 1], { ...cl, easing: ease });
        if (kin <= 0 || kout >= 1) return null;
        const y = b.y ?? 470;
        if (b.kind === 'pastille') {
          return (
            <div key={i} style={{ position: 'absolute', left: 540, top: y, translate: '-50% -50%', opacity: kin * (1 - kout), scale: String(interpolate(kin, [0, 1], [0.85, 1])) }}>
              <Pastille size={38}>{b.lignes[0]}</Pastille>
            </div>
          );
        }
        const appel = b.kind === 'appel';
        return (
          <div key={i} style={{ position: 'absolute', left: 90, right: 90, top: y, opacity: kin * (1 - kout), translate: `0 ${(1 - kin) * 80 - kout * 160}px`, scale: String(interpolate(kin, [0, 1], [0.94, 1]) - kout * 0.08), background: C.surface, borderRadius: 44, padding: '30px 36px', boxShadow: '0 50px 90px -30px rgba(30,32,29,0.55), 0 0 0 2px rgba(30,32,29,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: appel ? C.ok : C.accent, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: F.body, fontWeight: 700, fontSize: 30, scale: appel ? String(1 + 0.08 * Math.sin(t * 9)) : '1' }}>
                {appel ? '✆' : '✉'}
              </div>
              <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: 34, color: C.ink }}>{b.titre}</div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {b.lignes.map((l, j) => (
                <div key={j} style={{ fontFamily: l.startsWith('•') ? F.body : F.body, fontWeight: 500, fontSize: 30, lineHeight: 1.3, color: j === 0 ? C.ink : C.muted, opacity: fade(t, b.from + 0.25 + j * 0.12, b.from + 0.55 + j * 0.12) }}>{l}</div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Signature */}
      {t > fin - 0.1 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Galets size={380} start={Math.round((fin + v0 + 0.05) * fps)} pearlFrom={-70} />
          <div style={{ marginTop: 24, fontFamily: F.display, fontWeight: 600, fontSize: 124, color: C.ink, letterSpacing: interpolate(t, [fin + 0.3, fin + 1.2], [70, 32], { ...cl, easing: out }), paddingLeft: 32, opacity: fade(t, fin + 0.3, fin + 0.8) }}>ARVELA</div>
          <div style={{ marginTop: 18, fontFamily: F.display, fontStyle: 'italic', fontWeight: 400, fontSize: 64, color: C.ink, textAlign: 'center', lineHeight: 1.15 }}>
            <Reveal at={fin + v0 + 1.15}>{(cfg.devise ?? ['Le carnet de bord', 'des assistantes maternelles.'])[0]}</Reveal><br />
            <Reveal at={fin + v0 + 1.35}>{(cfg.devise ?? ['Le carnet de bord', 'des assistantes maternelles.'])[1]}</Reveal>
          </div>
          <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, opacity: fade(t, fin + 2.2, fin + 2.7) }}>
            <span style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 34, letterSpacing: 10, color: C.accentInk }}>ARVELA.FR</span>
            <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: 34, color: C.muted }}>Gratuit pendant la phase de test</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export const tapsOf = (cfg: TutoCfg) => cfg.taps.map((x) => x.at);
export const marksOf = (cfg: TutoCfg) => cfg.marks.map((m) => m.from);
