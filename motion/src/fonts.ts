import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

export const fontsReady = Promise.all([
  loadFont({ family: 'Cormorant Garamond', url: staticFile('fonts/cormorant-garamond-latin-500-normal.woff2'), weight: '500' }),
  loadFont({ family: 'Cormorant Garamond', url: staticFile('fonts/cormorant-garamond-latin-600-normal.woff2'), weight: '600' }),
  loadFont({ family: 'Cormorant Garamond', url: staticFile('fonts/cormorant-garamond-latin-700-normal.woff2'), weight: '700' }),
  loadFont({ family: 'Cormorant Garamond', url: staticFile('fonts/cormorant-garamond-latin-400-italic.woff2'), weight: '400', style: 'italic' }),
  loadFont({ family: 'Cormorant Garamond', url: staticFile('fonts/cormorant-garamond-latin-500-italic.woff2'), weight: '500', style: 'italic' }),
  loadFont({ family: 'Plus Jakarta Sans', url: staticFile('fonts/plus-jakarta-sans-latin-wght-normal.woff2'), weight: '200 800' }),
  loadFont({ family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-wght-normal.woff2'), weight: '100 800' }),
]);
