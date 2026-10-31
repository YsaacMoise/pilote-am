// Plus › Guide en vidéo : les trois clips de prise en main, à revoir quand on veut.
import { Topbar } from '../ui/kit';
import { VideoGuide } from '../ui/VideoGuide';

export function Guide() {
  return (
    <>
      <Topbar title="Guide en vidéo" back="#/plus" screen="guide" />
      <main>
        <VideoGuide initial="quotidien" />
      </main>
    </>
  );
}
