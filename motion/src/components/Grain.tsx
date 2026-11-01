import { AbsoluteFill, useCurrentFrame } from 'remotion';

// Grain de papier très léger, renouvelé toutes les 2 images : donne une matière « imprimée » au fond albâtre.
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.06 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 50;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'multiply', opacity }}>
      <svg width="100%" height="100%">
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};
