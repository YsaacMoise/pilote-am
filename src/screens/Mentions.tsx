// Mentions légales (audit du 30 octobre 2026 : C-120, C-121, C-151).
// Les conditions d'utilisation et le contrat de traitement des données (article 28 du RGPD) sont sur l'écran Conditions.
import { AVERTISSEMENT_CALCUL, LEGAL } from '../legal';
import { Topbar } from '../ui/kit';

export function Mentions({ back = '#/plus' }: { back?: string }) {
  return (
    <>
      <Topbar title="Mentions légales" back={back} screen="mentions" />
      <main class="prose-page">
        <p class="muted">Mise à jour le {LEGAL.maj}.</p>

        <section class="card stack-sm">
          <h2>Éditeur</h2>
          <p>{LEGAL.editeur}. Conformément à la loi pour la confiance dans l’économie numérique, son identité complète est communiquée à l’hébergeur.</p>
          <p>Contact : {LEGAL.email}</p>
        </section>

        <section class="card stack-sm">
          <h2>Hébergement</h2>
          <p><b>Site :</b> {LEGAL.hebergeurSite}.</p>
          <p><b>Données des comptes :</b> {LEGAL.hebergeurDonnees}.</p>
        </section>

        <section class="card stack-sm">
          <h2>Conditions d’utilisation</h2>
          <p>Arvela est en phase de test jusqu’au {LEGAL.finTest}. L’app est fournie gratuitement, telle qu’elle est.</p>
          <p>{AVERTISSEMENT_CALCUL}</p>
          <p>Arvela n’est pas un service de l’Urssaf, de Pajemploi ni de la CAF. Les mentions de Pajemploi dans l’app servent seulement à indiquer où reporter les montants.</p>
          <p>Les règles d’usage et le contrat de traitement des données (article 28 du RGPD) figurent dans les <a href="#/conditions">conditions d’utilisation</a>. Le détail du traitement des données figure dans la <a href="#/confidentialite">politique de confidentialité</a>.</p>
        </section>
      </main>
    </>
  );
}
