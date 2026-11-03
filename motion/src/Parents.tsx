import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Frame } from './components/Frame';
import { blocsDepuisPhrases, Caption, cl, ease, fade, Halo, inOut, mix, Musique, PhoneBox, Piste, Rect, rgba, Sfx, Shot, Signature, SH, Tap, Voix } from './components/ecran';
import { C, F } from './theme';
import VP from '../public/voix/parents.reperes.json';
import VSig from '../public/voix/signature-parents.reperes.json';
import JJ from '../public/ecrans/journee/journee.json';

// « Suivre la journée de votre enfant » — pour le parent qui a reçu le lien, souvent au travail, loin de son enfant.
// Idée : on se place de son côté, à 12 h 40, au bureau. Son téléphone est en veille ; il pense à Adam.
// Il ouvre le lien : Adam dort depuis 12 h 40, il a bien mangé. Puis la confiance (lien privé, code dit de vive voix),
// puis la fin du mois (les cases Pajemploi prêtes, un bouton pour copier chaque valeur).
// Palette « côté parents » : la sauge de la charte, plus calme que l'argile des vidéos de l'assistante maternelle.

const J = JJ as unknown as Record<string, Rect> & { code: string };
const M = VP.mots as Record<string, number>;
const A = 0.5;
const c = (k: string) => M[k] + A;
const SIG_AT = c('finRecopier') + 0.5; // la signature apparaît
const SIG_VOIX = SIG_AT + 0.4; // puis elle est dite
export const DUREE_PARENTS = SIG_VOIX + VSig.mots.fin + 1.0;
const PISTES: Piste[] = [{ fichier: VP.fichier, at: A }, { fichier: VSig.fichier, at: SIG_VOIX }];

// Écran de veille d'un téléphone (générique, sans marque)
const Veille: React.FC<{ o: number }> = ({ o }) => (
  <div style={{ position: 'absolute', inset: 0, opacity: o, background: `linear-gradient(170deg, ${mix(C.ink, C.sauge, 0.35)} 0%, ${C.ink} 75%)`, color: '#fff', textAlign: 'center' }}>
    <div style={{ marginTop: 120, fontFamily: F.body, fontSize: 17, fontWeight: 600, opacity: 0.85 }}>mercredi 4 novembre</div>
    <div style={{ fontFamily: F.body, fontSize: 92, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.05 }}>12:40</div>
  </div>
);

// Pastille ronde avec l'initiale, comme dans l'app
const Gommette: React.FC<{ lettre: string; couleur: string; taille: number }> = ({ lettre, couleur, taille }) => (
  <div style={{ width: taille, height: taille, borderRadius: taille, background: couleur, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: F.display, fontWeight: 600, fontSize: taille * 0.55, boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.15)' }}>{lettre}</div>
);

export const Parents: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fin = DUREE_PARENTS;
  const sigAt = SIG_AT;

  const pensez = c('pensez'), ouvrez = c('ouvrez'), dort = c('dort'), mange = c('mange'), couches = c('couches'), prive = c('prive'), code = c('code'), finMois = c('fin'), cases = c('cases'), recopier = c('recopier');
  const allume = ouvrez - 0.2; // le téléphone sort de veille
  const tapCode = ouvrez + 0.35;
  const page = dort - 0.55; // la page de la journée s'ouvre
  const tapMois = finMois + 0.15;
  const demande = couches - 0.55; // la demande de Sonia arrive en direct : la carte « À apporter » en haut
  const tapCopier = recopier - 0.25;

  const S = 1.5, top = 520;
  const phoneIn = interpolate(t, [0, 0.9], [1, 0], { ...cl, easing: ease });
  // Le téléphone est posé sur le bureau, légèrement incliné ; il se redresse quand on l'ouvre
  const incline = interpolate(t, [allume - 0.3, allume + 0.6], [14, 0], { ...cl, easing: inOut });

  const ecran = (() => {
    const veille = 1 - fade(t, allume, allume + 0.35);
    const code1 = fade(t, tapCode + 0.35, tapCode + 0.5, Easing.linear);
    const pg = fade(t, page, page + 0.4, Easing.linear);
    const pa = fade(t, demande, demande + 0.35, Easing.linear);
    const mois = fade(t, tapMois + 0.1, tapMois + 0.4, Easing.linear);
    const copie = fade(t, tapCopier + 0.1, tapCopier + 0.25, Easing.linear);
    const zoneDecl: Rect = { left: J.pDecl.left, top: J.pDecl.top, w: J.pDecl.w, h: SH - 70 - J.pDecl.top, x: J.pDecl.x, y: 0 };
    return (
      <>
        <Shot src="journee/p-code-0" />
        <Shot src="journee/p-code-1" o={code1} />
        <Tap t={t} at={tapCode} r={J.pCode} />
        <Shot src="journee/p-2" o={pg} />
        <Shot src="journee/p-2-apporter" o={pa} />
        {pg > 0 && (
          <>
            <Halo t={t} from={dort - 0.1} to={mange - 0.3} r={J.p2ligne} couleur={C.sauge} />
            <Halo t={t} from={mange - 0.2} to={demande} r={J.p1ligne} couleur={C.sauge} />
            <Halo t={t} from={couches - 0.1} to={prive - 0.3} r={J.p3apporter} couleur={C.sauge} />
            <Halo t={t} from={prive - 0.1} to={finMois} r={J.p3prive} couleur={C.sauge} />
          </>
        )}
        <Shot src="journee/p-mois" o={mois} />
        <Shot src="journee/p-mois-copie" o={copie} />
        <Tap t={t} at={tapMois} r={J.pMoisTab} />
        <Halo t={t} from={cases - 0.1} to={tapCopier} r={zoneDecl} couleur={C.sauge} />
        <Tap t={t} at={tapCopier} r={J.pCopier} />
        <Halo t={t} from={tapCopier + 0.2} to={fin} r={J.pCopier} couleur={C.ok} pad={2} />
        <Veille o={veille} />
      </>
    );
  })();

  // Le code dit de vive voix : Sonia → le parent
  const parole = (() => {
    const k = fade(t, code - 0.1, code + 0.4) * (1 - fade(t, finMois - 0.3, finMois + 0.1, inOut));
    if (k <= 0) return null;
    const chiffres = J.code.split('');
    return (
      <div style={{ position: 'absolute', left: 90, right: 90, top: top + 300, opacity: k, translate: `0 ${(1 - k) * 40}px`, background: C.surface, borderRadius: 36, padding: '34px 30px', boxShadow: '0 40px 80px -30px rgba(30,32,29,0.5)', border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'center' }}><Gommette lettre="S" couleur={C.accent} taille={110} /><div style={{ fontFamily: F.body, fontSize: 26, marginTop: 10, color: C.muted }}>Sonia</div></div>
        <div style={{ flex: 1, margin: '0 22px', position: 'relative', background: C.subtle, borderRadius: 28, padding: '20px 0', textAlign: 'center', fontFamily: F.mono, fontWeight: 700, fontSize: 64, letterSpacing: '0.18em', color: C.ink }}>
          {chiffres.map((ch, i) => <span key={i} style={{ opacity: fade(t, code + 0.25 + i * 0.22, code + 0.45 + i * 0.22) }}>{ch}</span>)}
          <div style={{ position: 'absolute', left: -14, top: '50%', translate: '0 -50%', width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent', borderRight: `16px solid ${C.subtle}` }} />
        </div>
        <div style={{ textAlign: 'center' }}><Gommette lettre="P" couleur={C.sauge} taille={110} /><div style={{ fontFamily: F.body, fontSize: 26, marginTop: 10, color: C.muted }}>Vous</div></div>
      </div>
    );
  })();

  // Une pensée pour Adam, au bureau
  const pensee = (() => {
    const k = fade(t, pensez - 0.2, pensez + 0.4) * (1 - fade(t, allume, allume + 0.3));
    if (k <= 0) return null;
    return (
      <div style={{ position: 'absolute', left: 540 - 70, top: top + 560 - (1 - k) * 30 + Math.sin(t * 2) * 6, opacity: k }}>
        <Gommette lettre="A" couleur={C.accent} taille={140} />
      </div>
    );
  })();

  const blocs = blocsDepuisPhrases(VP.phrases, A, { italique: ['de vive voix', 'les recopier'], finDernier: sigAt + 0.1 });
  const heureK = fade(t, c('quarante') - 0.4, c('quarante') + 0.2) * (1 - fade(t, page, page + 0.4));

  return (
    <Frame>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${mix(C.bg, C.sauge, 0.1)} 0%, ${C.bg} 55%, ${mix(C.subtle, C.sauge, 0.08)} 78%, ${mix(C.subtle, C.ink, 0.06)} 100%)` }} />
      {/* Lumière de fenêtre, douce */}
      <div style={{ position: 'absolute', left: -200, top: -300, width: 1100, height: 1100, borderRadius: 600, background: `radial-gradient(circle, ${rgba('#ffffff', 0.55)} 0%, ${rgba('#ffffff', 0)} 65%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 110, textAlign: 'center', fontFamily: F.display, fontWeight: 600, fontSize: 120, color: C.sauge, opacity: heureK }}>12 h 40</div>
      <Caption t={t} blocs={blocs} y={265} size={60} accent={C.sauge} />
      <div style={{ position: 'absolute', inset: 0, translate: `0 ${phoneIn * 1300}px`, perspective: 2200 }}>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: '540px 1700px', transform: `rotateX(${incline}deg)` }}>
          <PhoneBox cx={540} top={top} S={S}>{ecran}</PhoneBox>
        </div>
      </div>
      {pensee}
      {parole}
      <Signature t={t} at={sigAt} fin={fin} phrase="Le carnet de liaison avec votre assistante maternelle" />
      {PISTES.map((p, i) => <Voix key={i} p={p} />)}
      <Musique fichier="musique/patterns-in-the-grain.mp3" depart={2} fin={fin} pistes={PISTES} niveau={0.16} fps={fps} />
      {[tapCode, tapMois, tapCopier].map((x) => <Sfx key={x} at={x} name="tap" volume={0.5} />)}
      <Sfx at={allume} name="pop" volume={0.3} />
      <Sfx at={demande} name="pop" volume={0.25} />
      <Sfx at={sigAt + 0.2} name="chime" volume={0.35} />
    </Frame>
  );
};
