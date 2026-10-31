// Guides vidéo en motion design, au format téléphone (9:16). Deux sujets, jamais une longue vidéo :
//  - « Au quotidien » (environ 60 s) : pointer, noter dans le carnet, envoyer aux parents, voir le mois ;
//  - « Installer » (environ 25 s), en deux versions, iPhone et Android : chacun ne voit que les gestes de son téléphone.
// Fichiers dans public/videos/ : arvela-quotidien, arvela-installer-iphone, arvela-installer-android (.mp4 H.264 + .vtt).
// Ils ne sont pas mis en cache hors ligne (trop lourds) : une vidéo ne se charge que si on appuie sur Lecture.
import { useRef, useState } from 'preact/hooks';
import { Logo } from './Logo';

export type Clip = 'quotidien' | 'installer';
type Systeme = 'iphone' | 'android';

const CLIPS: Record<Clip, { onglet: string; titre: string; duree: string; resume: string }> = {
  quotidien: { onglet: 'Au quotidien', titre: 'Une journée avec Arvela', duree: '1:00', resume: 'Pointer une arrivée et un départ, noter un repas, envoyer le résumé aux parents, voir ce qui est à déclarer à la fin du mois.' },
  installer: { onglet: 'Installer', titre: 'Installer l’app', duree: '0:25', resume: 'Les gestes pour mettre Arvela sur l’écran d’accueil. Une fois installée, elle marche même sans réseau.' },
};

/** Vrai quand les vidéos sont déposées : avant, aucun emplacement n'apparaît dans l'app. */
export const VIDEOS_PRETES = (import.meta as any).env?.VITE_VIDEOS === '1';

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
const systemeDetecte = (): Systeme => (/Android/i.test(navigator.userAgent) ? 'android' : 'iphone');

export function VideoClip({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [sys, setSys] = useState<Systeme>(systemeDetecte);
  const c = CLIPS[clip];
  const fichier = clip === 'installer' ? `arvela-installer-${sys}` : 'arvela-quotidien';
  const titre = clip === 'installer' ? `${c.titre} sur ${sys === 'iphone' ? 'iPhone' : 'Android'}` : c.titre;
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
        <video ref={ref} key={fichier} controls={started} preload="none" playsInline aria-label={`${titre}, ${c.duree}`}>
          <source src={`./videos/${fichier}.mp4`} type="video/mp4" />
          <track kind="captions" src={`./videos/${fichier}.vtt`} srclang="fr" label="Français" default />
        </video>
        {!started && (
          <button class="video-poster" type="button" aria-label={`Lire la vidéo : ${titre} (${c.duree})`}
            onClick={() => { setStarted(true); ref.current?.play().catch(() => {}); }}>
            <Logo size={56} />
            <span class="video-poster-title">{titre}</span>
            <span class="video-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
            <span class="video-duree">{c.duree}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Les deux vidéos derrière des onglets (page d'accueil, Plus › Guide en vidéo) */
export function VideoGuide({ initial = 'quotidien' }: { initial?: Clip }) {
  const [clip, setClip] = useState<Clip>(initial);
  return (
    <div class="video-guide">
      <div class="seg" role="radiogroup" aria-label="Choisir une vidéo">
        {(Object.keys(CLIPS) as Clip[]).map((k) => (
          <button type="button" role="radio" aria-checked={clip === k} onClick={() => setClip(k)}>{CLIPS[k].onglet}</button>
        ))}
      </div>
      <VideoClip clip={clip} key={clip} />
      <p class="hint video-resume">{CLIPS[clip].resume}</p>
    </div>
  );
}
