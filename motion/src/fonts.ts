import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';
import charte from './charte.json';

// Les polices de l'app (copiées par scripts/charte.mjs), sous les mêmes noms de famille que dans l'app.
export const fontsReady = Promise.all(
  charte.polices.map((p) => loadFont({ family: p.famille, url: staticFile(`fonts/${p.fichier}`), weight: p.poids, style: p.style })),
);
