// T-122 : gestes communs des parcours e2e : création du compte et profil « Toi », puis ajout d'un enfant par l'assistant.
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

async function continuer(p) {
  await p.getByRole('button', { name: /^(Continuer|Relire avant de créer)$/ }).click();
}

/** Après « Créer mon compte » : écran « Toi » (prénom, département, enfants à charge), puis l'assistant s'ouvre. */
async function profil(p, { prenom = 'Sonia', departement = '31 – Haute-Garonne' } = {}) {
  await p.getByRole('heading', { name: 'Toi' }).waitFor();
  await p.getByLabel('Ton prénom').fill(prenom);
  if (departement) await p.getByLabel('Département où tu accueilles').fill(departement);
  await p.getByRole('button', { name: 'Ajouter un enfant accueilli' }).click();
}

/**
 * Ajoute un enfant par l'assistant (l'écran 1 doit être ouvert). Options : prenom, famille (nouvel employeur) ou employeur
 * (« Famille X » existante), debut (AAAA-MM-JJ), horaires ([arrivée, départ] du lundi au vendredi), taux (« 3,50 »),
 * departement (si le profil n'en a pas), avant (contrat commencé avant le mois en cours : congés pris, jours malade).
 */
async function ajouterEnfant(p, o) {
  const { prenom, famille, employeur, debut, horaires = ['08:00', '17:30'], jours = 5, taux = '3,50', departement, avant, creer = true, email } = o;
  await p.getByLabel('Prénom de l’enfant').fill(prenom);
  if (employeur) await p.getByRole('radio', { name: new RegExp(`^${employeur}`) }).click();
  else {
    if (await p.getByRole('radio', { name: /^Nouvel employeur/ }).count()) await p.getByRole('radio', { name: /^Nouvel employeur/ }).click();
    await p.getByLabel('Nom de famille de l’employeur').fill(famille);
  }
  if (email) await p.getByLabel('E-mail du parent employeur (facultatif)').fill(email);
  if (departement) await p.getByLabel('Département où tu accueilles').fill(departement);
  await continuer(p);
  await p.getByLabel('Date de début du contrat').fill(debut);
  await p.getByRole('radio', { name: /^CDI/ }).click();
  await p.getByRole('radio', { name: /^Régulier/ }).click();
  await continuer(p);
  await p.getByRole('radio', { name: /^Année complète/ }).click();
  await continuer(p);
  await p.getByRole('radio', { name: /^Identique chaque semaine/ }).click();
  for (const j of JOURS.slice(0, jours)) await p.getByRole('button', { name: j, exact: true }).click();
  for (const j of JOURS.slice(0, jours)) {
    await p.getByLabel(`${j}, arrivée`, { exact: true }).fill(horaires[0]);
    await p.getByLabel(`${j}, départ`, { exact: true }).fill(horaires[1]);
  }
  await continuer(p);
  await p.getByLabel('Taux horaire net').fill(taux);
  await p.getByRole('radio', { name: /^Celles de la convention/ }).click();
  await continuer(p);
  await p.getByRole('radio', { name: /^Par jour d’accueil/ }).click();
  await p.getByRole('radio', { name: /^Fournis par les parents/ }).click();
  await p.getByRole('radio', { name: /^Non prévues/ }).click();
  await continuer(p);
  if (avant) {
    const pris = p.getByLabel(/^Jours de congés déjà pris depuis le 1er juin/);
    if (await pris.count()) await pris.fill(String(avant.pris ?? 0));
    await p.getByRole('radio', { name: /^Non$/ }).first().click();
    await continuer(p);
    await p.getByLabel(/malade, avec certificat, déjà retenus/).fill(String(avant.malade ?? 0));
    await continuer(p);
  }
  await p.getByRole('heading', { name: `Récapitulatif · ${prenom}` }).waitFor();
  if (!creer) return;
  await p.getByRole('button', { name: new RegExp(`^Créer le contrat d`) }).click();
  await p.getByRole('heading', { name: new RegExp(`^Contrat d.${prenom} créé$`) }).waitFor();
}

module.exports = { continuer, profil, ajouterEnfant, JOURS };
