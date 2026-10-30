// Politique de confidentialité d'Arvela : ce qui est gardé, où, pourquoi, combien de temps, et comment agir.
import { toast } from '../store';
import { LEGAL, TEXTE_PARENTS } from '../legal';
import { shareText } from '../share';
import { Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

export function Confidentialite({ back = '#/plus' }: { back?: string }) {
  return (
    <>
      <Topbar title="Confidentialité" back={back} screen="confidentialite" />
      <main class="prose-page">
        <p class="muted">Mise à jour le {LEGAL.maj}. Arvela est en phase de test.</p>

        <section class="card stack-sm">
          <h2>L’essentiel</h2>
          <p>Tes données servent à une seule chose : faire marcher l’app pour toi. Elles ne sont ni vendues, ni louées, ni utilisées pour de la publicité.</p>
          <p>Ce que tu saisis est rangé sur ton téléphone, avec une copie dans ton compte, en France. Aucun autre compte de l’app ne peut y accéder.</p>
          <p>La mesure d’usage, qui sert à améliorer l’app, ne reçoit jamais les prénoms des enfants, les noms des familles ni ton adresse e-mail.</p>
        </section>

        <section class="card stack-sm">
          <h2>Qui est responsable</h2>
          <p>{LEGAL.responsable}. Pour toute question sur tes données : {LEGAL.contact}.</p>
          <p>Pour les données des enfants et des parents que tu saisis, c’est toi qui décides de ce que tu notes, comme dans un cahier. Arvela les garde et les traite pour ton compte, uniquement pour faire marcher l’app.</p>
          <p>Comme pour tout service en ligne, l’éditeur d’Arvela peut techniquement accéder à la copie en ligne, pour l’entretien du service.</p>
        </section>

        <section class="card stack-sm">
          <h2>Ce qui est gardé, où et pourquoi</h2>
          <h3>Ton compte</h3>
          <p>Ton adresse e-mail et ton mot de passe, pour te connecter et retrouver tes données sur un autre appareil. Ils sont gérés par Google Firebase Authentication, un service qui fonctionne depuis les États-Unis. Google garde aussi l’adresse internet de connexion quelques semaines, pour la sécurité.</p>
          <h3>Ce que tu saisis</h3>
          <p>Les contrats (prénom de l’enfant, nom de la famille, horaires, taux, indemnités, avenants), les journées (arrivées, départs, absences et leur motif, sans diagnostic), tes congés et absences, les chiffres des bulletins que tu contrôles, le carnet de liaison, tes remarques « Ça coince » et tes réglages.</p>
          <p>Tout est d’abord enregistré sur ton téléphone. Une copie est gardée dans ta base Google Firebase, hébergée à Paris. Elle permet de retrouver tes données si tu changes de téléphone ou si tu utilises un autre appareil. Des règles de sécurité empêchent tout autre compte de la lire.</p>
          <p>Les fichiers PDF des bulletins sont lus sur ton téléphone et ne sont pas envoyés : seuls les chiffres que tu enregistres sont gardés.</p>
          <h3>La mesure d’usage</h3>
          <p>Pendant le test, l’app envoie à PostHog (serveurs en Europe, à Francfort) les écrans ouverts, les gestes, les erreurs et des enregistrements de l’écran. Avant tout envoi, les prénoms des enfants, les noms des familles et ton prénom sont remplacés par « Enfant 1 », « Famille 1 », « AM ». Les adresses e-mail, ce que tu tapes dans les champs et les notes libres du carnet ne sont jamais envoyés. L’adresse internet de ton téléphone n’est pas gardée.</p>
          <p>Tu peux couper cette mesure à tout moment dans Plus › Réglages.</p>
          <h3>L’hébergement du site</h3>
          <p>Le site arvela.fr est servi par Google Firebase Hosting, qui garde l’adresse internet des visites quelques mois pour détecter les abus.</p>
        </section>

        <section class="card stack-sm">
          <h2>Combien de temps</h2>
          <p><b>Ton compte et ce que tu saisis :</b> tant que ton compte existe. Si tu supprimes ton compte, la copie en ligne est effacée tout de suite ; Google l’efface de ses sauvegardes sous 180 jours au plus.</p>
          <p><b>La mesure d’usage :</b> les événements sont gardés 1 an, les enregistrements de l’écran 30 jours.</p>
          <p><b>Sur ton téléphone :</b> tant que tu gardes l’app. Tu restes libre de tout effacer.</p>
        </section>

        <section class="card stack-sm">
          <h2>Où vont les données hors d’Europe</h2>
          <p>La base de données est à Paris et la mesure d’usage à Francfort. La connexion au compte passe par Google aux États-Unis. Google est certifié au cadre de protection des données entre l’Union européenne et les États-Unis (le « Data Privacy Framework »), qui autorise ce transfert.</p>
        </section>

        <section class="card stack-sm">
          <h2>Tes droits et comment les exercer</h2>
          <p><b>Consulter et emporter tes données :</b> Plus › Sauvegarde crée un fichier complet que tu gardes où tu veux.</p>
          <p><b>Corriger :</b> directement dans l’app.</p>
          <p><b>Effacer :</b> Plus › Compte › Supprimer mon compte efface la copie en ligne. Tu peux aussi effacer les données du téléphone en supprimant l’app.</p>
          <p><b>Refuser la mesure d’usage :</b> Plus › Réglages.</p>
          <p><b>Toute autre demande :</b> {LEGAL.contact}.</p>
          <p>Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (Commission nationale de l’informatique et des libertés), l’autorité française chargée des données personnelles, sur cnil.fr.</p>
        </section>

        <section class="card stack-sm">
          <h2>Stockage sur l’appareil</h2>
          <p>Arvela n’utilise pas de cookies publicitaires. L’app garde tes données et tes préférences dans la mémoire de ton téléphone, et un identifiant anonyme pour la mesure d’usage, effacé si tu coupes la mesure ou supprimes l’app.</p>
        </section>

        <section class="card stack-sm">
          <h2>Informer les parents</h2>
          <p>Les parents qui t’emploient doivent savoir que tu notes les informations de leur enfant dans une app. Voici un message prêt à leur envoyer.</p>
          <blockquote class="quote-box">{TEXTE_PARENTS.split('\n\n').map((p) => <p>{p}</p>)}</blockquote>
          <button class="btn btn-secondary btn-block" onClick={async () => {
            const r = await shareText(TEXTE_PARENTS);
            if (r === 'copied') toast('Message copié : colle-le dans ton message aux parents.');
            else if (r === 'failed') toast('Impossible de copier le message sur cet appareil.');
          }}><Icon name="share" />Envoyer ce message aux parents</button>
        </section>

        <section class="card stack-sm">
          <h2>Changements</h2>
          <p>Si cette politique change, la nouvelle version sera affichée ici avec sa date. En cas de changement important, l’app te prévient.</p>
        </section>
      </main>
    </>
  );
}
