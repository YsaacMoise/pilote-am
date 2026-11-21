import { Sequence, staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { Opening } from './scenes/Opening';
import { Didactic, DIDACTIC_MARKS, DIDACTIC_SWIPES, DIDACTIC_TAPS } from './scenes/Didactic';
import { s } from './theme';

export const D0 = 14.96; // début de la voix « prise en main »
export const QUOTIDIEN_DUREE = 60;

// Moments où la voix parle (secondes vidéo) : la musique baisse dessous
const VOIX: [number, number][] = [
  [0.23, 8.58], [9.22, 14.04],
  ...([[0.34, 4.93], [5.49, 11.75], [12.08, 14.46], [15.34, 24.05], [24.87, 33.41], [34.19, 39.15], [39.81, 42.79]] as [number, number][]).map(([a, b]) => [a + D0, b + D0] as [number, number]),
];
const smooth = (x: number) => x * x * (3 - 2 * x);
function voixActive(t: number) {
  let v = 0;
  for (const [a, b] of VOIX) {
    const r = 0.35;
    const k = t < a ? 1 - (a - t) / r : t > b ? 1 - (t - b) / r : 1;
    v = Math.max(v, smooth(Math.max(0, Math.min(1, k))));
  }
  return v;
}
export function volumeMusique(t: number, fin: number) {
  const base = 0.30 - 0.17 * voixActive(t); // −10 dB dans les respirations, −15 dB sous la voix
  const entree = Math.min(1, t / 1.2);
  const sortie = Math.max(0, Math.min(1, (fin - t) / 2.2));
  return base * entree * sortie;
}

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 1 }) => (
  <Sequence from={s(at)} durationInFrames={s(2.4)} layout="none">
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

export const Quotidien: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Frame>
      <Sequence durationInFrames={s(15.2)}><Opening /></Sequence>
      <Sequence from={s(D0)}><Didactic /></Sequence>

      <Sequence durationInFrames={s(14.8)} layout="none"><Audio src={staticFile('voix/quotidien.wav')} /></Sequence>
      <Sequence from={s(D0)} layout="none"><Audio src={staticFile('voix/prise-en-main.wav')} /></Sequence>
      <Audio src={staticFile('musique/measured-grace.mp3')} trimBefore={s(7.8)} volume={(f: number) => volumeMusique(f / fps, QUOTIDIEN_DUREE)} />

      {[2.62, 3.67, 4.57, 5.42].map((a) => <Sfx key={a} at={a} name="pop" volume={0.55} />)}
      <Sfx at={8.45} name="whoosh" volume={0.7} />
      <Sfx at={9.0} name="tap" volume={0.6} />
      <Sfx at={9.55} name="chime" volume={0.5} />
      {DIDACTIC_TAPS.map((a) => <Sfx key={'t' + a} at={D0 + a} name="tap" volume={0.7} />)}
      {DIDACTIC_MARKS.map((a) => <Sfx key={'m' + a} at={D0 + a} name="pop" volume={0.32} />)}
      {DIDACTIC_SWIPES.map((a) => <Sfx key={'s' + a} at={D0 + a - 0.1} name="swipe" volume={0.5} />)}
      <Sfx at={D0 + 23.05} name="envoye" volume={0.5} />
      <Sfx at={D0 + 40.15} name="chime" volume={0.5} />
    </Frame>
  );
};
