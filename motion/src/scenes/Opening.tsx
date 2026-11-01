import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Galets } from '../components/Galets';
import { Reveal } from '../components/Reveal';
import { C, F } from '../theme';

// Ouverture (0 → 14,8 s) calée sur la voix :
// « Une journée d'assistante maternelle, c'est des arrivées, des départs, des repas, des siestes…
//   et, à la fin du mois, tout à recompter. Avec Arvela, tout se note au fil de la journée. Et le mois se prépare tout seul. »
const T = {
  intro: 0.2, arrivees: 2.4, departs: 3.45, repas: 4.35, siestes: 5.2,
  finMois: 6.3, recompter: 7.55, chute: 8.62, impact: 9.0, revele: 9.45, note: 10.5, mois: 12.8, fin: 14.8,
};
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const WORDS = [
  { w: 'Arrivées', t: T.arrivees, chip: '07h31' },
  { w: 'Départs', t: T.departs, chip: '17h45' },
  { w: 'Repas', t: T.repas, chip: '11h50' },
  { w: 'Siestes', t: T.siestes, chip: '13h05' },
];
// Le « relevé » à recompter : lignes qui défilent vite dans une carte
const LIGNES = [
  ['Heures normales', '186 h'], ['Jours d’activité', '21 j'], ['Heures majorées', '11 h 02'], ['Absence enfant', '−1 j'],
  ['Indemnités d’entretien', '78,75 €'], ['Repas fournis', '12 × 4,70 €'], ['Congés acquis', '2,5 j'], ['Heures complémentaires', '+0h30'],
  ['Salaire net', '713,81 €'], ['Jours fériés', '1 j'], ['Indemnités km', '0,26 €/km'], ['Régularisation', '1/12e'],
];

export const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const at = (sec: number) => frame - Math.round(sec * fps);

  // Respiration de caméra sur toute la première partie
  const cam = interpolate(t, [0, T.impact], [1, 1.06], clamp);
  // Recul de la pile de mots quand arrive « la fin du mois »
  const recul = interpolate(t, [T.finMois, T.finMois + 0.8], [0, 1], { ...clamp, easing: ease });
  // Transition : la perle tombe, s'étale en argile, puis un cercle albâtre révèle le logo
  const chute = interpolate(t, [T.chute, T.impact], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const etale = interpolate(t, [T.impact, T.impact + 0.42], [0, 1], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const revele = interpolate(t, [T.revele - 0.1, T.revele + 0.5], [0, 1], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const avant = t < T.impact + 0.42;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {avant && (
        <AbsoluteFill style={{ scale: String(cam) }}>
          {/* Ligne d'introduction */}
          <div style={{ position: 'absolute', top: 250, width: '100%', textAlign: 'center', fontFamily: F.display, fontStyle: 'italic', fontWeight: 400, fontSize: 92, lineHeight: 1.05, color: C.muted, opacity: interpolate(recul, [0, 1], [1, 0]) }}>
            <Reveal at={T.intro}>Une journée</Reveal><br />
            <Reveal at={T.intro + 0.45}>d’assistante maternelle</Reveal>
          </div>

          {/* Pile de mots : chacun arrive avec son heure */}
          <div style={{ position: 'absolute', top: 560, left: 0, right: 0, translate: `0 ${-recul * 300}px`, scale: String(interpolate(recul, [0, 1], [1, 0.62])), opacity: interpolate(recul, [0, 1], [1, 0.22]), filter: `blur(${recul * 4}px)` }}>
            {WORDS.map((x) => {
              const kc = spring({ frame: at(x.t + 0.22), fps, config: { damping: 14, stiffness: 170 } });
              return (
                <div key={x.w} style={{ height: 232, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
                  <Reveal at={x.t} style={{ fontFamily: F.display, fontWeight: 600, fontSize: 196, color: C.ink, letterSpacing: -2, lineHeight: 1 }}>{x.w}</Reveal>
                  <span style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 44, color: C.ink, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 999, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, opacity: kc, scale: String(interpolate(kc, [0, 1], [0.6, 1])), boxShadow: '0 18px 36px -18px rgba(30,32,29,0.25)' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 8, background: C.accent }} />{x.chip}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Le relevé du mois, à recompter à la main */}
          {(() => {
            const k = spring({ frame: at(T.finMois), fps, config: { damping: 20, stiffness: 110 } });
            const defile = interpolate(t, [T.finMois, T.chute], [0, 1], clamp);
            return (
              <div style={{ position: 'absolute', left: 110, right: 110, top: 700, height: 760, translate: `0 ${(1 - k) * 1300}px`, rotate: `${interpolate(k, [0, 1], [8, -2.5])}deg`, background: C.surface, borderRadius: 36, border: `2px solid ${C.border}`, boxShadow: '0 40px 80px -30px rgba(30,32,29,0.35)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, padding: '40px 56px', translate: `0 ${-defile * 700}px`, filter: `blur(${interpolate(t, [T.finMois + 0.4, T.recompter], [0, 1.6], clamp)}px)` }}>
                  {[...LIGNES, ...LIGNES].map(([a, b], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '20px 0', borderBottom: `2px dashed ${C.border}` }}>
                      <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: 40, color: C.muted }}>{a}</span>
                      <span style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 44, color: C.ink }}>{b}</span>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #fff 0%, rgba(255,255,255,0) 18%, rgba(255,255,255,0) 82%, #fff 100%)' }} />
              </div>
            );
          })()}

          {/* « tout à recompter. » avec un trait d'argile tracé à la main */}
          {(() => {
            const k = spring({ frame: at(T.recompter), fps, config: { damping: 15, stiffness: 150 } });
            const trait = interpolate(t, [T.recompter + 0.35, T.recompter + 0.9], [0, 1], { ...clamp, easing: ease });
            return (
              <div style={{ position: 'absolute', top: 1500, width: '100%', textAlign: 'center', opacity: k }}>
                <span style={{ position: 'relative', display: 'inline-block', fontFamily: F.display, fontStyle: 'italic', fontWeight: 500, fontSize: 150, color: C.accentLarge, translate: `0 ${(1 - k) * 40}px` }}>
                  tout à recompter.
                  <svg width="760" height="60" viewBox="0 0 760 60" style={{ position: 'absolute', left: '50%', marginLeft: -380, bottom: -34 }}>
                    <path d="M10 38 C 180 10, 420 56, 750 22" fill="none" stroke={C.accent} strokeWidth="9" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - trait} />
                  </svg>
                </span>
              </div>
            );
          })()}

          {/* La perle tombe */}
          {t >= T.chute && (
            <div style={{ position: 'absolute', left: 540 - 56, top: interpolate(chute, [0, 1], [-140, 960 - 56]), width: 112, height: 112, borderRadius: 56, background: C.accent, boxShadow: '0 30px 50px -20px rgba(155,87,51,0.6)' }} />
          )}
        </AbsoluteFill>
      )}

      {/* Elle s'étale en argile sur tout l'écran… */}
      {t >= T.impact && (
        <div style={{ position: 'absolute', left: 540, top: 960, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', width: 2400, height: 2400, left: -1200, top: -1200, borderRadius: 1200, background: C.accent, scale: String(interpolate(etale, [0, 1], [0.047, 1])) }} />
        </div>
      )}
      {/* …puis l'albâtre revient en cercle, avec le logo au centre */}
      {t >= T.revele - 0.1 && (
        <AbsoluteFill style={{ clipPath: `circle(${revele * 1200}px at 540px 960px)`, backgroundColor: C.bg }}>
          <Signature t={t} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const Signature: React.FC<{ t: number }> = ({ t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const monte = interpolate(t, [T.note - 0.25, T.note + 0.55], [0, 1], { ...clamp, easing: ease });
  const swap = interpolate(t, [T.mois - 0.3, T.mois + 0.1], [0, 1], { ...clamp, easing: ease });
  const sortie = interpolate(t, [T.fin - 0.45, T.fin], [1, 0], clamp);
  const k = spring({ frame: frame - Math.round((T.revele + 0.2) * fps), fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ opacity: sortie }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', translate: `0 ${-monte * 300}px` }}>
        <Galets size={440} start={Math.round((T.revele - 0.05) * fps)} pearlFrom={-60} />
        <div style={{ marginTop: 26, fontFamily: F.display, fontWeight: 600, fontSize: 128, color: C.ink, letterSpacing: interpolate(k, [0, 1], [80, 34]), paddingLeft: 34, opacity: k }}>ARVELA</div>
      </div>
      <div style={{ position: 'absolute', top: 1190, width: '100%', textAlign: 'center', fontFamily: F.display, fontWeight: 500, fontSize: 100, lineHeight: 1.1, color: C.ink }}>
        <div style={{ position: 'absolute', width: '100%', opacity: 1 - swap }}>
          <Reveal at={T.note}>Tout se note</Reveal><br />
          <Reveal at={T.note + 0.12}>au fil de la journée.</Reveal>
        </div>
        <div style={{ position: 'absolute', width: '100%', opacity: swap }}>
          <Reveal at={T.mois - 0.1}>Le mois se prépare</Reveal><br />
          <Reveal at={T.mois + 0.05} style={{ fontStyle: 'italic', fontWeight: 400, color: C.accentLarge }}>tout seul.</Reveal>
        </div>
      </div>
    </AbsoluteFill>
  );
};
