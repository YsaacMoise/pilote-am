import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Galets } from '../components/Galets';
import { K, Phone, SCREEN_H, SCREEN_W } from '../components/Phone';
import { Reveal } from '../components/Reveal';
import { C, F } from '../theme';

// Installation, sur iPhone (Safari) ou Android (Chrome). Écrans du navigateur redessinés, site réel en capture.
export type Plateforme = 'iphone' | 'android';
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);
const io = Easing.bezier(0.65, 0, 0.35, 1);
const fade = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], cl);
const u = (n: number) => n * K; // points d'écran → pixels vidéo
const SYS = '-apple-system, "SF Pro Text", "Plus Jakarta Sans", sans-serif';

// Temps clés (s) calés sur chaque voix
export const TIMES = {
  iphone: { titre: 0.3, sansStore: 2.6, phone: 4.25, tape: 4.6, partager: 8.2, feuille: 8.45, ligne: 10.9, ajout: 11.15, ajouter: 12.6, accueil: 13.05, icone: 13.6, ouvre: 15.3, horsLigne: 16.9, fin: 18.65, total: 21.0 },
  android: { titre: 0.3, sansStore: 2.7, phone: 4.5, tape: 4.85, partager: 9.0, feuille: 9.15, ligne: 11.3, ajout: 11.5, ajouter: 12.95, accueil: 13.4, icone: 14.05, ouvre: 15.7, horsLigne: 17.1, fin: 18.9, total: 21.3 },
};

const Icone: React.FC<{ size: number; rond?: boolean }> = ({ size, rond }) => (
  <div style={{ width: size, height: size, borderRadius: rond ? size / 2 : size * 0.23, background: C.ink, display: 'grid', placeItems: 'center', boxShadow: `0 ${size * 0.12}px ${size * 0.3}px -${size * 0.1}px rgba(30,32,29,0.45)` }}>
    <Galets size={size * (rond ? 0.74 : 0.86)} ink={C.bg} assembled />
  </div>
);

// Anneau de repère, en points d'écran
const Ring: React.FC<{ x: number; y: number; w: number; h: number; t: number; from: number; to: number; r?: number }> = ({ x, y, w, h, t, from, to, r = 12 }) => {
  const k = interpolate(t, [from, from + 0.35], [0, 1], { ...cl, easing: out });
  const o = Math.min(k, 1 - fade(t, to - 0.2, to));
  if (o <= 0) return null;
  return <div style={{ position: 'absolute', left: u(x), top: u(y), width: u(w), height: u(h), borderRadius: u(r), border: `4px solid ${C.accent}`, opacity: o, scale: String(interpolate(k, [0, 1], [1.1, 1])), boxShadow: `0 0 0 ${interpolate(k, [0, 1], [22, 6])}px rgba(200,125,85,0.16)` }} />;
};

const Site: React.FC<{ top: number; t: number; tape: number }> = ({ top, t, tape }) => (
  <div style={{ position: 'absolute', left: 0, top: u(top), width: u(SCREEN_W), opacity: fade(t, tape + 1.0, tape + 1.4) }}>
    <Img src={staticFile('ecrans/site.png')} style={{ width: u(SCREEN_W) }} />
  </div>
);

const Adresse: React.FC<{ t: number; tape: number }> = ({ t, tape }) => {
  const txt = 'arvela.fr';
  const n = Math.floor(interpolate(t, [tape, tape + 0.9], [0, txt.length], cl));
  const curseur = t < tape + 1.1 && Math.floor(t * 3) % 2 === 0;
  return <>{txt.slice(0, n)}<span style={{ opacity: curseur ? 1 : 0, color: '#0A84FF' }}>|</span></>;
};

// ---------- Safari (iPhone) ----------
const SafariPage: React.FC<{ t: number; T: typeof TIMES.iphone }> = ({ t, T }) => (
  <>
    <Site top={54} t={t} tape={T.tape} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: u(54), background: C.bg }}>
      <span style={{ position: 'absolute', left: u(34), top: u(17), fontFamily: SYS, fontWeight: 600, fontSize: u(15), color: '#111' }}>9:41</span>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: u(118), background: 'rgba(249,249,249,0.97)', borderTop: '1px solid #ddd' }}>
      <div style={{ position: 'absolute', left: u(14), right: u(14), top: u(10), height: u(44), borderRadius: u(14), background: '#E9E9EB', display: 'grid', placeItems: 'center', fontFamily: SYS, fontSize: u(16), fontWeight: 500, color: '#111' }}>
        <span><Adresse t={t} tape={T.tape} /></span>
      </div>
      {/* barre d'outils : précédent, suivant, partager, signets, onglets */}
      <svg viewBox="0 0 390 52" width={u(390)} height={u(52)} style={{ position: 'absolute', left: 0, top: u(60) }}>
        <g fill="none" stroke="#0A84FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M44 16 L34 26 L44 36" />
          <path d="M112 16 L122 26 L112 36" opacity="0.35" />
          <path d="M187 22 h-6 v18 h28 v-18 h-6 M195 30 V10 M189 16 L195 10 L201 16" />
          <path d="M268 14 c-6 -2 -12 -2 -16 1 v22 c4 -3 10 -3 16 -1 c6 -2 12 -2 16 1 v-22 c-4 -3 -10 -3 -16 -1 z M268 14 v22" />
          <rect x="340" y="16" width="18" height="18" rx="4" /><rect x="346" y="10" width="18" height="18" rx="4" />
        </g>
      </svg>
    </div>
  </>
);
const SHARE_ROWS = ['Copier', 'Ajouter à la liste de lecture', 'Ajouter un signet', 'Ajouter aux favoris', 'Rechercher dans la page', 'Sur l’écran d’accueil', 'Annotations', 'Imprimer'];
const FEUILLE_TOP = 300;
const LIGNE_Y = (i: number, scroll: number) => FEUILLE_TOP + 150 + i * 48 - scroll;
const ShareSheet: React.FC<{ t: number; T: typeof TIMES.iphone }> = ({ t, T }) => {
  const k = interpolate(t, [T.feuille, T.feuille + 0.45], [0, 1], { ...cl, easing: out });
  const fermeture = interpolate(t, [T.ajout, T.ajout + 0.3], [0, 1], cl);
  if (k <= 0 || fermeture >= 1) return null;
  const scroll = interpolate(t, [T.feuille + 0.9, T.ligne - 0.9], [0, 90], { ...cl, easing: io });
  const hl = fade(t, T.ligne - 0.15, T.ligne);
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.25 * k * (1 - fermeture)})` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: u(FEUILLE_TOP + (1 - k) * 560), bottom: 0, background: '#F2F2F7', borderRadius: `${u(16)}px ${u(16)}px 0 0`, overflow: 'hidden', opacity: 1 - fermeture }}>
        <div style={{ position: 'absolute', left: u(16), top: u(18), display: 'flex', alignItems: 'center', gap: u(12) }}>
          <Icone size={u(46)} />
          <div style={{ fontFamily: SYS }}><div style={{ fontWeight: 600, fontSize: u(16), color: '#111' }}>Arvela</div><div style={{ fontSize: u(13), color: '#8E8E93' }}>arvela.fr</div></div>
        </div>
        <div style={{ position: 'absolute', left: u(16), right: u(16), top: u(150 - scroll), background: '#fff', borderRadius: u(12) }}>
          {SHARE_ROWS.map((r, i) => (
            <div key={r} style={{ height: u(48), display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${u(16)}px`, borderTop: i ? '1px solid #E5E5EA' : 'none', background: i === 5 ? `rgba(229,229,234,${hl})` : 'transparent', fontFamily: SYS, fontSize: u(16), fontWeight: i === 5 ? 600 : 400, color: '#111' }}>
              {r}
              {i === 5 ? <span style={{ width: u(20), height: u(20), border: `${u(1.8)}px solid #111`, borderRadius: u(5), display: 'grid', placeItems: 'center', fontSize: u(15), lineHeight: 1 }}>+</span> : <span style={{ width: u(18), height: u(18), borderRadius: u(9), background: '#C7C7CC' }} />}
            </div>
          ))}
        </div>
      </div>
      <Ring x={16} y={LIGNE_Y(5, scroll)} w={358} h={48} t={t} from={T.ligne - 1.2} to={T.ligne + 0.3} />
    </>
  );
};
const AddSheet: React.FC<{ t: number; T: typeof TIMES.iphone }> = ({ t, T }) => {
  const k = interpolate(t, [T.ajout, T.ajout + 0.45], [0, 1], { ...cl, easing: out });
  const fermeture = interpolate(t, [T.accueil - 0.3, T.accueil], [0, 1], cl);
  if (k <= 0 || fermeture >= 1) return null;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.25 * k})`, opacity: 1 - fermeture }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: u(60 + (1 - k) * 800), bottom: 0, background: '#F2F2F7', borderRadius: `${u(16)}px ${u(16)}px 0 0`, opacity: 1 - fermeture, fontFamily: SYS }}>
        <div style={{ position: 'absolute', left: u(16), top: u(18), fontSize: u(16), color: '#0A84FF' }}>Annuler</div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: u(18), textAlign: 'center', fontSize: u(15), fontWeight: 600, color: '#111' }}>Ajouter à l’écran d’accueil</div>
        <div style={{ position: 'absolute', right: u(16), top: u(18), fontSize: u(16), fontWeight: 600, color: '#0A84FF' }}>Ajouter</div>
        <div style={{ position: 'absolute', left: u(16), right: u(16), top: u(66), height: u(92), background: '#fff', borderRadius: u(12), display: 'flex', alignItems: 'center', gap: u(14), padding: `0 ${u(14)}px` }}>
          <Icone size={u(62)} />
          <div style={{ flex: 1 }}><div style={{ fontSize: u(17), color: '#111', borderBottom: '1px solid #E5E5EA', paddingBottom: u(8) }}>Arvela</div><div style={{ fontSize: u(13), color: '#8E8E93', paddingTop: u(8) }}>https://arvela.fr</div></div>
        </div>
      </div>
      <Ring x={300} y={64} w={78} h={36} t={t} from={T.ajouter - 1.1} to={T.ajouter + 0.3} r={18} />
    </>
  );
};

// ---------- Chrome (Android) ----------
const ChromePage: React.FC<{ t: number; T: typeof TIMES.android }> = ({ t, T }) => (
  <>
    <Site top={92} t={t} tape={T.tape} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: u(92), background: '#fff', borderBottom: '1px solid #e3e3e3', fontFamily: '"Plus Jakarta Sans", Roboto, sans-serif' }}>
      <span style={{ position: 'absolute', left: u(22), top: u(12), fontWeight: 600, fontSize: u(14), color: '#202124' }}>10:24</span>
      <div style={{ position: 'absolute', left: u(14), right: u(78), top: u(40), height: u(42), borderRadius: u(21), background: '#F1F3F4', display: 'flex', alignItems: 'center', paddingLeft: u(16), fontSize: u(16), color: '#202124' }}>
        <Adresse t={t} tape={T.tape} />
      </div>
      <div style={{ position: 'absolute', right: u(44), top: u(50), width: u(22), height: u(22), border: `${u(2)}px solid #5F6368`, borderRadius: u(5), fontSize: u(12), display: 'grid', placeItems: 'center', color: '#5F6368', fontWeight: 700 }}>1</div>
      {[0, 1, 2].map((i) => <div key={i} style={{ position: 'absolute', right: u(18), top: u(52 + i * 7), width: u(5), height: u(5), borderRadius: u(3), background: '#5F6368' }} />)}
    </div>
  </>
);
const MENU = ['Nouvel onglet', 'Nouvel onglet navigation privée', 'Historique', 'Téléchargements', 'Favoris', 'Partager…', 'Installer l’application', 'Version pour ordinateur', 'Paramètres'];
const ChromeMenu: React.FC<{ t: number; T: typeof TIMES.android }> = ({ t, T }) => {
  const k = interpolate(t, [T.feuille, T.feuille + 0.3], [0, 1], { ...cl, easing: out });
  const fermeture = fade(t, T.ajout, T.ajout + 0.2);
  if (k <= 0 || fermeture >= 1) return null;
  const hl = fade(t, T.ligne - 0.15, T.ligne);
  return (
    <>
      <div style={{ position: 'absolute', right: u(8), top: u(36), width: u(258), background: '#fff', borderRadius: u(8), boxShadow: '0 20px 50px -10px rgba(0,0,0,0.35)', opacity: k * (1 - fermeture), scale: String(interpolate(k, [0, 1], [0.92, 1])), transformOrigin: 'top right', padding: `${u(6)}px 0`, fontFamily: '"Plus Jakarta Sans", Roboto, sans-serif' }}>
        {MENU.map((m, i) => (
          <div key={m} style={{ height: u(46), display: 'flex', alignItems: 'center', gap: u(14), padding: `0 ${u(16)}px`, fontSize: u(15), fontWeight: i === 6 ? 700 : 500, color: '#202124', background: i === 6 ? `rgba(232,234,237,${hl})` : 'transparent' }}>
            <span style={{ width: u(18), height: u(18), borderRadius: i === 6 ? u(4) : u(9), border: i === 6 ? `${u(1.8)}px solid #202124` : 'none', background: i === 6 ? 'transparent' : '#C4C7C5', fontSize: u(14), display: 'grid', placeItems: 'center', lineHeight: 1 }}>{i === 6 ? '+' : ''}</span>{m}
          </div>
        ))}
      </div>
      <Ring x={128} y={36 + 6 + 6 * 46} w={254} h={46} t={t} from={T.ligne - 1.2} to={T.ligne + 0.3} r={8} />
    </>
  );
};
const ChromeDialog: React.FC<{ t: number; T: typeof TIMES.android }> = ({ t, T }) => {
  const k = interpolate(t, [T.ajout, T.ajout + 0.35], [0, 1], { ...cl, easing: out });
  const fermeture = fade(t, T.accueil - 0.3, T.accueil);
  if (k <= 0 || fermeture >= 1) return null;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.4 * k})`, opacity: 1 - fermeture }} />
      <div style={{ position: 'absolute', left: u(28), right: u(28), top: u(300), height: u(230), background: '#fff', borderRadius: u(26), opacity: k * (1 - fermeture), scale: String(interpolate(k, [0, 1], [0.94, 1])), fontFamily: '"Plus Jakarta Sans", Roboto, sans-serif', padding: u(24) }}>
        <div style={{ fontSize: u(20), fontWeight: 600, color: '#202124' }}>Installer l’application ?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: u(14), marginTop: u(22) }}>
          <Icone size={u(52)} rond />
          <div><div style={{ fontSize: u(17), fontWeight: 600, color: '#202124' }}>Arvela</div><div style={{ fontSize: u(14), color: '#5F6368' }}>arvela.fr</div></div>
        </div>
        <div style={{ position: 'absolute', right: u(20), bottom: u(20), display: 'flex', gap: u(18), alignItems: 'center', fontSize: u(15), fontWeight: 600 }}>
          <span style={{ color: '#1A73E8' }}>Annuler</span>
          <span style={{ background: '#1A73E8', color: '#fff', borderRadius: u(20), padding: `${u(10)}px ${u(20)}px` }}>Installer</span>
        </div>
      </div>
      <Ring x={244} y={472} w={110} h={46} t={t} from={T.ajouter - 1.0} to={T.ajouter + 0.3} r={23} />
    </>
  );
};

// ---------- Écran d'accueil du téléphone ----------
const ACCUEIL_SLOT = 11;
const slot = (i: number, android: boolean) => {
  const size = android ? 54 : 62, gap = (SCREEN_W - 4 * size) / 5;
  return { x: gap + size / 2 + (i % 4) * (size + gap), y: 130 + Math.floor(i / 4) * (size + 40), size };
};
const Accueil: React.FC<{ t: number; T: typeof TIMES.iphone; android: boolean }> = ({ t, T, android }) => {
  const k = fade(t, T.accueil, T.accueil + 0.35);
  if (k <= 0) return null;
  const pop = interpolate(t, [T.icone, T.icone + 0.5], [0, 1], { ...cl, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  const tints = ['#D8D0C4', '#CDC5B8', '#D3CCC1', '#C6BFB3', '#DCD5CA', '#CFC8BC', '#D6CEC2', '#C9C2B6', '#D1C9BD', '#CBC4B8', '#D9D1C5'];
  const s0 = slot(ACCUEIL_SLOT, android);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: k, background: 'linear-gradient(180deg, #ECE6DC 0%, #CFC5B6 100%)' }}>
      <span style={{ position: 'absolute', left: u(34), top: u(17), fontFamily: SYS, fontWeight: 600, fontSize: u(15), color: '#111' }}>{android ? '10:25' : '9:42'}</span>
      {tints.map((c, i) => {
        const p = slot(i, android);
        return (
          <div key={i} style={{ position: 'absolute', left: u(p.x - p.size / 2), top: u(p.y - p.size / 2) }}>
            <div style={{ width: u(p.size), height: u(p.size), borderRadius: android ? u(p.size / 2) : u(p.size * 0.23), background: c }} />
            <div style={{ width: u(36), height: u(6), borderRadius: u(3), background: 'rgba(30,32,29,0.28)', margin: `${u(8)}px auto 0` }} />
          </div>
        );
      })}
      {pop > 0 && (
        <div style={{ position: 'absolute', left: u(s0.x - s0.size / 2), top: u(s0.y - s0.size / 2), scale: String(pop), textAlign: 'center' }}>
          <Icone size={u(s0.size)} rond={android} />
          <div style={{ marginTop: u(5), fontFamily: SYS, fontSize: u(12), fontWeight: 600, color: C.ink }}>Arvela</div>
        </div>
      )}
      {!android && <div style={{ position: 'absolute', left: u(12), right: u(12), bottom: u(18), height: u(86), borderRadius: u(30), background: 'rgba(255,255,255,0.35)' }} />}
    </div>
  );
};
const Ouverture: React.FC<{ t: number; T: typeof TIMES.iphone; android: boolean }> = ({ t, T, android }) => {
  const k = interpolate(t, [T.ouvre + 0.05, T.ouvre + 0.55], [0, 1], { ...cl, easing: io });
  if (k <= 0) return null;
  const s0 = slot(ACCUEIL_SLOT, android);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: `inset(${(1 - k) * (s0.y - 30) * K}px ${(1 - k) * (SCREEN_W - s0.x - 30) * K}px ${(1 - k) * (SCREEN_H - s0.y - 30) * K}px ${(1 - k) * (s0.x - 30) * K}px round ${u(20)}px)`, background: C.bg }}>
      <Img src={staticFile('ecrans/connexion.png')} style={{ width: u(SCREEN_W), opacity: k }} />
    </div>
  );
};

const ETAPES = (android: boolean, T: typeof TIMES.iphone) => [
  { from: T.phone, to: T.feuille + (android ? 1.1 : 1.0), n: android ? 'ÉTAPE 1 · CHROME' : 'ÉTAPE 1 · SAFARI', titre: android ? 'Ouvre arvela.fr, puis le menu.' : 'Ouvre arvela.fr, puis Partager.' },
  { from: T.feuille + (android ? 1.2 : 1.1), to: T.ajout + 0.1, n: 'ÉTAPE 2', titre: android ? 'Installer l’application.' : 'Sur l’écran d’accueil.' },
  { from: T.ajout + 0.2, to: T.accueil, n: 'ÉTAPE 3', titre: android ? 'Installer.' : 'Ajouter.' },
  { from: T.accueil + 0.1, to: T.fin, n: 'C’EST FAIT', titre: 'Arvela t’attend.' },
];

export const Install: React.FC<{ plateforme: Plateforme }> = ({ plateforme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const android = plateforme === 'android';
  const T = TIMES[plateforme];
  const titreSortie = fade(t, T.phone - 0.3, T.phone + 0.2);
  const entree = interpolate(t, [T.phone - 0.2, T.phone + 0.6], [1, 0], { ...cl, easing: out });
  const sortie = fade(t, T.fin, T.fin + 0.5);
  const z = interpolate(sortie, [0, 1], [1, 0.6]);
  const ox = 540 - 195 * K * z, oy = 1090 - 422 * K * z + entree * 1500;
  const tap = (x: number, y: number, at: number) => {
    const a = interpolate(t, [at - 0.45, at - 0.12], [0, 1], cl) * (1 - fade(t, at + 0.3, at + 0.55));
    if (a <= 0) return null;
    const press = interpolate(t, [at - 0.1, at, at + 0.15], [1, 0.82, 1], cl);
    const w = fade(t, at, at + 0.55);
    return (
      <div key={at} style={{ position: 'absolute', left: ox + x * K * z, top: oy + y * K * z, opacity: a }}>
        <div style={{ position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: 40, background: 'rgba(30,32,29,0.32)', border: '4px solid rgba(255,255,255,0.95)', scale: String(press) }} />
        {t >= at && <div style={{ position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: 40, border: `6px solid ${C.accent}`, scale: String(1 + w * 1.6), opacity: 1 - w }} />}
      </div>
    );
  };
  const sAcc = slot(ACCUEIL_SLOT, android);

  return (
    <AbsoluteFill>
      {/* Titre */}
      {titreSortie < 1 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 1 - titreSortie, translate: `0 ${-titreSortie * 80}px` }}>
          <div style={{ scale: String(interpolate(t, [T.titre, T.titre + 0.6], [0, 1], { ...cl, easing: Easing.bezier(0.34, 1.56, 0.64, 1) })) }}>
            <Icone size={250} rond={android} />
          </div>
          <div style={{ marginTop: 70, fontFamily: F.mono, fontWeight: 600, fontSize: 30, letterSpacing: 8, color: C.accentInk }}><Reveal at={T.titre + 0.2}>{android ? 'ANDROID' : 'IPHONE'}</Reveal></div>
          <div style={{ marginTop: 12, fontFamily: F.display, fontWeight: 600, fontSize: 104, lineHeight: 1.05, textAlign: 'center', color: C.ink }}>
            <Reveal at={T.titre + 0.3}>S’installe comme</Reveal><br /><Reveal at={T.titre + 0.45}>une application.</Reveal>
          </div>
          <div style={{ marginTop: 26, fontFamily: F.display, fontStyle: 'italic', fontWeight: 400, fontSize: 84, color: C.accentLarge }}>
            <Reveal at={T.sansStore}>{android ? 'Sans Play Store.' : 'Sans App Store.'}</Reveal>
          </div>
        </AbsoluteFill>
      )}

      {/* En-têtes d'étape */}
      {ETAPES(android, T).map((e) => {
        const o = Math.min(fade(t, e.from, e.from + 0.3), 1 - fade(t, e.to - 0.25, e.to));
        if (o <= 0) return null;
        return (
          <div key={e.n} style={{ position: 'absolute', top: 96, left: 0, right: 0, textAlign: 'center', opacity: o }}>
            <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 30, letterSpacing: 7, color: C.accentInk }}><Reveal at={e.from}>{e.n}</Reveal></div>
            <div style={{ marginTop: 10, fontFamily: F.display, fontWeight: 600, fontSize: 88, lineHeight: 1.05, color: C.ink }}><Reveal at={e.from + 0.1}>{e.titre}</Reveal></div>
          </div>
        );
      })}

      {/* Téléphone */}
      {t > T.phone - 0.3 && (
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${ox}px, ${oy}px) scale(${z})`, opacity: 1 - sortie }}>
          <Phone layers={[]} overlay={
            <>
              {android ? <ChromePage t={t} T={T} /> : <SafariPage t={t} T={T} />}
              {android ? <Ring x={354} y={44} w={32} h={42} t={t} from={T.partager - 1.0} to={T.partager + 0.3} r={16} /> : <Ring x={172} y={SCREEN_H - 118 + 60 + 4} w={46} h={44} t={t} from={T.partager - 1.0} to={T.partager + 0.3} r={14} />}
              {android ? <ChromeMenu t={t} T={T} /> : <ShareSheet t={t} T={T} />}
              {android ? <ChromeDialog t={t} T={T} /> : <AddSheet t={t} T={T} />}
              <Accueil t={t} T={T} android={android} />
              <Ouverture t={t} T={T} android={android} />
            </>
          } />
        </div>
      )}

      {/* Doigt */}
      {android ? (
        <>
          {tap(370, 65, T.partager)}
          {tap(255, 36 + 6 + 6 * 46 + 23, T.ligne)}
          {tap(299, 495, T.ajouter)}
        </>
      ) : (
        <>
          {tap(195, SCREEN_H - 118 + 60 + 26, T.partager)}
          {tap(195, LIGNE_Y(5, 90) + 24, T.ligne)}
          {tap(339, 82, T.ajouter)}
        </>
      )}
      {tap(sAcc.x, sAcc.y, T.ouvre)}

      {/* « Même sans réseau » */}
      {(() => {
        const k = interpolate(t, [T.horsLigne, T.horsLigne + 0.4], [0, 1], { ...cl, easing: out });
        const o = Math.min(k, 1 - fade(t, T.fin - 0.2, T.fin + 0.1));
        if (o <= 0) return null;
        return (
          <div style={{ position: 'absolute', left: '50%', top: 258, translate: `-50% ${(1 - k) * 20}px`, opacity: o, background: C.ink, color: C.bg, borderRadius: 999, padding: '18px 34px', fontFamily: F.body, fontWeight: 600, fontSize: 38, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 24px 50px -20px rgba(30,32,29,0.55)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, background: C.accent }} />Même sans réseau
          </div>
        );
      })()}

      {/* Fin */}
      {t > T.fin + 0.1 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Galets size={330} start={Math.round((T.fin + 0.2) * fps)} pearlFrom={-70} />
          <div style={{ marginTop: 22, fontFamily: F.display, fontWeight: 600, fontSize: 112, color: C.ink, letterSpacing: interpolate(t, [T.fin + 0.5, T.fin + 1.3], [64, 28], { ...cl, easing: out }), paddingLeft: 28, opacity: fade(t, T.fin + 0.5, T.fin + 0.9) }}>ARVELA</div>
          <div style={{ marginTop: 20, fontFamily: F.mono, fontWeight: 600, fontSize: 32, letterSpacing: 10, color: C.accentInk, opacity: fade(t, T.fin + 1.0, T.fin + 1.4) }}>ARVELA.FR</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
