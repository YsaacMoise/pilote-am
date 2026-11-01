import { Img, staticFile } from 'remotion';
import { C } from '../theme';

// Téléphone stylisé qui affiche les vraies captures de l'app (écran 390 × 844 points, captures en double résolution).
export const SCREEN_W = 390;
export const SCREEN_H = 844;
export const K = 1.72; // pixels vidéo par point d'écran, à l'échelle 1
const BEZEL = 14;

export type Layer = { img: string; opacity: number; scroll?: number; dy?: number; tabbarFrom?: string };

export const Phone: React.FC<{ layers: Layer[]; overlay?: React.ReactNode }> = ({ layers, overlay }) => (
  <div style={{ position: 'absolute', left: -BEZEL, top: -BEZEL, width: SCREEN_W * K + BEZEL * 2, height: SCREEN_H * K + BEZEL * 2, borderRadius: 88, background: C.ink, boxShadow: '0 60px 120px -40px rgba(30,32,29,0.45), 0 0 0 2px rgba(255,255,255,0.06) inset' }}>
    <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SCREEN_W * K, height: SCREEN_H * K, borderRadius: 74, overflow: 'hidden', background: C.bg }}>
      {layers.filter((l) => l.opacity > 0.001).map((l, i) => (
        <div key={l.img + i} style={{ position: 'absolute', inset: 0, opacity: l.opacity, translate: `0 ${(l.dy ?? 0) * K}px` }}>
          <Img src={staticFile(`ecrans/${l.img}.png`)} style={{ position: 'absolute', left: 0, top: -(l.scroll ?? 0) * K, width: SCREEN_W * K }} />
          {l.tabbarFrom && (
            // Barre d'onglets fixe par-dessus une capture pleine page qui défile
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: SCREEN_W * K, height: 66 * K, overflow: 'hidden' }}>
              <Img src={staticFile(`ecrans/${l.tabbarFrom}.png`)} style={{ position: 'absolute', left: 0, bottom: 0, width: SCREEN_W * K }} />
            </div>
          )}
        </div>
      ))}
      {overlay}
    </div>
  </div>
);
