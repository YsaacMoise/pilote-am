import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Galets } from '../components/Galets';
import { K, Layer, Phone } from '../components/Phone';
import { Reveal } from '../components/Reveal';
import { C, F } from '../theme';

// Tutoriel piloté par des données : vrais écrans, caméra qui suit l'action, écrans qui glissent,
// projecteur sur l'élément expliqué, doigt, bulles, en-tête de chapitre, signature.
// Le temps t de la scène est celui du fichier de voix principal (t = 0 au début du fichier) ;
// la vidéo le joue à partir de v0 (temps vidéo = t + v0).
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

export type Trans = 'fondu' | 'pousse' | 'retour' | 'monte';
export type Plan = { img: string; from: number; to: number; scroll?: [number, number][]; tabbar?: string; trans?: Trans };
export type Mark = { r: R; from: number; to: number; label?: string; below?: boolean; scroll?: [number, number][]; spot?: boolean };
export type Tap = { at: number; x: number; y: number };
export type Chap = { from: number; to: number; n: string; name: string; title: string; note?: string; noteAt?: number };
export type Bulle = { from: number; to: number; kind: 'message' | 'pastille'; titre?: string; lignes: string[]; y?: number };
export type Frappe = { from: number; to: number; texte: string; r: R };
export type TutoCfg = {
  debut: number; // le téléphone est en place
  plans: Plan[];
  marks: Mark[];
  taps: Tap[];
  chaps: Chap[];
  bulles?: Bulle[];
  frappe?: Frappe;
  cam: [number, number, number][]; // [t, zoom, point d'écran visé en hauteur]
  fin: number; // début de la signature
};

const DUREE_TRANS = 0.42;

function layers(cfg: TutoCfg, t: number): Layer[] {
  const L: Layer[] = [];
  cfg.plans.forEach((p, i) => {
    const suivant = cfg.plans[i + 1];
    const tr = p.trans ?? 'fondu';
    const k = interpolate(t, [p.from, p.from + DUREE_TRANS], [0, 1], { ...cl, easing: out });
    // Sortie : selon la façon dont le plan suivant arrive
    const ts = suivant?.trans ?? 'fondu';
    const ks = suivant ? interpolate(t, [suivant.from, suivant.from + DUREE_TRANS], [0, 1], { ...cl, easing: out }) : 0;
    if (t < p.from - 0.001 && i > 0) return;
    if (suivant && t > suivant.from + (ts === 'fondu' ? 0.25 : DUREE_TRANS)) return;
    const l: Layer = { img: p.img, opacity: 1, scroll: p.scroll ? kf(t, p.scroll) : 0, tabbarFrom: p.tabbar };
    if (i > 0) {
      if (tr === 'fondu') { l.opacity = fade(t, p.from, p.from + 0.25); }
      if (tr === 'pousse') l.dx = (1 - k) * 390;
      if (tr === 'retour') l.dx = -(1 - k) * 390;
      if (tr === 'monte') l.dy = (1 - k) * 844;
    }
    if (suivant && t >= suivant.from) {
      if (ts === 'pousse') { l.dx = -ks * 110; l.voile = ks * 0.25; }
      if (ts === 'retour') { l.dx = ks * 110; l.voile = ks * 0.25; }
      if (ts === 'monte') { l.voile = ks * 0.3; }
    }
    L.push(l);
  });
  return L;
}

const Pastille: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 30 }) => (
  <div style={{ whiteSpace: 'nowrap', background: C.ink, color: C.bg, fontFamily: F.body, fontWeight: 650, fontSize: size, padding: '12px 24px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 16px 30px -12px rgba(30,32,29,0.5)' }}>
    <span style={{ width: 12, height: 12, borderRadius: 6, background: C.accent }} />{children}
  </div>
);

export const Tuto: React.FC<{ cfg: TutoCfg; v0: number }> = ({ cfg, v0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - v0;
  const fin = cfg.fin;
  const at = (sec: number) => frame - Math.round((sec + v0) * fps);
  if (t < cfg.debut - 1.0) return null;

  // Caméra : zoom et cible, plus une légère respiration et un flottement en 3D
  const zk = cfg.cam.map(([a, z]) => [a, z] as [number, number]);
  const fk = cfg.cam.map(([a, , f]) => [a, f] as [number, number]);
  const z0 = kf(t, [...zk, [fin - 0.5, kf(fin - 0.5, zk)], [fin, 0.6]]);
  const z = z0 * (1 + 0.012 * Math.sin((t * 2 * Math.PI) / 5.6));
  const fy = kf(t, fk);
  const cy = kf(t, [[0, 1085], [fin - 0.5, 1085], [fin, 760]]);
  const enter = interpolate(t, [cfg.debut - 1.0, cfg.debut], [1, 0], { ...cl, easing: out });
  const leave = interpolate(t, [fin - 0.4, fin + 0.1], [1, 0], cl);
  const ry = 3.2 * Math.sin((t * 2 * Math.PI) / 7.3) + enter * -14;
  const rx = 1.6 * Math.sin((t * 2 * Math.PI) / 9.1 + 1) + enter * 22;
  const ox = 540 - 195 * K * z;
  const oy = cy - fy * K * z + enter * 1700;
  const map = (x: number, y: number) => ({ x: ox + x * K * z, y: oy + y * K * z });
  const enScene = t >= cfg.debut - 0.3;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ perspective: 2600, perspectiveOrigin: '540px 900px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${ox}px, ${oy}px) scale(${z})`, opacity: leave }}>
          <div style={{ transformOrigin: `${195 * K}px ${fy * K}px`, transform: `rotateY(${ry}deg) rotateX(${rx}deg)` }}>
            <Phone
              layers={layers(cfg, t)}
              overlay={
                <>
                  {cfg.frappe && t >= cfg.frappe.from && t < cfg.frappe.to + 0.4 && (() => {
                    const f = cfg.frappe!;
                    const n = Math.floor(interpolate(t, [f.from, f.to], [0, f.texte.length], cl));
                    return (
                      <div style={{ position: 'absolute', left: (f.r.left + 16) * K, top: f.r.top * K, height: f.r.h * K, display: 'flex', alignItems: 'center', fontFamily: F.mono, fontSize: 30 * K, letterSpacing: 10 * K, color: C.ink, opacity: 1 - fade(t, f.to + 0.1, f.to + 0.4) }}>
                        {f.texte.slice(0, n)}<span style={{ width: 3 * K, height: 34 * K, background: C.accent, opacity: Math.floor(t * 3) % 2 ? 1 : 0.2, marginLeft: 4 }} />
                      </div>
                    );
                  })()}
                  {cfg.marks.map((m, i) => {
                    const k = spring({ frame: at(m.from), fps, config: { damping: 14, stiffness: 160 } });
                    const o = Math.min(fade(t, m.from, m.from + 0.2), 1 - fade(t, m.to - 0.25, m.to));
                    if (o <= 0) return null;
                    const sc = m.scroll ? kf(t, m.scroll) : 0;
                    const r = m.r;
                    const spot = m.spot !== false;
                    const kl = spring({ frame: at(m.from + 0.12), fps, config: { damping: 11, stiffness: 200 } });
                    return (
                      <div key={i} style={{ position: 'absolute', left: r.left * K, top: (r.top - sc) * K, width: r.w * K, height: r.h * K, opacity: o }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * K, border: '4px solid ' + C.accent, boxShadow: `${spot ? `0 0 0 4000px rgba(30,32,29,${0.4 * k}), ` : ''}0 0 0 ${interpolate(k, [0, 1], [30, 6])}px rgba(200,125,85,${0.2 * (1 - k) + 0.12})`, scale: String(interpolate(k, [0, 1], [1.12, 1])) }} />
                        {m.label && (
                          <div style={{ position: 'absolute', left: '50%', [m.below ? 'top' : 'bottom']: '100%', translate: `-50% ${m.below ? 16 : -16}px`, scale: String(interpolate(kl, [0, 1], [0.6, 1])), opacity: Math.min(1, kl * 1.4) }}>
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
        </div>
      </AbsoluteFill>

      {enScene && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420, opacity: Math.min(fade(t, cfg.debut - 0.3, cfg.debut), 1 - fade(t, fin - 0.4, fin - 0.1)), background: 'linear-gradient(180deg, #F7F4EF 0%, #F7F4EF 66%, rgba(247,244,239,0) 100%)' }} />}
      {cfg.chaps.map((c) => {
        const o = Math.min(fade(t, c.from, c.from + 0.25), 1 - fade(t, c.to - 0.3, c.to));
        if (o <= 0) return null;
        const sortie = fade(t, c.to - 0.3, c.to);
        return (
          <div key={c.n} style={{ position: 'absolute', top: 96, left: 40, right: 40, textAlign: 'center', opacity: o, translate: `0 ${-sortie * 30}px` }}>
            <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 30, letterSpacing: 7, color: C.accentInk }}>
              <Reveal at={c.from + v0}>{`${c.n} · ${c.name.toUpperCase()}`}</Reveal>
            </div>
            <div style={{ marginTop: 10, fontFamily: F.display, fontWeight: 600, fontSize: 88, lineHeight: 1.05, color: C.ink }}>
              <Reveal at={c.from + v0 + 0.1}>{c.title}</Reveal>
            </div>
            {c.note && <div style={{ marginTop: 14, fontFamily: F.body, fontWeight: 500, fontSize: 30, color: C.muted, opacity: fade(t, c.noteAt ?? c.from + 0.6, (c.noteAt ?? c.from + 0.6) + 0.4) }}>{c.note}</div>}
          </div>
        );
      })}

      {cfg.taps.map((p, i) => {
        const a = interpolate(t, [p.at - 0.4, p.at - 0.12], [0, 1], cl) * (1 - fade(t, p.at + 0.35, p.at + 0.6));
        if (a <= 0) return null;
        const vient = interpolate(t, [p.at - 0.4, p.at - 0.08], [1, 0], { ...cl, easing: out });
        const press = interpolate(t, [p.at - 0.1, p.at, p.at + 0.15], [1, 0.8, 1], cl);
        const wave = fade(t, p.at, p.at + 0.55);
        const pt = map(p.x, p.y);
        return (
          <div key={i} style={{ position: 'absolute', left: pt.x + vient * 90, top: pt.y + vient * 160, opacity: a }}>
            <div style={{ position: 'absolute', left: -42, top: -42, width: 84, height: 84, borderRadius: 42, background: 'rgba(30,32,29,0.32)', border: '4px solid rgba(255,255,255,0.95)', scale: String(press), boxShadow: '0 10px 24px -6px rgba(0,0,0,0.35)' }} />
            {t >= p.at && <div style={{ position: 'absolute', left: -42, top: -42, width: 84, height: 84, borderRadius: 42, border: `6px solid ${C.accent}`, scale: String(1 + wave * 1.8), opacity: 1 - wave }} />}
          </div>
        );
      })}

      {(cfg.bulles ?? []).map((b, i) => {
        const k = spring({ frame: at(b.from), fps, config: { damping: 14, stiffness: 150 } });
        const kout = interpolate(t, [b.to - 0.4, b.to], [0, 1], { ...cl, easing: Easing.in(Easing.cubic) });
        if (t < b.from || kout >= 1) return null;
        const y = b.y ?? 470;
        if (b.kind === 'pastille') {
          return (
            <div key={i} style={{ position: 'absolute', left: 540, top: y, translate: '-50% -50%', opacity: Math.min(1, k * 1.4) * (1 - kout), scale: String(interpolate(k, [0, 1], [0.6, 1])) }}>
              <Pastille size={40}>{b.lignes[0]}</Pastille>
            </div>
          );
        }
        return (
          <div key={i} style={{ position: 'absolute', left: 80, right: 80, top: y, opacity: Math.min(1, k * 1.3), translate: `${kout * 1100}px ${(1 - k) * 260 - kout * 300}px`, rotate: `${interpolate(k, [0, 1], [-4, 0]) + kout * 10}deg`, background: C.surface, borderRadius: 44, padding: '30px 36px', boxShadow: '0 50px 90px -30px rgba(30,32,29,0.55), 0 0 0 2px rgba(30,32,29,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: C.accent, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: F.body, fontWeight: 700, fontSize: 30 }}>✉</div>
              <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: 34, color: C.ink }}>{b.titre}</div>
              <div style={{ marginLeft: 'auto', fontFamily: F.body, fontWeight: 600, fontSize: 26, color: C.ok, opacity: fade(t, b.from + 0.9, b.from + 1.2) }}>Envoyé ✓</div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {b.lignes.map((l, j) => (
                <div key={j} style={{ fontFamily: F.body, fontWeight: 500, fontSize: 30, lineHeight: 1.3, color: j === 0 ? C.ink : C.muted, opacity: fade(t, b.from + 0.15 + j * 0.09, b.from + 0.4 + j * 0.09), translate: `0 ${(1 - fade(t, b.from + 0.15 + j * 0.09, b.from + 0.4 + j * 0.09)) * 14}px` }}>{l}</div>
              ))}
            </div>
          </div>
        );
      })}

      {t > fin - 0.1 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Galets size={380} start={Math.round((fin + v0 + 0.05) * fps)} pearlFrom={-70} />
          <div style={{ marginTop: 24, fontFamily: F.display, fontWeight: 600, fontSize: 124, color: C.ink, letterSpacing: interpolate(t, [fin + 0.25, fin + 1.1], [70, 32], { ...cl, easing: out }), paddingLeft: 32, opacity: fade(t, fin + 0.25, fin + 0.7) }}>ARVELA</div>
          <div style={{ marginTop: 18, fontFamily: F.display, fontStyle: 'italic', fontWeight: 400, fontSize: 64, color: C.ink, textAlign: 'center', lineHeight: 1.15 }}>
            <Reveal at={fin + v0 + 1.15}>Le carnet de bord</Reveal><br />
            <Reveal at={fin + v0 + 1.4}>des assistantes maternelles.</Reveal>
          </div>
          <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, opacity: fade(t, fin + 2.6, fin + 3.1) }}>
            <span style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 34, letterSpacing: 10, color: C.accentInk }}>ARVELA.FR</span>
            <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: 34, color: C.muted }}>Gratuit pendant la phase de test</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
