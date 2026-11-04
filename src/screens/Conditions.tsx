// Conditions d'utilisation d'Arvela, avec le contrat de traitement des données exigé par l'article 28 du RGPD.
// Répartition retenue (à faire valider par un juriste, docs/points-a-faire-valider.md) :
// l'assistante maternelle est responsable des données des enfants et des parents qu'elle saisit, Arvela est son sous-traitant ;
// pour le compte de l'AM, la mesure d'usage et la protection anti-robots, Arvela est responsable (politique de confidentialité).
// Le registre des traitements et l'analyse d'impact sont dans docs/.
import { AVERTISSEMENT_CALCUL, LEGAL } from '../legal';
import { Topbar } from '../ui/kit';

export function Conditions({ back = '#/plus' }: { back?: string }) {
  return (
    <>
      <Topbar title="Conditions d’utilisation" back={back} screen="conditions" />
      <main class="prose-page">
        <p class="muted">Mise à jour le {LEGAL.majConditions}. Arvela est en phase de test jusqu’au {LEGAL.finTest}.</p>

        <section class="card stack-sm">
          <h2>L’essentiel</h2>
          <p>Arvela est une app pour les assistantes maternelles : arrivées et départs, carnet de liaison, montants à déclarer sur Pajemploi, congés, fin de contrat.</p>
          <p>Elle est gratuite pendant le test. En créant ton compte, tu acceptes ces conditions.</p>
          <p>Tu restes maîtresse de tes données. Arvela les garde pour toi et ne s’en sert que pour faire marcher l’app. Elles ne sont ni vendues, ni louées, ni utilisées pour de la publicité.</p>
        </section>

        <section class="card stack-sm">
          <h2>Qui édite Arvela</h2>
          <p>{LEGAL.editeur}. Contact : {LEGAL.contact}.</p>
          <p>Voir aussi les <a href="#/mentions">mentions légales</a> et la <a href="#/confidentialite">politique de confidentialité</a>.</p>
        </section>

        <section class="card stack-sm">
          <h2>Ce que fait l’app</h2>
          <p>Tu notes les contrats, les journées, les absences, le carnet et tes congés. L’app calcule les montants du mois, les congés payés, les indemnités de fin de contrat et l’abattement fiscal. Tu peux créer un lien privé pour les parents.</p>
          <p>Tout est rangé sur ton téléphone. Avec un compte, une copie est gardée en ligne, à Paris : tu retrouves tout sur un autre appareil.</p>
          <p>Arvela est en test. Des fonctions peuvent changer, être ajoutées ou retirées. L’éditeur fait de son mieux pour que l’app marche, mais il ne garantit pas qu’elle sera toujours disponible ni sans erreur.</p>
        </section>

        <section class="card stack-sm">
          <h2>Les calculs</h2>
          <p>{AVERTISSEMENT_CALCUL}</p>
          <p>Arvela n’est pas un service de l’Urssaf, de Pajemploi ni de la CAF. Elle ne remplace ni un conseil juridique, ni le relais petite enfance.</p>
          <p>Les règles appliquées et les choix de l’app sont expliqués dans Plus › Comment l’app calcule.</p>
        </section>

        <section class="card stack-sm">
          <h2>Ton compte</h2>
          <p>Il te faut une adresse e-mail valable. Un compte sert à une seule personne : ne le partage pas.</p>
          <p>Garde ton mot de passe secret. Si tu penses que quelqu’un le connaît, change-le et écris à {LEGAL.email}.</p>
          <p>Tu peux supprimer ton compte à tout moment : Plus › Compte › Supprimer mon compte.</p>
        </section>

        <section class="card stack-sm">
          <h2>Tes engagements</h2>
          <p>Tu utilises Arvela pour ton activité d’assistante maternelle, et pour rien d’autre.</p>
          <p>Tu informes les parents qui t’emploient que tu notes les informations de leur enfant dans Arvela. Pour le carnet de liaison, tu leur demandes leur accord écrit. Un message prêt à envoyer est dans la <a href="#/confidentialite">politique de confidentialité</a>.</p>
          <p>Tu ne notes que ce qui sert à l’accueil et à la paie. Pas de diagnostic, pas de numéro de sécurité sociale, rien sur la vie privée de la famille.</p>
          <p>Tu ne publies jamais le lien des parents, et tu donnes le code de vive voix.</p>
          <p>Tu n’essaies pas d’accéder aux données des autres comptes ni de gêner le service.</p>
        </section>

        <section class="card stack-sm">
          <h2>Responsabilité</h2>
          <p>L’app est fournie gratuitement, telle qu’elle est. Tu restes responsable de ce que tu déclares sur Pajemploi et de ce que tu remets aux parents : vérifie les montants avant.</p>
          <p>Fais une sauvegarde de temps en temps (Plus › Sauvegarde). Elle ne dépend d’aucun compte.</p>
          <p>Rien dans ces conditions ne te prive des droits que la loi te garantit.</p>
        </section>

        <section class="card stack-sm">
          <h2>Contrat de traitement des données</h2>
          <p>Cette partie est le contrat prévu par l’article 28 du règlement général sur la protection des données (RGPD). Elle fixe ce qu’Arvela peut faire, et ne pas faire, avec les données que tu saisis.</p>

          <h3>Qui décide, qui exécute</h3>
          <p>Pour les données des enfants et des parents que tu saisis, et pour les données de ton activité, c’est toi qui décides ce que tu notes et pourquoi. Tu es la « responsable du traitement ». Arvela garde et traite ces données pour ton compte : Arvela est ton « sous-traitant ».</p>
          <p>Pour ton propre compte (adresse e-mail, connexion), la mesure d’usage, la protection contre les robots et tes remarques « Ça coince », c’est Arvela qui décide. Ces traitements sont décrits dans la <a href="#/confidentialite">politique de confidentialité</a>.</p>

          <h3>Ce que fait Arvela pour toi, et combien de temps</h3>
          <p><b>Ce qu’Arvela fait :</b> garder une copie en ligne de tes données, la tenir à jour entre tes appareils, la sauvegarder chaque jour, et préparer le lien privé des parents si tu le crées. Les calculs sont faits sur ton téléphone.</p>
          <p><b>Pourquoi :</b> faire marcher l’app pour toi, et pour rien d’autre.</p>
          <p><b>Combien de temps :</b> tant que ton compte existe. Ce contrat prend fin quand tu supprimes ton compte ou quand le service s’arrête.</p>

          <h3>Les données et les personnes concernées</h3>
          <p><b>Les enfants accueillis :</b> prénom, horaires prévus, arrivées et départs, absences et leur motif (par exemple « malade, avec certificat »), repas, et, si tu le coches, le fait que l’enfant ouvre droit à l’abattement fiscal majoré (handicap ou maladie). Le carnet de liaison : repas et biberons, sommeil, change, humeur, soins (température, médicament donné, lavage de nez, crème, plaie désinfectée), petits incidents (chute, bosse, morsure, vomissement, saignement de nez) et notes libres.</p>
          <p><b>Les parents qui t’emploient :</b> nom de la famille, conditions du contrat (taux, indemnités, avenants), montants du mois.</p>
          <p><b>Toi :</b> ton prénom, le nombre de tes propres enfants à charge, tes congés et absences avec leur motif (par exemple « je suis malade »), les chiffres de tes bulletins.</p>
          <p>Les soins, les motifs de maladie et le handicap touchent à la santé. Ce sont des données sensibles : ne les note qu’avec l’accord écrit des parents, et seulement ce qui est utile.</p>

          <h3>Les engagements d’Arvela</h3>
          <p><b>Tes instructions.</b> Arvela n’utilise ces données que pour faire ce que décrit ce contrat, et ce que tu fais toi-même dans l’app. Ces conditions et tes actions dans l’app sont tes instructions. Si une loi oblige Arvela à faire autre chose (par exemple une demande d’un juge), Arvela te prévient avant, sauf si la loi l’interdit. Si une de tes instructions semble contraire au RGPD, Arvela te le dit tout de suite. Arvela ne transfère pas ces données hors de l’Union européenne ; seul reste possible l’accès de Google, société américaine, décrit dans la politique de confidentialité.</p>
          <p><b>La confidentialité.</b> Aujourd’hui, seul l’éditeur (YKM) peut accéder techniquement à la copie en ligne. Il est tenu au secret. Il ne la consulte qu’avec ton accord, au cas par cas, pour t’aider à résoudre un problème. Toute autre personne qui aurait un jour cet accès serait tenue au même secret.</p>
          <p><b>La sécurité.</b> La copie en ligne est hébergée à Paris. Chaque compte ne peut lire que ses propres données. Les échanges sont chiffrés. Ce que voient les parents est chiffré sur ton téléphone avant de partir. L’app est publiée sans clé secrète stockée, et chaque changement est vérifié avant d’être mis en ligne. La base est sauvegardée chaque jour, et chaque sauvegarde est gardée {LEGAL.joursSauvegardes} jours.</p>
          <p><b>Les autres prestataires.</b> Tu autorises Arvela à confier l’hébergement de ces données à Google (services Firebase et Google Cloud : base de données à Paris et ses sauvegardes). Google est tenu par contrat aux mêmes obligations de protection. Arvela reste responsable envers toi de ce que fait Google. Avant d’ajouter ou de changer un prestataire qui touche à ces données, Arvela te prévient dans l’app. Tu peux t’y opposer en écrivant à {LEGAL.email}. Si aucune solution n’est trouvée, tu peux arrêter : tu récupères tes données, puis ta copie en ligne est effacée.</p>
          <p><b>Les droits des personnes.</b> Tu peux consulter, corriger, exporter et effacer les données directement dans l’app. Si un parent écrit à Arvela pour exercer ses droits, Arvela te transmet sa demande sans y répondre à ta place.</p>
          <p><b>Les incidents.</b> Si Arvela découvre une fuite, une perte ou un accès non autorisé qui touche tes données, Arvela te prévient sans délai excessif, si possible dans les 48 heures, avec ce qui est connu et ce qui est fait. Arvela t’aide pour la sécurité, pour déclarer l’incident à la CNIL et pour prévenir les parents si besoin.</p>
          <p><b>L’analyse d’impact.</b> Arvela a fait une analyse d’impact sur la protection des données et tient un registre des traitements. Tu peux les demander à {LEGAL.email} : ils t’aident pour tes propres obligations, y compris si tu dois consulter la CNIL avant de commencer.</p>
          <p><b>La fin du contrat.</b> Tu peux emporter toutes tes données à tout moment : Plus › Sauvegarde crée un fichier complet. Quand tu supprimes ton compte, la copie en ligne et les liens des parents sont effacés tout de suite. Ils disparaissent des sauvegardes quotidiennes sous {LEGAL.joursSauvegardes} jours, et des copies techniques de Google sous 180 jours au plus. Si le service s’arrête, l’éditeur te prévient à l’avance pour que tu fasses ta sauvegarde, puis la copie en ligne est effacée sous 30 jours.</p>
          <p><b>Les vérifications.</b> Arvela te donne, sur demande, les informations qui montrent qu’il respecte ce contrat : registre, analyse d’impact, description des mesures de sécurité. Tu peux poser tes questions et demander une vérification, faite par toi ou par une personne que tu choisis, en prévenant à l’avance. Une vérification ne peut pas donner accès aux données des autres utilisatrices.</p>

          <h3>Tes propres engagements</h3>
          <p>Tu informes les parents, tu obtiens leur accord écrit pour le carnet et tu gardes leur réponse. Tu réponds à leurs demandes (consulter, corriger, effacer). Tu supprimes les données d’un contrat quand tu n’en as plus besoin pour tes obligations (déclarations, impôts).</p>
        </section>

        <section class="card stack-sm">
          <h2>Changements et fin</h2>
          <p>Si ces conditions changent, la nouvelle version est affichée ici avec sa date. En cas de changement important, l’app te prévient avant qu’il s’applique. Si tu n’es pas d’accord, tu peux supprimer ton compte après avoir fait une sauvegarde.</p>
          <p>L’éditeur peut suspendre un compte qui gêne le service ou qui sert à autre chose qu’à l’accueil des enfants. Il te prévient, sauf urgence de sécurité.</p>
          <p>Ces conditions sont soumises au droit français. En cas de désaccord, écris d’abord à {LEGAL.email} pour chercher une solution.</p>
        </section>
      </main>
    </>
  );
}
