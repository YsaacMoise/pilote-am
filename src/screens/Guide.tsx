// Plus › Vidéos : toutes les vidéos courtes, à revoir quand on veut, avec « Déjà vue ».
import { Topbar } from '../ui/kit';
import { ListeVideos } from '../ui/VideoGuide';

export function Guide() {
  return (
    <>
      <Topbar title="Vidéos" back="#/plus" screen="guide" />
      <main>
        <p class="hint">Des vidéos courtes, avec le son. Chacune apparaît aussi sur l’écran où elle sert, la première fois.</p>
        <ListeVideos />
      </main>
    </>
  );
}
