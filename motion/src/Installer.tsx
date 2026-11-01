import { Sequence, staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { Install, Plateforme, TIMES } from './scenes/Install';
import { s } from './theme';

const VOIX: Record<Plateforme, [number, number][]> = {
  iphone: [[0, 3.75], [4.47, 8.64], [9.42, 11.33], [12.03, 13.0], [13.67, 18.23]],
  android: [[0, 3.97], [4.75, 9.25], [9.92, 11.6], [12.23, 13.18], [14.05, 18.34]],
};
const smooth = (x: number) => x * x * (3 - 2 * x);
function volume(t: number, p: Plateforme) {
  let v = 0;
  for (const [a, b] of VOIX[p]) {
    const k = t < a ? 1 - (a - t) / 0.35 : t > b ? 1 - (t - b) / 0.35 : 1;
    v = Math.max(v, smooth(Math.max(0, Math.min(1, k))));
  }
  const fin = TIMES[p].total;
  return (0.30 - 0.17 * v) * Math.min(1, t / 0.6) * Math.max(0, Math.min(1, (fin - t) / 1.8));
}
const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 1 }) => (
  <Sequence from={s(at)} durationInFrames={s(2.4)} layout="none"><Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} /></Sequence>
);

export const Installer: React.FC<{ plateforme: Plateforme }> = ({ plateforme }) => {
  const { fps } = useVideoConfig();
  const T = TIMES[plateforme];
  return (
    <Frame>
      <Install plateforme={plateforme} />
      <Audio src={staticFile(`voix/${plateforme}.wav`)} />
      <Audio src={staticFile('musique/patterns-in-the-grain.mp3')} volume={(f: number) => volume(f / fps, plateforme)} />
      <Sfx at={T.titre} name="pop" volume={0.5} />
      <Sfx at={T.phone - 0.2} name="whoosh" volume={0.5} />
      {[T.partager, T.ligne, T.ajouter, T.ouvre].map((a) => <Sfx key={a} at={a} name="tap" volume={0.7} />)}
      {[T.feuille, T.ajout, T.accueil].map((a) => <Sfx key={'s' + a} at={a} name="swipe" volume={0.45} />)}
      <Sfx at={T.icone} name="pop" volume={0.6} />
      <Sfx at={T.horsLigne} name="envoye" volume={0.4} />
      <Sfx at={T.fin + 0.35} name="chime" volume={0.5} />
    </Frame>
  );
};
