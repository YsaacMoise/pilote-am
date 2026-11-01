import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// Révélation masquée : le texte monte depuis derrière une ligne invisible (typographie animée « éditoriale »).
export const Reveal: React.FC<{ at: number; out?: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, out, dur = 0.7, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const ease = Easing.bezier(0.16, 1, 0.3, 1);
  const k = interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const o = out === undefined ? 0 : interpolate(t, [out, out + 0.45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.7, 0, 0.84, 0) });
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.08em', ...style }}>
      <span style={{ display: 'inline-block', translate: `0 ${(1 - k) * 105 - o * 105}%`, opacity: 1 - o * 0.3 }}>{children}</span>
    </span>
  );
};
