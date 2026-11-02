import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Frame } from './components/Frame';
import { Band, blocsDepuisPhrases, Bulle, Caption, cl, Cross, ease, fade, Halo, inOut, kf, mix, Musique, Phrase, PhoneBox, Piste, Push, Rect, rgba, Sfx, Sheet, Shot, Tap, Voix } from './components/ecran';
import { C, F } from './theme';
import VPo from '../public/voix/aide-pointer.reperes.json';
import VCa from '../public/voix/aide-carnet.reperes.json';
import VMo from '../public/voix/aide-mois.reperes.json';
import VIn from '../public/voix/aide-inviter.reperes.json';
import VSi from '../public/voix/aide-simulateur.reperes.json';
import JJ from '../public/ecrans/journee/journee.json';
import DD from '../public/ecrans/demo/demo.json';

// Aides courtes, ouvertes depuis « Ça coince » quand l'assistante maternelle bloque, l'écran devant elle.
// Pas de logo, pas d'introduction : l'écran à taille réelle, le doigt, une idée. Chaque aide garde son accent :
// Aujourd'hui (l'heure, le matin puis le soir), Carnet (un geste par moment), Mois (le soulagement, case par case),
// Inviter (le code dit de vive voix), Simulateur (une famille qui appelle).

const J = JJ as unknown as Record<string, Rect> & { texteLien: string; code: string };
const D = DD as unknown as Record<string, Rect> & { mLignes: Rect[]; texteMois: string; texteSim: string };
type Voix = { fichier: string; mots: Record<string, number>; phrases: Phrase[] };
const A = 0.45; // la voix commence
const finVoix = (v: Voix) => (v.mots.finRecopier ?? v.mots.finLien ?? v.mots.fin);
const dureeAide = (v: Voix) => A + finVoix(v) + 1.3;

// Cadre commun : fond calme, sous-titres en haut, téléphone à taille quasi réelle, petite étiquette d'heure
const S = 1.9;
const TOP = 268;
const Cadre: React.FC<{ v: Voix; t: number; fin: number; ecran: React.ReactNode; dessus?: React.ReactNode; heure?: { at: number; h: string }[]; italique?: string[]; sons?: React.ReactNode }> = ({ v, t, fin, ecran, dessus, heure = [], italique = [], sons }) => {
  const { fps } = useVideoConfig();
  const pistes: Piste[] = [{ fichier: v.fichier, at: A }];
  const entree = interpolate(t, [0, 0.5], [1, 0], { ...cl, easing: ease });
  const sortie = fade(t, fin - 0.5, fin, Easing.linear);
  const h = [...heure].reverse().find((x) => t >= x.at);
  return (
    <Frame>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${mix(C.bg, C.accentSoft, 0.25)} 0%, ${C.bg} 40%)` }} />
      <Caption t={t} blocs={blocsDepuisPhrases(v.phrases, A, { italique, finDernier: fin })} y={44} size={58} gauche={50} droite={50} />
      <div style={{ position: 'absolute', inset: 0, translate: `0 ${entree * 160}px`, opacity: (1 - entree) * (1 - sortie) }}>
        <PhoneBox cx={540} top={TOP} S={S}>{ecran}</PhoneBox>
        {h && (
          <div style={{ position: 'absolute', right: 70, top: TOP - 70, fontFamily: F.mono, fontSize: 30, fontWeight: 600, color: C.accentInk, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 999, padding: '6px 18px', opacity: fade(t, h.at, h.at + 0.3) }}>{h.h}</div>
        )}
        {dessus}
      </div>
      <Voix p={pistes[0]} />
      <Musique fichier="musique/patterns-in-the-grain.mp3" depart={6} fin={fin} pistes={pistes} niveau={0.13} fps={fps} />
      {sons}
    </Frame>
  );
};
const taps = (xs: number[]) => xs.map((x) => <Sfx key={x} at={x} name="tap" volume={0.5} />);

// ---------- Aujourd'hui : pointer l'arrivée et le départ, corriger une heure ----------
const VP = VPo as Voix;
export const DUREE_POINTER = dureeAide(VP);
export const AidePointer: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  const c = (k: string) => VP.mots[k] + A;
  const tapArr = c('arrivee') - 0.05, soir = c('soir') - 0.2, tapDep = c('depart') - 0.05, tapMod = c('modifier') - 0.05;
  const ecran = (
    <>
      <Cross a="journee/a-auj-0" b="journee/a-auj-1" p={fade(t, tapArr + 0.06, tapArr + 0.16, Easing.linear)} />
      <Shot src="journee/a-soir-0" o={fade(t, soir, soir + 0.35, Easing.linear)} />
      <Shot src="journee/a-soir-1" o={fade(t, tapDep + 0.06, tapDep + 0.16, Easing.linear)} />
      <Halo t={t} from={tapArr + 0.25} to={soir} r={J.aTagArrivee} />
      <Halo t={t} from={tapDep + 0.25} to={tapMod - 0.1} r={J.aTagDepart} />
      <Sheet src="journee/a-modifier" top={J.aModifierFeuille.top} t={t} up={tapMod + 0.05} down={DUREE_POINTER} />
      <Halo t={t} from={c('corriges') - 0.1} to={DUREE_POINTER} r={J.aHeureDepart} />
      <Tap t={t} at={tapArr} r={J.aArrivee} />
      <Tap t={t} at={tapDep} r={J.aDepart} />
      <Tap t={t} at={tapMod} r={J.aModifier} />
    </>
  );
  return <Cadre v={VP} t={t} fin={DUREE_POINTER} ecran={ecran} heure={[{ at: 0.2, h: '8 h 00' }, { at: soir, h: '17 h 30' }]} italique={['Modifier']} sons={taps([tapArr, tapDep, tapMod])} />;
};

// ---------- Carnet : choisir l'enfant, noter, le sommeil et le réveil ----------
const VC = VCa as Voix;
export const DUREE_CARNET = dureeAide(VC);
export const AideCarnet: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  const c = (k: string) => VC.mots[k] + A;
  const tapRose = c('choisis') + 0.55, tapRepas = c('noter') - 0.25, tapTout = c('heure') - 0.45;
  const tapSommeil = c('sommeil') - 0.2, tapEndort = c('sommeil') + 0.45, tapReveil = c('reveil2') + 0.05;
  const midi = tapSommeil - 0.35, apresMidi = tapReveil - 0.45;
  const ecran = (
    <>
      <Cross a="demo/c-adam" b="demo/c-rose-0" p={fade(t, tapRose + 0.06, tapRose + 0.3, Easing.linear)} />
      <Shot src="demo/c-rose-1" o={fade(t, tapTout + 0.15, tapTout + 0.45, Easing.linear)} />
      <Shot src="demo/c-rose-1b" o={fade(t, midi, midi + 0.2, Easing.linear)} />
      <Shot src="demo/c-rose-2" o={fade(t, tapEndort + 0.15, tapEndort + 0.4, Easing.linear)} />
      <Shot src="demo/c-rose-2b" o={fade(t, apresMidi, apresMidi + 0.2, Easing.linear)} />
      <Shot src="demo/c-rose-3" o={fade(t, tapReveil + 0.1, tapReveil + 0.35, Easing.linear)} />
      <Sheet src="demo/c-repas" top={D.cRepasFeuille.top} t={t} up={tapRepas + 0.05} down={tapTout + 0.1} />
      <Sheet src="demo/c-sommeil" top={D.cSommeilFeuille.top} t={t} up={tapSommeil + 0.05} down={tapEndort + 0.1} />
      <Halo t={t} from={c('heure') - 0.1} to={midi} r={D.cHeure1} pad={6} />
      <Halo t={t} from={c('reveil') - 0.1} to={tapReveil} r={D.cDodo} />
      <Tap t={t} at={tapRose} r={D.cRose} />
      <Tap t={t} at={tapRepas} r={D.cRepas} />
      <Tap t={t} at={tapTout} r={D.cToutMange} />
      <Tap t={t} at={tapSommeil} r={D.cSommeil} />
      <Tap t={t} at={tapEndort} r={D.cEndort} />
      <Tap t={t} at={tapReveil} r={D.cReveil2} />
    </>
  );
  return <Cadre v={VC} t={t} fin={DUREE_CARNET} ecran={ecran} heure={[{ at: 0.2, h: '11 h 50' }, { at: midi, h: '12 h 40' }, { at: apresMidi, h: '14 h 55' }]} italique={['toute seule', 'Réveil']} sons={taps([tapRose, tapRepas, tapTout, tapSommeil, tapEndort, tapReveil])} />;
};

// ---------- Mois : tout est calculé, case par case, puis envoyé au parent ----------
const VM = VMo as Voix;
export const DUREE_MOIS = dureeAide(VM);
export const AideMois: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  const c = (k: string) => VM.mots[k] + A;
  const lignes = D.mLignes;
  const tapEnv = c('envoyer') + 0.15;
  const vers = (r: Rect, marge: number) => Math.max(0, Math.min(r.top - marge, (D.mHauteur as unknown as number) - 844));
  const scroll = kf(t, [[c('ordre') - 0.45, 0], [c('ordre') + 0.15, vers(lignes[0], 140)], [c('envoyer') - 0.7, vers(lignes[0], 140)], [c('envoyer') - 0.1, vers(D.mEnvoyer, 520)]]);
  const ecran = (
    <>
      <Shot src="demo/m-mois-long" scroll={scroll} />
      <Band src="demo/m-mois" y0={D.mTabMois.top - 16} y1={844} />
      <Halo t={t} from={c('calcule') - 0.2} to={c('ordre') - 0.3} r={D.mTotal} dy={-scroll} />
      {lignes.map((l, i) => {
        const at = c('cases') + i * 0.17;
        const ok = fade(t, at + 0.15, at + 0.4);
        return (
          <div key={i}>
            <Halo t={t} from={at} to={at + 0.6} r={l} dy={-scroll} pad={2} />
            {ok > 0 && <div style={{ position: 'absolute', left: l.left - 2, top: l.top - scroll + 10, width: 6, height: Math.min(l.h - 20, 60), borderRadius: 3, background: C.ok, opacity: ok * (1 - fade(t, tapEnv, tapEnv + 0.4)) }} />}
          </div>
        );
      })}
      <Tap t={t} at={tapEnv} r={D.mEnvoyer} dy={-scroll} />
    </>
  );
  const dessus = <Bulle t={t} from={c('recoit') - 0.35} to={DUREE_MOIS + 1} titre="Message au parent" texte={D.texteMois} x={110} y={760} w={860} size={34} />;
  return <Cadre v={VM} t={t} fin={DUREE_MOIS} ecran={ecran} dessus={dessus} heure={[{ at: 0.2, h: 'Fin du mois' }]} italique={['prêts à recopier']} sons={<>{taps([tapEnv])}<Sfx at={c('recoit') - 0.3} name="envoye" volume={0.35} /></>} />;
};

// ---------- Inviter : créer le lien, l'envoyer, dire le code de vive voix ----------
const VI = VIn as Voix;
export const DUREE_INVITER = dureeAide(VI);
export const AideInviter: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  const c = (k: string) => VI.mots[k] + A;
  const tapPlus = c('plus') + 0.05, tapAdam = c('fiche') - 0.1, descend = c('cree') - 0.75, tapCreer = c('cree') + 0.1, tapEnv = c('envoie') + 0.05;
  const texte = J.texteLien.replace(/https?:\/\/[^\s]+/, 'arvela.fr/#/p/…');
  const ecran = (
    <Push p={fade(t, tapPlus + 0.1, tapPlus + 0.5, Easing.linear)}>
      {[
        <div key="a" style={{ position: 'absolute', inset: 0 }}><Shot src="journee/a-soir-1" /><Tap t={t} at={tapPlus} r={J.iTabPlus} /></div>,
        <div key="b" style={{ position: 'absolute', inset: 0 }}>
          <Push p={fade(t, tapAdam + 0.1, tapAdam + 0.5, Easing.linear)}>
            {[
              <div key="p" style={{ position: 'absolute', inset: 0 }}><Shot src="journee/i-plus" /><Tap t={t} at={tapAdam} r={J.iAdam} /></div>,
              <div key="f" style={{ position: 'absolute', inset: 0 }}>
                <Shot src="journee/i-fiche" dy={-fade(t, descend, descend + 0.4, inOut) * 300} o={1 - fade(t, descend + 0.2, descend + 0.45, Easing.linear)} />
                <Shot src="journee/i-lien-0" o={fade(t, descend + 0.2, descend + 0.45, Easing.linear)} />
                <Shot src="journee/i-lien-1" o={fade(t, tapCreer + 0.2, tapCreer + 0.5, Easing.linear)} />
                <Tap t={t} at={tapCreer} r={J.iCreer} />
                <Tap t={t} at={tapEnv} r={J.iEnvoyer} />
                <Halo t={t} from={c('code') - 0.15} to={DUREE_INVITER} r={J.iCode} pad={6} />
              </div>,
            ]}
          </Push>
        </div>,
      ]}
    </Push>
  );
  // Le code se dit, il ne s'écrit pas : une bulle de parole avec les chiffres
  const k = fade(t, c('voix') - 0.4, c('voix') + 0.1);
  const dessus = (
    <>
      <Bulle t={t} from={tapEnv + 0.3} to={c('code') + 0.1} titre="Message aux parents" texte={texte} x={110} y={TOP + (J.iCode.top + J.iCode.h + 40) * S} w={860} size={34} />
      {k > 0 && (
        <div style={{ position: 'absolute', left: 230, right: 230, top: TOP + (J.iCode.top + J.iCode.h + 30) * S + (1 - k) * 40, opacity: k, background: C.ink, color: C.bg, borderRadius: 40, padding: '26px 0 30px', textAlign: 'center', boxShadow: '0 40px 80px -30px rgba(30,32,29,0.6)' }}>
          <div style={{ fontFamily: F.body, fontSize: 30, opacity: 0.8 }}>à dire de vive voix</div>
          <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 88, letterSpacing: '0.2em' }}>{J.code}</div>
          <div style={{ position: 'absolute', left: '50%', top: -22, translate: '-50% 0', width: 0, height: 0, borderLeft: '22px solid transparent', borderRight: '22px solid transparent', borderBottom: `24px solid ${C.ink}` }} />
        </div>
      )}
    </>
  );
  return <Cadre v={VI} t={t} fin={DUREE_INVITER} ecran={ecran} dessus={dessus} italique={['de vive voix']} sons={<>{taps([tapPlus, tapAdam, tapCreer, tapEnv])}<Sfx at={tapEnv + 0.3} name="envoye" volume={0.35} /></>} />;
};

// ---------- Simulateur : une famille appelle, on simule pendant l'appel, on envoie ----------
const VS = VSi as Voix;
export const DUREE_SIMULATEUR = dureeAide(VS);
export const AideSimulateur: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  const c = (k: string) => VS.mots[k] + A;
  const finAppel = c('simulateur') - 0.55, tapSim = c('simulateur') - 0.05, tapEnv = c('envoies') + 0.1;
  const H = (D.sHauteur as unknown as number) - 844;
  const vers = (r: Rect, marge: number) => Math.max(0, Math.min(r.top - marge, H));
  const scroll = kf(t, [[tapSim + 0.5, 0], [c('horaires') - 0.4, vers(D.sArrivee, 260)], [c('tarif') - 0.3, vers(D.sTarif, 360)], [c('voit') - 0.2, vers(D.sResultat, 200)], [c('caf') + 0.35, vers(D.sResultat, 200)], [c('envoies') - 0.3, vers(D.sEnvoyer, 520)]]);
  const ecran = (
    <Push p={fade(t, tapSim + 0.1, tapSim + 0.5, Easing.linear)}>
      {[
        <div key="p" style={{ position: 'absolute', inset: 0 }}><Shot src="demo/s-plus" /><Tap t={t} at={tapSim} r={D.sLien} /></div>,
        <div key="s" style={{ position: 'absolute', inset: 0 }}>
          <Shot src="demo/s-sim-long" scroll={scroll} />
          <Band src="demo/s-sim" y0={D.sTabPlus.top - 16} y1={844} />
          <Halo t={t} from={c('horaires') - 0.15} to={c('tarif') - 0.3} r={{ ...D.sArrivee, w: 300 }} dy={-scroll} />
          <Halo t={t} from={c('tarif') - 0.1} to={c('voit') - 0.2} r={D.sTarif} dy={-scroll} />
          <Halo t={t} from={c('cout') - 0.2} to={c('envoies') - 0.45} r={D.sResultat} dy={-scroll} />
          <Tap t={t} at={tapEnv} r={D.sEnvoyer} dy={-scroll} />
        </div>,
      ]}
    </Push>
  );
  // L'appel entrant (écran générique d'appel, sans marque)
  const ka = fade(t, 0.15, 0.5) * (1 - fade(t, finAppel, finAppel + 0.35, inOut));
  const onde = ((t * 1.3) % 1);
  const dessus = (
    <>
      {ka > 0 && (
        <div style={{ position: 'absolute', left: 540 - (390 * S) / 2, top: TOP, width: 390 * S, height: 844 * S, borderRadius: 42 * S, overflow: 'hidden', opacity: ka, background: `linear-gradient(170deg, ${mix(C.ink, C.accent, 0.3)} 0%, ${C.ink} 80%)`, color: '#fff', textAlign: 'center', fontFamily: F.body }}>
          <div style={{ marginTop: 300, fontSize: 40, opacity: 0.75 }}>Appel entrant</div>
          <div style={{ fontSize: 72, fontWeight: 700, marginTop: 10 }}>Une famille</div>
          <div style={{ fontSize: 34, opacity: 0.75, marginTop: 8 }}>« Vous auriez une place ? »</div>
          <div style={{ position: 'absolute', left: '50%', top: 980, translate: '-50% -50%' }}>
            <div style={{ position: 'absolute', left: -90, top: -90, width: 180, height: 180, borderRadius: 90, border: `4px solid ${rgba('#ffffff', 0.6)}`, scale: String(1 + onde * 0.8), opacity: 1 - onde }} />
            <div style={{ width: 150, height: 150, borderRadius: 75, background: C.ok, display: 'grid', placeItems: 'center', translate: '-75px -75px', fontSize: 60 }}>✆</div>
          </div>
        </div>
      )}
      <Bulle t={t} from={tapEnv + 0.35} to={DUREE_SIMULATEUR + 1} titre="Message à la famille" texte={D.texteSim.replace(/https?:\/\/[^\s]+/, 'arvela.fr/#/simulateur…')} x={110} y={820} w={860} size={34} />
    </>
  );
  return <Cadre v={VS} t={t} fin={DUREE_SIMULATEUR} ecran={ecran} dessus={dessus} italique={['d’un seul geste', "d'un seul geste"]} sons={<>{taps([tapSim, tapEnv])}<Sfx at={0.2} name="chime" volume={0.35} /><Sfx at={tapEnv + 0.35} name="envoye" volume={0.35} /></>} />;
};
