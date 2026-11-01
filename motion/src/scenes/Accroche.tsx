import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Galets } from '../components/Galets';
import { Reveal } from '../components/Reveal';
import { C, F } from '../theme';

// Accroche des tutoriels, dans l'esprit de l'ouverture de « Une journée avec Arvela » :
// mots qui tombent avec leur valeur, phrase choc soulignée à la main, la perle tombe,
// l'argile envahit l'écran, l'albâtre revient en cercle avec le logo et la promesse.
// Tous les temps sont en secondes de vidéo.
export type AccrocheCfg = {
  appel?: { from: number; to: number; question: { t: number; lignes: string[] } };
  mots?: { w: string; t: number; chip?: string }[];
  bulles?: { texte: string; t: number }[];
  intro?: { t: number; texte: string };
  punch?: { t: number; texte: string };
  chute: number; // la perle commence à tomber ; impact 0,38 s plus tard
  phrases: { t: number; texte: string; italique?: boolean }[];
  fin: number;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const io = Easing.bezier(0.65, 0, 0.35, 1);
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const Accroche: React.FC<{ cfg: AccrocheCfg }> = ({ cfg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const at = (sec: number) => frame - Math.round(sec * fps);
  if (t > cfg.fin + 0.1) return null;

  const impact = cfg.chute + 0.38;
  const revele = impact + 0.45;
  const avant = t < impact + 0.42;
  const debutMots = cfg.appel ? cfg.appel.to : 0;
  const cam = interpolate(t, [debutMots, impact], [1, 1.07], cl);
  const recul = cfg.intro ? interpolate(t, [cfg.intro.t - 0.1, cfg.intro.t + 0.7], [0, 1], { ...cl, easing: ease }) : 0;
  const chute = interpolate(t, [cfg.chute, impact], [0, 1], { ...cl, easing: Easing.in(Easing.cubic) });
  const etale = interpolate(t, [impact, impact + 0.42], [0, 1], { ...cl, easing: io });
  const ouvre = interpolate(t, [revele - 0.1, revele + 0.5], [0, 1], { ...cl, easing: io });
  const sortie = interpolate(t, [cfg.fin - 0.7, cfg.fin], [0, 1], { ...cl, easing: io });

  return (
    <AbsoluteFill>
      {avant && (
        <AbsoluteFill style={{ scale: String(cam) }}>
          {/* Appel entrant : la carte sonne, puis la question tombe */}
          {cfg.appel && t < cfg.appel.to + 0.6 && (() => {
            const a = cfg.appel!;
            const k = spring({ frame: at(a.from), fps, config: { damping: 15, stiffness: 120 } });
            const part = interpolate(t, [a.to - 0.1, a.to + 0.45], [0, 1], { ...cl, easing: Easing.in(Easing.cubic) });
            const sonne = t < a.question.t ? Math.sin(t * 30) * 2.2 : 0;
            return (
              <>
                <div style={{ position: 'absolute', left: 110, right: 110, top: 430, translate: `0 ${(1 - k) * 900 - part * 1400}px`, rotate: `${sonne + part * -8}deg`, background: C.ink, borderRadius: 56, padding: '56px 56px 64px', boxShadow: '0 60px 120px -40px rgba(30,32,29,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
                  <div style={{ position: 'relative', width: 180, height: 180 }}>
                    {[0, 1, 2].map((i) => {
                      const w = ((t * 1.1 + i / 3) % 1);
                      return <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: 90, border: `5px solid ${C.accent}`, scale: String(1 + w * 0.9), opacity: (1 - w) * 0.8 }} />;
                    })}
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 90, background: C.accent, display: 'grid', placeItems: 'center', fontFamily: F.display, fontWeight: 600, fontSize: 96, color: C.bg }}>F</div>
                  </div>
                  <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 30, letterSpacing: 8, color: C.accent }}>APPEL ENTRANT</div>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 84, color: C.bg }}>Une famille</div>
                  <div style={{ display: 'flex', gap: 120, marginTop: 20 }}>
                    <div style={{ width: 120, height: 120, borderRadius: 60, background: '#B5483A', display: 'grid', placeItems: 'center', fontSize: 56, color: '#fff', rotate: '135deg' }}>✆</div>
                    <div style={{ width: 120, height: 120, borderRadius: 60, background: C.ok, display: 'grid', placeItems: 'center', fontSize: 56, color: '#fff', scale: String(1 + 0.06 * Math.sin(t * 9)) }}>✆</div>
                  </div>
                </div>
                <div style={{ position: 'absolute', top: 1340, width: '100%', textAlign: 'center', fontFamily: F.display, fontWeight: 600, fontSize: 104, lineHeight: 1.05, color: C.ink, opacity: 1 - part }}>
                  {a.question.lignes.map((l, i) => (
                    <div key={i}><Reveal at={a.question.t + i * 0.32} style={i === a.question.lignes.length - 1 ? { fontStyle: 'italic', fontWeight: 500, color: C.accentLarge } : {}}>{l}</Reveal></div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* Pile de mots, chacun avec sa valeur */}
          {cfg.mots && (
            <div style={{ position: 'absolute', top: 400, left: 0, right: 0, translate: `0 ${-recul * 300}px`, scale: String(interpolate(recul, [0, 1], [1, 0.62])), opacity: interpolate(recul, [0, 1], [1, 0.2]), filter: `blur(${recul * 4}px)` }}>
              {cfg.mots.map((x) => {
                const kc = spring({ frame: at(x.t + 0.2), fps, config: { damping: 13, stiffness: 180 } });
                // Taille du mot pour que le mot et sa valeur tiennent sur une ligne
                const place = 960 - (x.chip ? x.chip.length * 27 + 90 : 0);
                const taille = Math.min(x.w.length > 11 ? 132 : 176, Math.floor(place / (x.w.length * 0.45)));
                return (
                  <div key={x.w} style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
                    <Reveal at={x.t} style={{ fontFamily: F.display, fontWeight: 600, fontSize: taille, color: C.ink, letterSpacing: -2, lineHeight: 1, whiteSpace: 'nowrap' }}>{x.w}</Reveal>
                    {x.chip && (
                      <span style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 42, color: C.ink, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 999, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, opacity: kc, scale: String(interpolate(kc, [0, 1], [0.5, 1])), rotate: `${interpolate(kc, [0, 1], [-10, 0])}deg`, boxShadow: '0 18px 36px -18px rgba(30,32,29,0.25)', whiteSpace: 'nowrap' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 8, background: C.accent }} />{x.chip}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bulles de messages des parents */}
          {cfg.bulles && (
            <div style={{ position: 'absolute', top: 360, left: 90, right: 90, display: 'flex', flexDirection: 'column', gap: 40, translate: `0 ${-recul * 200}px`, scale: String(interpolate(recul, [0, 1], [1, 0.7])), opacity: interpolate(recul, [0, 1], [1, 0.25]), filter: `blur(${recul * 3}px)` }}>
              {cfg.bulles.map((b, i) => {
                const k = spring({ frame: at(b.t), fps, config: { damping: 12, stiffness: 190 } });
                const ecrit = t > b.t - 0.55 && t < b.t;
                return (
                  <div key={i} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', position: 'relative' }}>
                    {ecrit && (
                      <div style={{ background: C.surface, borderRadius: 50, padding: '28px 36px', display: 'flex', gap: 14, boxShadow: '0 20px 40px -20px rgba(30,32,29,0.3)' }}>
                        {[0, 1, 2].map((d) => <span key={d} style={{ width: 22, height: 22, borderRadius: 11, background: C.muted, opacity: 0.35 + 0.65 * Math.max(0, Math.sin(t * 12 - d)) }} />)}
                      </div>
                    )}
                    {t >= b.t && (
                      <div style={{ background: i % 2 ? C.accent : C.surface, color: i % 2 ? C.bg : C.ink, borderRadius: 56, padding: '34px 50px', fontFamily: F.body, fontWeight: 650, fontSize: 76, boxShadow: '0 30px 60px -26px rgba(30,32,29,0.35)', scale: String(interpolate(k, [0, 1], [0.4, 1])), opacity: Math.min(1, k * 1.5), transformOrigin: i % 2 ? '100% 100%' : '0% 100%' }}>
                        {b.texte}
                      </div>
                    )}
                    <div style={{ marginTop: 10, textAlign: i % 2 ? 'right' : 'left', fontFamily: F.body, fontWeight: 500, fontSize: 28, color: C.muted, opacity: t >= b.t ? k : 0 }}>Parent de Léo · {i ? '17h48' : '17h46'}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phrase d'appui, puis phrase choc soulignée à l'argile */}
          {cfg.intro && (
            <div style={{ position: 'absolute', top: 1180, left: 60, right: 60, textAlign: 'center', fontFamily: F.display, fontStyle: 'italic', fontWeight: 400, fontSize: 84, color: C.muted, lineHeight: 1.1 }}>
              <Reveal at={cfg.intro.t}>{cfg.intro.texte}</Reveal>
            </div>
          )}
          {cfg.punch && (() => {
            const p = cfg.punch!;
            const k = spring({ frame: at(p.t), fps, config: { damping: 15, stiffness: 150 } });
            const trait = interpolate(t, [p.t + 0.3, p.t + 0.85], [0, 1], { ...cl, easing: ease });
            return (
              <div style={{ position: 'absolute', top: 1310, left: 40, right: 40, textAlign: 'center', opacity: k }}>
                <span style={{ position: 'relative', display: 'inline-block', fontFamily: F.display, fontStyle: 'italic', fontWeight: 500, fontSize: 124, lineHeight: 1.05, color: C.accentLarge, translate: `0 ${(1 - k) * 50}px` }}>
                  {p.texte}
                  <svg width="760" height="60" viewBox="0 0 760 60" style={{ position: 'absolute', left: '50%', marginLeft: -380, bottom: -40 }}>
                    <path d="M10 38 C 180 10, 420 56, 750 22" fill="none" stroke={C.accent} strokeWidth="9" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - trait} />
                  </svg>
                </span>
              </div>
            );
          })()}

          {t >= cfg.chute && (
            <div style={{ position: 'absolute', left: 540 - 56, top: interpolate(chute, [0, 1], [-140, 960 - 56]), width: 112, height: 112, borderRadius: 56, background: C.accent, boxShadow: '0 30px 50px -20px rgba(155,87,51,0.6)' }} />
          )}
        </AbsoluteFill>
      )}

      {t >= impact && (
        <div style={{ position: 'absolute', left: 540, top: 960, width: 0, height: 0, opacity: 1 - sortie }}>
          <div style={{ position: 'absolute', width: 2400, height: 2400, left: -1200, top: -1200, borderRadius: 1200, background: C.accent, scale: String(interpolate(etale, [0, 1], [0.047, 1])) }} />
        </div>
      )}
      {t >= revele - 0.1 && (
        <AbsoluteFill style={{ clipPath: `circle(${ouvre * 1200}px at 540px 960px)`, backgroundColor: C.bg }}>
          {(() => {
            const k = spring({ frame: at(revele + 0.15), fps, config: { damping: 200 } });
            const monte = cfg.phrases.length ? interpolate(t, [cfg.phrases[0].t - 0.25, cfg.phrases[0].t + 0.55], [0, 1], { ...cl, easing: ease }) : 0;
            return (
              <AbsoluteFill style={{ translate: `0 ${-sortie * 700}px`, opacity: 1 - sortie, scale: String(1 - sortie * 0.15) }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', translate: `0 ${-monte * 300}px` }}>
                  <Galets size={420} start={Math.round((revele - 0.05) * fps)} pearlFrom={-60} />
                  <div style={{ marginTop: 26, fontFamily: F.display, fontWeight: 600, fontSize: 128, color: C.ink, letterSpacing: interpolate(k, [0, 1], [80, 34]), paddingLeft: 34, opacity: k }}>ARVELA</div>
                </div>
                <div style={{ position: 'absolute', top: 1180, width: '100%', textAlign: 'center', fontFamily: F.display, fontWeight: 500, fontSize: 100, lineHeight: 1.1, color: C.ink }}>
                  {cfg.phrases.map((ph, i) => (
                    <div key={i}><Reveal at={ph.t} style={ph.italique ? { fontStyle: 'italic', fontWeight: 400, color: C.accentLarge } : {}}>{ph.texte}</Reveal></div>
                  ))}
                </div>
              </AbsoluteFill>
            );
          })()}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
