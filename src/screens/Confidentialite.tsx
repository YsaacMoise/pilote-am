// Politique de confidentialité d'Arvela : ce qui est gardé, où, pourquoi, combien de temps, qui y accède, et comment agir.
// Réécrite après l'audit du 30 octobre 2026 (C-030, C-032, C-033, C-140, C-144, C-152, C-153, C-156, C-159).
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
        <p class="muted">Mise à jour le {LEGAL.maj}. Arvela est en phase de test jusqu’au {LEGAL.finTest}.</p>

        <section class="card stack-sm">
          <h2>L’essentiel</h2>
          <p>Tes données servent à une seule chose : faire marcher l’app pour toi. Elles ne sont ni vendues, ni louées, ni utilisées pour de la publicité.</p>
          <p>Ce que tu saisis est rangé sur ton téléphone, avec une copie dans ton compte, hébergée à Paris. Aucun autre compte de l’app ne peut y accéder.</p>
          <p>La mesure d’usage est éteinte tant que tu ne l’allumes pas. Même allumée, elle ne reçoit jamais ce que tu écris ou choisis : ni prénoms, ni noms, ni horaires, ni montants, ni carnet, ni motifs d’absence. L’écran n’est jamais enregistré.</p>
        </section>

        <section class="card stack-sm">
          <h2>Qui est responsable</h2>
          <p>{LEGAL.responsable}. Pour toute question sur tes données : {LEGAL.contact}. Voir aussi les <a href="#/mentions">mentions légales</a>.</p>
          <p>Pour les données des enfants et des parents que tu saisis, c’est toi qui décides de ce que tu notes, comme dans un cahier. Arvela les garde et les traite pour ton compte, uniquement pour faire marcher l’app.</p>
        </section>

        <section class="card stack-sm">
          <h2>Qui peut voir tes données</h2>
          <p><b>Toi</b>, sur ton téléphone et dans ton compte.</p>
          <p><b>L’éditeur d’Arvela (YKM)</b> peut techniquement accéder à la copie en ligne, comme pour tout service en ligne. Il s’engage à ne la consulter qu’avec ton accord, au cas par cas, pour t’aider à résoudre un problème. Il lit en revanche tes remarques « Ça coince » et, si tu l’as acceptée, la mesure d’usage.</p>
          <p><b>Une analyse automatique chaque semaine</b> : un assistant d’intelligence artificielle (Claude, de la société Anthropic), lancé par l’éditeur, lit la mesure d’usage pour en faire un résumé. Il ne lit ni tes contrats, ni tes journées, ni ton carnet.</p>
          <p><b>Les prestataires techniques</b> : Google (hébergement et comptes) et PostHog (mesure d’usage), qui traitent les données pour le compte d’Arvela.</p>
          <p><b>Des relecteurs de sécurité</b>, mandatés par l’éditeur, peuvent lire le code et les réglages des services. Ils ne lisent pas tes données.</p>
        </section>

        <section class="card stack-sm">
          <h2>Ce qui est gardé, où et pourquoi</h2>
          <h3>Ton compte</h3>
          <p>Ton adresse e-mail et ton mot de passe, pour te connecter et retrouver tes données sur un autre appareil. Ils sont gérés par Google Firebase Authentication (société Google Ireland Limited), un service qui fonctionne depuis les États-Unis. Google garde aussi l’adresse internet de connexion quelques semaines, pour la sécurité.</p>
          <h3>Ce que tu saisis</h3>
          <p>Les contrats (prénom de l’enfant, nom de la famille, horaires, taux, indemnités, avenants), les journées (arrivées, départs, absences et leur motif, sans diagnostic), tes congés et absences, les chiffres des bulletins que tu contrôles, le carnet de liaison, tes remarques « Ça coince » et tes réglages.</p>
          <p>Tout est d’abord enregistré sur ton téléphone. Une copie est gardée dans ta base Google Firebase, hébergée à Paris. Elle permet de retrouver tes données si tu changes de téléphone. Des règles de sécurité empêchent tout autre compte de la lire.</p>
          <p>Les fichiers PDF des bulletins sont lus sur ton téléphone et ne sont pas envoyés : seuls les chiffres que tu enregistres sont gardés.</p>
          <h3>Le carnet de liaison</h3>
          <p>Les soins (température, médicament, petite chute) touchent à la santé de l’enfant. Ne les note qu’avec l’accord écrit des parents : le message prêt à envoyer, plus bas, le leur demande. Le carnet ne remplace pas le registre des médicaments que tu dois tenir.</p>
          <h3>Le lien pour les parents (seulement si tu le crées)</h3>
          <p>Depuis la fiche d’un enfant, tu peux créer un lien privé pour ses parents. Ils y voient son prénom, ton prénom, les arrivées, départs et absences des 7 derniers jours, le carnet de ces 7 jours, et les montants du mois et du mois précédent. Ni le nom de la famille, ni les autres enfants.</p>
          <p>Ces informations sont chiffrées sur ton téléphone avant de partir. La copie en ligne (Google Firebase, à Paris) ne peut être lue qu’avec le lien et le code à 4 chiffres que tu donnes de vive voix. Le lien et le code sont gardés dans ton compte, comme le reste de tes données. Le code protège d’un lien transféré par erreur ; il ne résiste pas longtemps à quelqu’un qui aurait le lien et s’acharnerait : ne publie jamais le lien.</p>
          <p>Couper le lien (ou supprimer le contrat, ou ton compte) efface la copie en ligne tout de suite.</p>
          <h3>La mesure d’usage (seulement si tu l’as allumée)</h3>
          <p>Si tu l’allumes dans Plus › Réglages, l’app envoie à PostHog (serveurs en Europe, à Francfort) le nom des écrans ouverts et des gestes faits (par exemple « arrivée pointée », « mois envoyé »), la version de l’app, un identifiant tiré au hasard, et les caractéristiques techniques que PostHog relève lui-même : modèle de téléphone, système, navigateur, taille d’écran, langue et fuseau horaire. Rien de ce que tu écris ou choisis n’est envoyé, l’écran n’est jamais enregistré, et le projet PostHog est réglé pour ne pas garder l’adresse internet de ton téléphone. Tu peux l’éteindre à tout moment.</p>
          <h3>La dictée</h3>
          <p>Si tu dictes avec le micro du clavier, c’est ton téléphone qui transcrit ta voix : selon tes réglages, Apple ou Google peut recevoir l’enregistrement. Arvela ne reçoit que le texte.</p>
          <h3>L’hébergement du site</h3>
          <p>Le site arvela.fr est servi par Google Firebase Hosting, qui garde l’adresse internet des visites quelques mois pour détecter les abus.</p>
        </section>

        <section class="card stack-sm">
          <h2>Combien de temps</h2>
          <p><b>Ton compte et ce que tu saisis :</b> tant que ton compte existe. Si tu supprimes ton compte, la copie en ligne est effacée tout de suite ; Google l’efface de ses sauvegardes sous 180 jours au plus.</p>
          <p><b>Le lien pour les parents :</b> tant que tu ne le coupes pas. Il est effacé avec le contrat ou le compte.</p>
          <p><b>La mesure d’usage :</b> les événements sont gardés 1 an au plus.</p>
          <p><b>Sur ton téléphone :</b> tant que tu gardes l’app. Tu restes libre de tout effacer.</p>
          <p><b>À la fin du test, le {LEGAL.finTest} :</b> l’éditeur te demande si tu veux continuer. Si tu arrêtes, tu fais d’abord une sauvegarde (Plus › Sauvegarde), puis ta copie en ligne et ta mesure d’usage sont effacées sous 30 jours.</p>
        </section>

        <section class="card stack-sm">
          <h2>Où vont les données hors d’Europe</h2>
          <p>La base de données est à Paris et la mesure d’usage à Francfort. La connexion au compte passe par Google aux États-Unis. Google est certifié au cadre de protection des données entre l’Union européenne et les États-Unis (le « Data Privacy Framework »), qui autorise ce transfert. PostHog et Google sont des sociétés américaines : la loi américaine peut leur demander l’accès à des données, même stockées en Europe.</p>
        </section>

        <section class="card stack-sm">
          <h2>Tes droits et comment les exercer</h2>
          <p><b>Consulter et emporter tes données :</b> Plus › Sauvegarde crée un fichier complet que tu gardes où tu veux.</p>
          <p><b>Corriger :</b> directement dans l’app.</p>
          <p><b>Effacer :</b> Plus › Compte › Supprimer mon compte efface la copie en ligne. Tu peux aussi effacer les données du téléphone en supprimant l’app. Pour effacer ta mesure d’usage déjà envoyée, écris à {LEGAL.email}.</p>
          <p><b>Refuser la mesure d’usage :</b> laisse-la éteinte, ou éteins-la dans Plus › Réglages.</p>
          <p><b>Toute autre demande :</b> {LEGAL.contact}.</p>
          <p>Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (Commission nationale de l’informatique et des libertés), l’autorité française chargée des données personnelles, sur cnil.fr.</p>
        </section>

        <section class="card stack-sm">
          <h2>Stockage sur l’appareil</h2>
          <p>Arvela n’utilise pas de cookies publicitaires. L’app garde tes données et tes préférences dans la mémoire de ton téléphone. Si tu as allumé la mesure d’usage, elle y garde aussi un identifiant tiré au hasard, effacé dès que tu l’éteins.</p>
        </section>

        <section class="card stack-sm">
          <h2>Informer les parents et leur demander leur accord</h2>
          <p>Les parents qui t’emploient doivent savoir que tu notes les informations de leur enfant dans une app. Pour le carnet de liaison, il te faut leur accord écrit. Voici un message prêt à leur envoyer : garde leur réponse.</p>
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
