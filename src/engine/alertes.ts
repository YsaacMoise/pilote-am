// T-116 : revue des alertes de l'écran Mois (demande du DG du 26/11/2026 : « il devrait y en avoir ZÉRO »).
// Une alerte (bandeau orange) reste seulement pour un vrai problème que l'AM peut régler. Une information sur le calcul, ou
// une donnée à donner, s'affiche en bandeau d'information. Les montants ne changent pas : seul le ton de l'écran change.
// Liste et décisions : calculateur-arvela, rapports/T-115-execution.md, section T-116.

/** Débuts des messages d'information (aucune action à faire, ou seulement une donnée à donner). */
const INFORMATIONS = [
  'Avenant au ',                                  // salaire au prorata de chaque période d'un avenant : explication
  'Régularisation à l’avenant non calculée : il manque', // donnée à donner (semaines sans accueil)
  'Année incomplète : il manque',                 // donnée à donner (semaines sans accueil)
  'Ton CDD finit le ',                            // rappel du terme à venir
  'Préavis dont les parents t’ont dispensée',      // comment déclarer
  'Férié du ',                                    // férié non payé : règle de l'article 47 appliquée
  'Horaires variables : ',                        // base du salaire des horaires variables
  'Accueil occasionnel : ton salaire n’est pas lissé', // explication du salaire de l'accueil occasionnel
  'Absente tout le mois',                         // aucune déclaration à faire
  'Congé indemnisé par la Sécurité sociale',      // indemnités journalières déduites
  'Absence pour ta maladie ou celle de ton enfant, en Alsace-Moselle : les parents maintiennent', // idem, Alsace-Moselle
  'Congé ou arrêt en Alsace-Moselle : les parents maintiennent', // idem, congé ou arrêt en Alsace-Moselle (T-104)
  'Des jours d’enfant malade dépassent la limite', // ils restent payés
  'Indemnité kilométrique : contrôle impossible', // donnée à donner (puissance fiscale)
  'Mayotte : l’app ne calcule pas la réduction',  // Pajemploi la calcule : renvoi au relevé
];

/** Messages d'information de l'écran Mois : explication ou donnée à donner, pas un problème. */
export function estInformation(a: string): boolean {
  if (/^Régularisation à l’avenant du \d\d\/\d\d : .* accueillies depuis le /.test(a)) return true; // régularisation payée
  if (/^\d+ départs? non pointés? : l’heure prévue a été retenue\.$/.test(a)) return true; // déjà dit sur « Aujourd’hui »
  return INFORMATIONS.some((p) => a.startsWith(p));
}
