// Vidéos en motion design, au format téléphone (9:16), montrées au moment où elles servent :
//  - page d'accueil : un aperçu animé sans le son, qui ouvre « Une journée avec Arvela » (1 min) ;
//  - dans l'app : une bulle « ▶ Comment… » sur l'écran concerné, qui lance le passage utile (10 à 45 s),
//    puis disparaît une fois la vidéo vue ou la bulle fermée ;
//  - Plus › Vidéos : toutes les vidéos, avec « Déjà vue ».
// Fichiers dans public/videos/ (.mp4 H.264 + .vtt). Fabriqués avec Remotion (motion/) ; voix Google AI Studio (Nika).
// Pas de mise en cache hors ligne (trop lourd) : une vidéo ne se charge que si on appuie sur Lecture.
import { useEffect, useRef, useState } from 'preact/hooks';
import { logUsage } from '../store';
import { Sheet } from './kit';
import { Logo } from './Logo';

export type Clip = 'quotidien' | 'installer' | 'parents' | 'mois' | 'inviter' | 'simulateur';
type Systeme = 'iphone' | 'android';

interface ClipInfo { titre: string; duree: string; resume: string; pret: boolean }

/** `pret` : le fichier est dans public/videos/. Une vidéo pas encore prête n'apparaît nulle part. */
export const CLIPS: Record<Clip, ClipInfo> = {
  quotidien: { titre: 'Une journée avec Arvela', duree: '1 min', pret: true, resume: 'Pointer une arrivée et un départ, noter un repas, envoyer le résumé aux parents, voir ce qui est à déclarer à la fin du mois.' },
  mois: { titre: 'Ta fin de mois, prête à déclarer', duree: '37 s', pret: true, resume: 'Ce que la famille doit verser, les cases Pajemploi dans l’ordre, l’envoi au parent, le contrôle du bulletin.' },
  inviter: { titre: 'Inviter les parents', duree: '34 s', pret: true, resume: 'Créer le lien, donner le code de vive voix, envoyer le lien. Ce que les parents voient, et ce qu’ils ne peuvent pas faire.' },
  simulateur: { titre: 'Simuler un accueil', duree: '34 s', pret: true, resume: 'Le coût réel pour une nouvelle famille, mois par mois, avant de signer.' },
  parents: { titre: 'Suivre la journée de votre enfant', duree: '45 s', pret: true, resume: 'Ouvrir le lien, taper le code, suivre la journée en direct, retrouver les cases Pajemploi du mois.' },
  installer: { titre: 'Installer l’app', duree: '21 s', pret: true, resume: 'Les gestes pour mettre Arvela sur l’écran d’accueil. Une fois installée, elle marche même sans réseau.' },
};

/** Les emplacements des vidéos existent (repasser à false les masque partout). */
export const VIDEOS_PRETES = true;

/** Aides au bon moment : un passage d'une vidéo, ou une vidéo entière, rattaché à un écran. */
export interface Aide { clip: Clip; label: string; duree: string; debut?: number; fin?: number }
export const AIDES: Record<string, Aide | null> = {
  // Passages de « Une journée avec Arvela » (repères des sous-titres)
  pointer: { clip: 'quotidien', debut: 15.0, fin: 30.2, label: 'Comment pointer', duree: '15 s' },
  carnet: { clip: 'quotidien', debut: 30.2, fin: 39.6, label: 'Comment noter dans le carnet', duree: '10 s' },
  mois: CLIPS.mois.pret
    ? { clip: 'mois', label: 'Déclarer ton mois', duree: CLIPS.mois.duree }
    : { clip: 'quotidien', debut: 39.6, fin: 49.0, label: 'Préparer la déclaration', duree: '10 s' },
  inviter: CLIPS.inviter.pret
    ? { clip: 'inviter', label: 'Comment inviter les parents', duree: CLIPS.inviter.duree }
    : { clip: 'parents', label: 'Ce que voient les parents', duree: CLIPS.parents.duree },
  simulateur: CLIPS.simulateur.pret ? { clip: 'simulateur', label: 'Simuler avec une famille', duree: CLIPS.simulateur.duree } : null,
  parents: { clip: 'parents', label: 'Comment ça marche', duree: CLIPS.parents.duree },
};

// ---------- Vidéos vues, bulles fermées (propres à ce téléphone) ----------
const CLE = 'pam-videos';
interface Etat { vues: string[]; fermees: string[] }
function lire(): Etat {
  try { const e = JSON.parse(localStorage.getItem(CLE) || '{}'); return { vues: e.vues ?? [], fermees: e.fermees ?? [] }; } catch { return { vues: [], fermees: [] }; }
}
function ecrire(e: Etat) {
  try { localStorage.setItem(CLE, JSON.stringify(e)); } catch { /* navigation privée */ }
  window.dispatchEvent(new Event('pam-videos'));
}
export function videoVue(id: string): boolean { return lire().vues.includes(id); }
export function marquerVue(id: string) { const e = lire(); if (!e.vues.includes(id)) ecrire({ ...e, vues: [...e.vues, id] }); }
function fermerAide(id: string) { const e = lire(); if (!e.fermees.includes(id)) ecrire({ ...e, fermees: [...e.fermees, id] }); }
function useVues(): Etat {
  const [e, setE] = useState(lire);
  useEffect(() => {
    const f = () => setE(lire());
    window.addEventListener('pam-videos', f);
    return () => window.removeEventListener('pam-videos', f);
  }, []);
  return e;
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
const systemeDetecte = (): Systeme => (/Android/i.test(navigator.userAgent) ? 'android' : 'iphone');
const reduireMouvement = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const Lecture = ({ taille = 26 }: { taille?: number }) => (
  <span class="video-play" aria-hidden="true"><svg viewBox="0 0 24 24" width={taille} height={taille}><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
);

/** Affiche dans la charte : on voit tout de suite que c'est une vidéo, sa durée, et qu'elle a du son. */
function Affiche({ titre, duree, onPlay }: { titre: string; duree: string; onPlay: () => void }) {
  return (
    <button class="video-affiche" type="button" aria-label={`Lire la vidéo : ${titre} (${duree}, avec le son)`} onClick={onPlay}>
      <Logo size={44} />
      <span class="video-affiche-eyebrow">Vidéo · {duree}</span>
      <span class="video-affiche-titre">{titre}</span>
      <Lecture taille={30} />
      <span class="video-affiche-son">Avec le son</span>
    </button>
  );
}

/**
 * Une vidéo. `debut` / `fin` (secondes) : ne lire qu'un passage, puis proposer la vidéo entière.
 * `autoStart` : lecture dès l'ouverture (vidéo ouverte d'un geste) ; si le navigateur refuse, l'affiche reste.
 * `vue` : identifiant mémorisé quand la vidéo (ou le passage) a été vue jusqu'au bout.
 */
export function VideoClip({ clip, debut, fin, titre, autoStart = false, vue }: { clip: Clip; debut?: number; fin?: number; titre?: string; autoStart?: boolean; vue?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [entiere, setEntiere] = useState(false); // passage terminé → lecture de toute la vidéo
  const [finPassage, setFinPassage] = useState(false);
  const [sys, setSys] = useState<Systeme>(systemeDetecte);
  const c = CLIPS[clip];
  const fichier = clip === 'installer' ? `arvela-installer-${sys}` : `arvela-${clip}`;
  const nom = titre ?? (clip === 'installer' ? `${c.titre} sur ${sys === 'iphone' ? 'iPhone' : 'Android'}` : c.titre);
  const duree = titre && debut !== undefined && fin !== undefined ? `${Math.round(fin - debut)} s` : c.duree;
  const id = vue ?? clip;
  const passage = !entiere && debut !== undefined;

  const lancer = () => {
    const v = ref.current;
    if (!v) return;
    setStarted(true);
    setFinPassage(false);
    if (passage && (v.currentTime < (debut ?? 0) - 0.2 || (fin !== undefined && v.currentTime >= fin))) v.currentTime = debut ?? 0;
    v.play().then(() => logUsage('video_lecture', id)).catch(() => setStarted(false));
  };
  useEffect(() => { if (autoStart) lancer(); }, []);

  const finie = () => {
    marquerVue(id);
    logUsage('video_fin', id);
  };

  return (
    <div class="video-block">
      {clip === 'installer' && (
        <div class="seg seg-sm" role="radiogroup" aria-label="Ton téléphone">
          {(['iphone', 'android'] as Systeme[]).map((k) => (
            <button type="button" role="radio" aria-checked={sys === k} onClick={() => { setSys(k); setStarted(false); }}>{k === 'iphone' ? 'iPhone' : 'Android'}</button>
          ))}
        </div>
      )}
      <div class="video-frame">
        <video ref={ref} key={fichier} controls={started} preload={passage ? 'metadata' : 'none'} playsInline aria-label={`${nom}, ${duree}`}
          onTimeUpdate={(e) => {
            const v = e.currentTarget as HTMLVideoElement;
            if (passage && fin !== undefined && v.currentTime >= fin && !finPassage) { v.pause(); setFinPassage(true); finie(); }
          }}
          onEnded={finie}>
          <source src={`./videos/${fichier}.mp4${passage ? `#t=${debut}` : ''}`} type="video/mp4" />
          <track kind="captions" src={`./videos/${fichier}.vtt`} srclang="fr" label="Français" />
        </video>
        {!started && <Affiche titre={nom} duree={duree} onPlay={lancer} />}
        {finPassage && (
          <div class="video-fin">
            <button class="btn btn-accent" type="button" onClick={() => { setEntiere(true); setFinPassage(false); const v = ref.current; if (v) { v.currentTime = 0; v.play().catch(() => {}); } logUsage('video_entiere', id); }}>
              Voir la vidéo entière · {c.duree}
            </button>
            <button class="btn btn-outline" type="button" onClick={() => { setFinPassage(false); const v = ref.current; if (v) { v.currentTime = debut ?? 0; v.play().catch(() => {}); } }}>Revoir ce passage</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Une vidéo dans une feuille qui monte du bas, lancée d'un geste (le son est permis). */
export function VideoSheet({ aide, clip, vue, onClose }: { aide?: Aide; clip?: Clip; vue?: string; onClose: () => void }) {
  const a = aide ?? { clip: clip!, label: CLIPS[clip!].titre, duree: CLIPS[clip!].duree };
  const titre = aide?.debut !== undefined ? aide.label : CLIPS[a.clip].titre;
  return (
    <Sheet title={titre} onClose={onClose}>
      <VideoClip clip={a.clip} debut={a.debut} fin={a.fin} titre={aide?.debut !== undefined ? aide.label : undefined} autoStart vue={vue} />
    </Sheet>
  );
}

/**
 * Bulle « ▶ Comment… · 15 s » posée sur l'écran concerné. Elle disparaît quand la vidéo a été vue ou si on la ferme.
 * `permanente` : toujours affichée (page des parents).
 */
export function AideVideo({ id, permanente = false }: { id: keyof typeof AIDES | string; permanente?: boolean }) {
  const e = useVues();
  const [open, setOpen] = useState(false);
  const aide = AIDES[id];
  if (!VIDEOS_PRETES || !aide || !CLIPS[aide.clip].pret) return null;
  const masquee = !permanente && (e.vues.includes(id) || e.fermees.includes(id));
  if (masquee && !open) return null;
  return (
    <>
      <div class="aide-video">
        <button type="button" class="aide-video-btn" onClick={() => { setOpen(true); logUsage('aide_video', id); }}>
          <Lecture taille={16} />
          <span><b>{aide.label}</b> <span class="nowrap">· {aide.duree}</span></span>
        </button>
        {!permanente && <button type="button" class="aide-video-x" aria-label="Masquer cette aide" onClick={() => { fermerAide(id); logUsage('aide_video_fermee', id); }}>×</button>}
      </div>
      {open && <VideoSheet aide={aide} vue={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Page d'accueil : aperçu animé sans le son (6 s en boucle), qui ouvre la vidéo complète avec le son. */
export function ApercuVideo() {
  const [open, setOpen] = useState(false);
  const anime = !reduireMouvement();
  return (
    <>
      <button class="apercu-video" type="button" aria-label="Voir la vidéo : Une journée avec Arvela (1 minute, avec le son)" onClick={() => { setOpen(true); logUsage('accueil_video'); }}>
        <span class="apercu-ecran">
          {anime
            ? <video src="./videos/arvela-apercu.mp4" poster="./videos/arvela-apercu.jpg" muted autoPlay loop playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
            : <img src="./videos/arvela-apercu.jpg" alt="" />}
          <Lecture taille={30} />
        </span>
        <span class="apercu-legende">
          <span class="eyebrow">Vidéo · 1 minute · avec le son</span>
          <b>Voir Arvela en action</b>
          <small>Pointer une arrivée, noter un repas, retrouver le mois prêt à déclarer.</small>
        </span>
      </button>
      {open && <VideoSheet clip="quotidien" onClose={() => setOpen(false)} />}
    </>
  );
}

/** Liste de toutes les vidéos prêtes (Plus › Vidéos), avec « Déjà vue ». */
export function ListeVideos({ pourParents = false }: { pourParents?: boolean }) {
  const e = useVues();
  const [open, setOpen] = useState<Clip | null>(null);
  const ordre: Clip[] = pourParents ? ['parents'] : ['quotidien', 'mois', 'inviter', 'simulateur', 'installer', 'parents'];
  return (
    <div class="list">
      {ordre.filter((k) => CLIPS[k].pret).map((k) => (
        <button class="li video-li" type="button" onClick={() => setOpen(k)}>
          <span class="li-ico video-li-ico"><Lecture taille={16} /></span>
          <span class="li-main">
            <span class="li-title">{CLIPS[k].titre}</span>
            <span class="li-sub">{CLIPS[k].duree}{e.vues.includes(k) ? ' · déjà vue' : ''}{k === 'parents' ? ' · pour les parents' : ''}</span>
          </span>
          {e.vues.includes(k) && <span class="li-end video-vue" aria-label="Déjà vue">✓</span>}
        </button>
      ))}
      {open && <VideoSheet clip={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function nbVideos(): { total: number; vues: number } {
  const prets = (Object.keys(CLIPS) as Clip[]).filter((k) => CLIPS[k].pret);
  const v = lire().vues;
  return { total: prets.length, vues: prets.filter((k) => v.includes(k)).length };
}

/** Démonstration : à la première ouverture, une minute pour tout voir (une seule fois). */
export function BienvenueDemo() {
  const CLE_DEMO = 'pam-demo-video';
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(CLE_DEMO); } catch { return false; } });
  if (!open || !VIDEOS_PRETES) return null;
  const fermer = () => { try { localStorage.setItem(CLE_DEMO, '1'); } catch { /* */ } setOpen(false); };
  return (
    <Sheet title="Bienvenue dans la démonstration" onClose={fermer}>
      <div class="stack">
        <p>Trois enfants fictifs, une semaine déjà remplie. Une minute pour voir l’essentiel, ou explore seule.</p>
        <VideoClip clip="quotidien" />
        <button class="btn btn-outline btn-lg btn-block" type="button" onClick={fermer}>Explorer seule</button>
      </div>
    </Sheet>
  );
}
