import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../theme';

// Logo : deux galets (le parent, l'assistante maternelle) qui se penchent l'un vers l'autre, une perle d'argile (l'enfant).
// `start` : image où l'assemblage commence. `pearlFrom` : hauteur de chute de la perle (unités du viewBox 120).
export const Galets: React.FC<{ size: number; start?: number; ink?: string; pearl?: string; pearlFrom?: number; assembled?: boolean }> = ({
  size, start = 0, ink = C.ink, pearl = C.accent, pearlFrom = -80, assembled = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k1 = assembled ? 1 : spring({ frame: frame - start, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const k2 = assembled ? 1 : spring({ frame: frame - start - 4, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const kp = assembled ? 1 : spring({ frame: frame - start - 14, fps, config: { damping: 11, stiffness: 120, mass: 0.7 } });
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ overflow: 'visible' }}>
      <g style={{ opacity: k1 }} transform={`translate(${interpolate(k1, [0, 1], [-34, 0])} 0) rotate(${interpolate(k1, [0, 1], [0, 19])} 43 57)`}>
        <rect x="33" y="18" width="20" height="78" rx="10" fill={ink} />
      </g>
      <g style={{ opacity: k2 * 0.88 }} transform={`translate(${interpolate(k2, [0, 1], [34, 0])} 0) rotate(${interpolate(k2, [0, 1], [0, -19])} 77 57)`}>
        <rect x="67" y="18" width="20" height="78" rx="10" fill={ink} />
      </g>
      <circle cx="60" cy={interpolate(kp, [0, 1], [73 + pearlFrom, 73])} r="11.5" fill={pearl} style={{ opacity: Math.min(1, kp * 3) }} />
    </svg>
  );
};
