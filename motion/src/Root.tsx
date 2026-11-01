import { Composition, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { Opening } from './scenes/Opening';
import { s } from './theme';
import { Quotidien, QUOTIDIEN_DUREE } from './Quotidien';
import { Installer } from './Installer';
import { TIMES } from './scenes/Install';

const Essai: React.FC = () => (
  <Frame>
    <Opening />
    <Audio src={staticFile('voix/quotidien.wav')} />
  </Frame>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Essai" component={Essai} durationInFrames={s(14.8)} fps={30} width={1080} height={1920} />
    <Composition id="InstallerIphone" component={() => <Installer plateforme="iphone" />} durationInFrames={s(TIMES.iphone.total)} fps={30} width={1080} height={1920} />
    <Composition id="InstallerAndroid" component={() => <Installer plateforme="android" />} durationInFrames={s(TIMES.android.total)} fps={30} width={1080} height={1920} />
    <Composition id="Quotidien" component={Quotidien} durationInFrames={s(QUOTIDIEN_DUREE)} fps={30} width={1080} height={1920} />
  </>
);
