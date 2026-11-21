import { createElement } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import charte from '../charte.json';
import { C } from '../theme';

// Logo de l'app (src/ui/Logo.tsx, lu par scripts/charte.mjs), qui s'assemble élément par élément.
// Avec le logo actuel : les deux galets se penchent l'un vers l'autre, la perle d'argile tombe entre eux.
// Si le logo de l'app change, l'animation suit sans retouche : chaque forme pivotée se redresse en glissant, chaque rond tombe.
// `start` : image où l'assemblage commence. `pearlFrom` : hauteur de chute des ronds (unités du viewBox).
type El = { tag: string; attrs: Record<string, string> };
const ELEMENTS = charte.logo.elements as unknown as El[];

export const Galets: React.FC<{ size: number; start?: number; ink?: string; pearl?: string; pearlFrom?: number; assembled?: boolean }> = ({
  size, start = 0, ink = C.ink, pearl = C.accent, pearlFrom = -80, assembled = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const couleur = (v?: string) => (v === 'currentColor' ? ink : v && v.startsWith('var(') ? pearl : v);
  let formes = 0;
  return (
    <svg viewBox={charte.logo.viewBox} width={size} height={size} style={{ overflow: 'visible' }}>
      {ELEMENTS.map((e, i) => {
        const { transform, fill, opacity, ...reste } = e.attrs;
        const rond = e.tag === 'circle' || e.tag === 'ellipse';
        const delai = rond ? 14 : 4 * formes++;
        const k = assembled ? 1 : spring({ frame: frame - start - delai, fps, config: rond ? { damping: 11, stiffness: 120, mass: 0.7 } : { damping: 18, stiffness: 90, mass: 0.9 } });
        const rot = /rotate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(transform ?? '');
        const op = Number(opacity ?? 1);
        if (rond) {
          return (
            <g key={i} transform={`translate(0 ${interpolate(k, [0, 1], [pearlFrom, 0])})`} style={{ opacity: Math.min(1, k * 3) * op }}>
              {createElement(e.tag, { ...reste, fill: couleur(fill) })}
            </g>
          );
        }
        const a = rot ? Number(rot[1]) : 0;
        const sens = a === 0 ? (i % 2 ? 1 : -1) : -Math.sign(a);
        const t = rot ? `rotate(${interpolate(k, [0, 1], [0, a])} ${rot[2]} ${rot[3]})` : transform;
        return (
          <g key={i} style={{ opacity: k * op }} transform={`translate(${interpolate(k, [0, 1], [sens * 34, 0])} 0)`}>
            {createElement(e.tag, { ...reste, transform: t, fill: couleur(fill) })}
          </g>
        );
      })}
    </svg>
  );
};
