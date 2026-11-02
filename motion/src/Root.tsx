import { Composition, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import { Frame } from './components/Frame';
import { Opening } from './scenes/Opening';
import { s } from './theme';
import { Quotidien, QUOTIDIEN_DUREE } from './Quotidien';
import { Installer } from './Installer';
import { TIMES } from './scenes/Install';
import { Accueil, DUREE_ACCUEIL } from './Accueil';
import { DUREE_PARENTS, Parents } from './Parents';
import { AideCarnet, AideInviter, AideMois, AidePointer, AideSimulateur, DUREE_CARNET, DUREE_INVITER, DUREE_MOIS, DUREE_POINTER, DUREE_SIMULATEUR } from './Aides';
import { DUREE_A, DUREE_B, EssaiDeuxTelephones, EssaiJournee } from './Essais';
import { duree, INVITER, MOIS, SIMULATEUR, TutoVideo } from './Tutos';

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
    <Composition id="Mois" component={() => <TutoVideo m={MOIS} />} durationInFrames={s(duree(MOIS))} fps={30} width={1080} height={1920} />
    <Composition id="Inviter" component={() => <TutoVideo m={INVITER} />} durationInFrames={s(duree(INVITER))} fps={30} width={1080} height={1920} />
    <Composition id="Simulateur" component={() => <TutoVideo m={SIMULATEUR} />} durationInFrames={s(duree(SIMULATEUR))} fps={30} width={1080} height={1920} />
    <Composition id="Accueil" component={Accueil} durationInFrames={s(DUREE_ACCUEIL)} fps={30} width={1080} height={1920} />
    <Composition id="Parents" component={Parents} durationInFrames={s(DUREE_PARENTS)} fps={30} width={1080} height={1920} />
    <Composition id="AidePointer" component={AidePointer} durationInFrames={s(DUREE_POINTER)} fps={30} width={1080} height={1920} />
    <Composition id="AideCarnet" component={AideCarnet} durationInFrames={s(DUREE_CARNET)} fps={30} width={1080} height={1920} />
    <Composition id="AideMois" component={AideMois} durationInFrames={s(DUREE_MOIS)} fps={30} width={1080} height={1920} />
    <Composition id="AideInviter" component={AideInviter} durationInFrames={s(DUREE_INVITER)} fps={30} width={1080} height={1920} />
    <Composition id="AideSimulateur" component={AideSimulateur} durationInFrames={s(DUREE_SIMULATEUR)} fps={30} width={1080} height={1920} />
    <Composition id="EssaiA" component={EssaiDeuxTelephones} durationInFrames={s(DUREE_A)} fps={30} width={1080} height={1920} />
    <Composition id="EssaiB" component={EssaiJournee} durationInFrames={s(DUREE_B)} fps={30} width={1080} height={1920} />
    <Composition id="Quotidien" component={Quotidien} durationInFrames={s(QUOTIDIEN_DUREE)} fps={30} width={1080} height={1920} />
  </>
);
