"""Mensualisation et salaire de base du mois (domaine 2 de regles-v0)."""

from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, entier, positif,
    vers_centimes, texte_fraction, verifier_date_ccn,
)

SEUIL_CONVENTIONNEL_MINUTES = 45 * 60  # R-HC-01 (CCN art. 96.2)


def _type_annee(semaines_accueil):
    # R-MENS-02 (CCN art. 97.1) : 52 semaines = annee complete ; 46 ou moins = incomplete.
    if semaines_accueil == 52:
        return "complete"
    if 1 <= semaines_accueil <= 46:
        return "incomplete"
    if 47 <= semaines_accueil <= 51:
        raise NonGere("A-01", ["R-MENS-02"], precision=f"{semaines_accueil} semaines.")
    raise ErreurSaisie("semaines_accueil : entre 1 et 52.", ["R-MENS-02"])


@api("R-MENS-02")
def type_annee(semaines_accueil):
    """R-MENS-02. Entree : semaines_accueil (entier). Sortie : « complete » ou
    « incomplete ». Refus A-01 de 47 a 51 semaines, A-05 si non entier."""
    if not isinstance(semaines_accueil, int) or isinstance(semaines_accueil, bool):
        raise NonGere("A-05", ["R-MENS-04"])
    return resultat_ok(type_annee.regles, {"type_annee": _type_annee(semaines_accueil)})


@api("R-MENS-02", "R-MENS-04", "R-CP-05")
def semaines_programmees(semaines_absence_employeur, semaines_repos_am, semaines_communes):
    """Nombre de semaines programmees sur 52 (R-MENS-02, R-MENS-04, R-CP-05).
    Les semaines non travaillees sont l'union des semaines ou l'employeur ne
    confie pas l'enfant et des semaines de repos de l'AM.
    Entrees : entiers. Sortie : semaines_programmees, type_annee."""
    for v, n in ((semaines_absence_employeur, "semaines_absence_employeur"),
                 (semaines_repos_am, "semaines_repos_am"), (semaines_communes, "semaines_communes")):
        if not isinstance(v, int) or isinstance(v, bool):
            raise NonGere("A-05", ["R-MENS-04"], precision=f"{n} non entier.")
        entier(v, n)
    if semaines_communes > min(semaines_absence_employeur, semaines_repos_am):
        raise ErreurSaisie("semaines_communes depasse l'une des deux durees.")
    non_travaillees = semaines_absence_employeur + semaines_repos_am - semaines_communes
    s = 52 - non_travaillees
    if s < 1:
        raise ErreurSaisie("Aucune semaine programmee.")
    return resultat_ok(semaines_programmees.regles,
                       {"semaines_programmees": s, "type_annee": _type_annee(s)})


def _mensualisation(semaines_accueil, heures_hebdo_minutes, taux_horaire_centimes,
                    nature_taux="brut", horaires_variables=False, date_paie=None, majoration_hm_pourcent=None):
    regles = ["R-MENS-01", "R-MENS-02", "R-MENS-03", "R-MENS-04", "R-SAL-06"]
    verifier_date_ccn(date_paie, regles)
    if nature_taux != "brut":
        # A-02 et R-PAJ-04 (douteuse) : le moteur B ne travaille qu'en brut.
        raise NonGere("A-02", regles, precision="Taux fourni en net.")
    if horaires_variables:
        raise NonGere("A-04", regles)
    if not isinstance(semaines_accueil, int) or isinstance(semaines_accueil, bool):
        raise NonGere("A-05", regles)
    ta = _type_annee(semaines_accueil)
    h = positif(heures_hebdo_minutes, "heures_hebdo_minutes")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    minutes_mensualisees = h * semaines_accueil / 12
    if h > SEUIL_CONVENTIONNEL_MINUTES:
        # verif-1 (B-10, H5) : CCN 108.1 (salaire mensualise « quels que soient le nombre d'heures de travail par
        # semaine ») et 110.1 (heures au-dela de 45 h majorees du taux du contrat, au moins 10 %) : les heures
        # prevues au-dela de 45 h entrent majorees dans le salaire mensualise. Sans le taux : refus A-13.
        if majoration_hm_pourcent is None:
            raise NonGere("A-13", regles + ["R-HC-03"], precision="Contrat de plus de 45 heures par semaine.")
        maj = positif(majoration_hm_pourcent, "majoration_hm_pourcent")
        if maj < 10:
            raise ErreurSaisie("Majoration des heures majorees inferieure a 10 % (CCN art. 110.1).", ["R-HC-03"])
        sem_min = SEUIL_CONVENTIONNEL_MINUTES + (h - SEUIL_CONVENTIONNEL_MINUTES) * (1 + maj / 100)
        return ta, minutes_mensualisees, sem_min * semaines_accueil / 12 / 60 * t
    # R-MENS-03 : heures x 52 / 12 ; R-MENS-04 : heures x semaines programmees / 12.
    salaire_exact = minutes_mensualisees / 60 * t
    return ta, minutes_mensualisees, salaire_exact


@api("R-MENS-01", "R-MENS-02", "R-MENS-03", "R-MENS-04", "R-SAL-06")
def mensualisation(semaines_accueil, heures_hebdo_minutes, taux_horaire_centimes,
                   nature_taux="brut", horaires_variables=False, date_paie=None, majoration_hm_pourcent=None):
    """Salaire mensualise brut (R-MENS-03 annee complete, R-MENS-04 annee incomplete).
    Entrees : semaines_accueil (52, ou 1 a 46), heures_hebdo_minutes (entier ou
    chaine exacte), taux_horaire_centimes (brut), nature_taux (« brut » seulement),
    horaires_variables (bool), date_paie (optionnelle).
    Sortie : type_annee, heures_mensualisees (fraction exacte en heures, jamais
    arrondie : A-03), salaire_mensualise_centimes."""
    ta, minutes, salaire = _mensualisation(semaines_accueil, heures_hebdo_minutes, taux_horaire_centimes,
                                           nature_taux, horaires_variables, date_paie, majoration_hm_pourcent)
    res = {
        "type_annee": ta,
        "heures_mensualisees": texte_fraction(minutes / 60),
        "salaire_mensualise_centimes": vers_centimes(salaire, "salaire mensualise", ["R-MENS-03"]),
    }
    return resultat_ok(mensualisation.regles, res)


@api("R-MENS-01", "R-MENS-02", "R-MENS-03", "R-MENS-04")
def heures_mensualisees(semaines_accueil, heures_hebdo_minutes, horaires_variables=False):
    """Heures mensualisees exactes (R-MENS-03, R-MENS-04). L'arrondi pour la
    declaration Pajemploi n'est pas ecrit (A-03) : le moteur ne l'applique pas."""
    if horaires_variables:
        raise NonGere("A-04", ["R-MENS-03"])
    if not isinstance(semaines_accueil, int) or isinstance(semaines_accueil, bool):
        raise NonGere("A-05", ["R-MENS-04"])
    ta = _type_annee(semaines_accueil)
    h = positif(heures_hebdo_minutes, "heures_hebdo_minutes")
    if h > SEUIL_CONVENTIONNEL_MINUTES:
        raise NonGere("A-13", ["R-HC-03"])
    m = h * semaines_accueil / 12
    return resultat_ok(heures_mensualisees.regles,
                       {"type_annee": ta, "heures_mensualisees": texte_fraction(m / 60),
                        "minutes_mensualisees": texte_fraction(m)})


@api("R-MENS-01")
def verifier_date_effet_avenant(date_effet):
    """T-072 : un avenant qui change le salaire mensualise (type d'annee, semaines,
    heures, taux) s'applique a un mois entier. CCN 109.1 : « Le salaire mensualise
    est verse chaque mois » ; la formule (R-MENS-01) donne un montant par mois et
    aucun texte lu ne partage un mois entre deux contrats. Effet le 1er du mois :
    ok. Sinon refus AVENANT-EN-COURS-DE-MOIS."""
    from datetime import date
    if not isinstance(date_effet, date):
        raise ErreurSaisie("date_effet : date attendue.")
    if date_effet.day != 1:
        raise NonGere("AVENANT-EN-COURS-DE-MOIS", ["R-MENS-01"], precision=f"Effet le {date_effet.isoformat()}.")
    return resultat_ok(verifier_date_effet_avenant.regles, {"mois_entier": True})
