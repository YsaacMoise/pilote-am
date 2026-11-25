"""Absences, deductions et jours feries chomes (domaines 4 et 6 de regles-v0)."""

from datetime import date, timedelta
from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, positif, entier,
    vers_centimes, texte_fraction, type_annee_valide, verifier_date_ccn,
)
from .calendrier import jours_du_mois, jours_feries
from .regions import region_valide, feries_locaux_entre, MESSAGE_FERIE_LOCAL, MESSAGE_MAINTIEN


# Qualification de l'absence : (deductible, regles) ou refus.
_TYPES = {
    "enfant_non_prevue": (False, ["R-ABS-01"]),
    # T-039 : absence de l'enfant dite « sans solde » (meme avec accord ecrit des
    # parents). CCN art. 105 al. 1 : « les temps d'absence non prevus sont
    # remuneres » ; seule exception : maladie justifiee (al. 2 et 3, limites de
    # 5 jours et de 14 jours calendaires consecutifs). CASF L423-20 : maintien de
    # la remuneration sauf absence du seul fait de l'AM ou maladie de l'enfant
    # attestee. Service-public F12812 (verifie le 17/06/2026) : jours d'accueil
    # prevus non effectues du fait de l'enfant « sont remuneres ».
    "enfant_sans_solde": (False, ["R-ABS-01"]),
    "am_maladie": (True, ["R-ABS-05", "M-04"]),
    "am_enfant_malade": (True, ["R-ABS-06"]),
    "am_convenance_personnelle": (True, ["R-ABS-06"]),
    "am_presence_parentale": (True, ["R-ABS-06"]),
    "am_solidarite_familiale": (True, ["M-07"]),
    "am_proche_aidant": (True, ["M-07"]),
    "am_formation_obligatoire": (False, ["M-08"]),
    # T-103 (C9) : conge de deuil (CCN 48.1.3.1.2) : salaire maintenu sous deduction des indemnites journalieres
    # (CCN 48.1.3.1.3) : pas de deduction d'absence ; le montant des IJ se retire a part (conge_deuil).
    "am_deuil_complementaire": (False, ["R-ABS-06", "T103-C9"]),
    "fin_contrat_en_cours_de_mois": (True, ["R-FIN-12"]),
    # T-035a : fiches DREETS Occitanie du 19/01/2023 (52 s, p. 2 ; 46 s, p. 3) :
    # « Embauche et fin de contrat en cours de mois » parmi les absences non
    # remunerees a deduire selon l'art. 111 de la CCN.
    "embauche_en_cours_de_mois": (True, ["R-EMB-01"]),
    # verif-1 (T-104, cas 1) : absences protegees. Aucune maintien de salaire par le particulier employeur dans la CCN
    # (hors Alsace-Moselle, C. trav. L1226-23) : retenue de l'art. 111 (« absences qui ne donnent pas lieu a maintien
    # de la remuneration »). Le jour de l'accident du travail reste paye (CSS L433-1 : « integralement a la charge de
    # l'employeur ») : jour_accident_paye().
    "maternite": (True, ["CCN-111", "L1225-17"]),
    "paternite": (True, ["CCN-111", "L1225-35"]),
    "adoption": (True, ["CCN-111", "L1225-37"]),
    "conge_naissance": (True, ["CCN-111", "L1225-46-2"]),
    "accident_travail": (True, ["CCN-111", "CSS-L433-1"]),
    "maladie_professionnelle": (True, ["CCN-111"]),
    "accident_trajet": (True, ["CCN-111"]),
}


def assimilation_cp(type_absence, jours_depuis_debut_arret=0):
    """verif-1 (T-104) : l'absence compte-t-elle comme travail effectif pour les conges payes ?
    - maternite, paternite, adoption : C. trav. L3141-5, 2° (CASF L423-2, 11° : section 2 du chapitre Ier du titre IV
      du livre Ier de la 3e partie applicable a l'AM) : oui.
    - accident du travail, maladie professionnelle : L3141-5, 5° (loi n° 2024-364 : plus de limite d'un an) : oui.
      CCN 49 (limite d'un an) est moins favorable : la loi l'emporte.
    - accident de trajet : CCN 49 (assimile « dans la limite d'une duree ininterrompue d'un an ») ; au-dela, arret non
      professionnel : L3141-5, 7° et L3141-5-1 (2 jours par mois, 24 au plus) : 'maladie'.
    - conge supplementaire de naissance : L1225-46-3 l'assimile pour l'anciennete seulement : non (prorata).
    Sortie : 'travail', 'maladie' ou 'non'."""
    if type_absence in ("maternite", "paternite", "adoption", "accident_travail", "maladie_professionnelle"):
        return "travail"
    if type_absence == "accident_trajet":
        return "travail" if entier(jours_depuis_debut_arret, "jours_depuis_debut_arret") < 365 else "maladie"
    if type_absence == "conge_naissance":
        return "non"
    raise ErreurSaisie("type_absence : maternite, paternite, adoption, conge_naissance, accident_travail, "
                       "maladie_professionnelle ou accident_trajet.")
_NOTE_ENFANT_SANS_SOLDE = (
    "Absence de l'enfant sur une periode d'accueil prevue au contrat : salaire maintenu "
    "(CCN art. 105 al. 1, CASF L423-20). Aucun texte ne prevoit d'absence de l'enfant "
    "non payee, meme avec accord des parents, hors maladie justifiee par certificat "
    "medical ou bulletin d'hospitalisation (utiliser absence_enfant_malade). "
    "Absence du seul fait de l'AM : saisir une absence de l'AM.")
_REFUS = {
    "am_evenement_familial": ("R-ABS-06", ["R-ABS-06"]),
    "am_evenement_familial_indemnise_secu": ("M-05", ["R-ABS-06"]),
    # T-074 (signal de la direction, S74-I46-15J-SANS-ACCUEIL) : jour du planning hors du contrat (apres la fin
    # ou avant l'embauche) qui tombe dans une semaine sans accueil, mois d'entree ou de sortie en annee
    # incomplete. CCN 111, dernier alinea : les semaines de non-accueil comptent au denominateur (« heures et
    # jours qui auraient ete travailles »). Aucun texte lu ne dit si ces jours comptent au numerateur (« jours
    # non travailles dans le mois, donnant lieu a deduction ») : lus deduits ou non, le salaire du mois change.
    "hors_contrat_semaine_non_accueil": ("SORTIE-SEMAINE-SANS-ACCUEIL", ["R-FIN-12", "R-EMB-01", "R-ABS-08"]),
}


@api("R-ABS-01", "R-ABS-05", "R-ABS-06", "R-ABS-09", "R-MENS-08", "R-CP-05")
def qualifier_absence(type_absence, type_annee, region="metropole"):
    """Dit si une absence donne lieu a deduction (R-ABS-09 : methode de l'art. 111).
    Types acceptes : enfant_non_prevue, enfant_sans_solde (T-039, remuneree),
    am_maladie, am_enfant_malade,
    am_convenance_personnelle, am_presence_parentale, am_solidarite_familiale,
    am_proche_aidant, am_formation_obligatoire, fin_contrat_en_cours_de_mois,
    embauche_en_cours_de_mois (jours du mois avant l'embauche, R-EMB-01),
    non_accueil_programme, conge_complementaire_non_remunere, adaptation.
    Absence de l'enfant malade : utiliser absence_enfant_malade().
    Jour ferie : utiliser ferie_chome().
    T-077 (R4) : en Alsace-Moselle, am_maladie et am_enfant_malade : maintien du
    droit local (C. trav. L1226-23) ou retenue (CCN annexe 3 art. 3.1, CASF L423-2) :
    refus A77-MAINTIEN-LOCAL, les deux lectures dans details.
    Sortie : deductible (bool)."""
    type_annee_valide(type_annee)
    region = region_valide(region)
    if region == "alsace_moselle" and type_absence in ("am_maladie", "am_enfant_malade"):
        # T-103 (R3, decision du DG du 24/11/2026, A3) : maintien du salaire pour toute absence pour maladie de l'AM
        # ou de son enfant, moins les indemnites journalieres saisies (C. trav. L1226-23 : « a droit au maintien de
        # son salaire » ; « les indemnites versees par un regime d'assurances sociales obligatoire sont deduites » ;
        # Cass. soc. 13/04/2005, 04/12/2024, 27/05/2025). Pas de deduction d'absence ; IJ : maintien_droit_local.
        return resultat_ok(["T103-R3"], {"deductible": False,
                                         "note": "Alsace-Moselle : salaire maintenu moins les indemnites journalieres "
                                                 "(maintien_droit_local)."})
    if type_absence in _REFUS:
        code, regles = _REFUS[type_absence]
        raise NonGere(code, regles)
    if type_absence in _TYPES:
        d, regles = _TYPES[type_absence]
        res = {"deductible": d}
        if type_absence == "enfant_sans_solde":
            res["note"] = _NOTE_ENFANT_SANS_SOLDE
        return resultat_ok(regles, res)
    if type_absence == "non_accueil_programme":
        # R-MENS-04 : deja exclue du mensualise en annee incomplete.
        if type_annee != "incomplete":
            raise ErreurSaisie("Semaine de non-accueil programmee impossible en annee complete.", ["R-MENS-02"])
        return resultat_ok(["R-MENS-04"], {"deductible": False})
    if type_absence == "conge_complementaire_non_remunere":
        # R-CP-05 : en annee incomplete, ces conges font partie des semaines non
        # travaillees du mensualise ; en annee complete, mode de deduction non ecrit.
        if type_annee == "complete":
            raise NonGere("A-25", ["R-CP-05"])
        return resultat_ok(["R-CP-05"], {"deductible": False,
                                         "note": "Deja exclu du salaire mensualise (semaines non travaillees)."})
    if type_absence == "adaptation":
        # R-MENS-08 : deduction des heures non faites ; en annee incomplete A-08.
        if type_annee == "incomplete":
            raise NonGere("A-08", ["R-MENS-08", "R-ESS-01"])
        return resultat_ok(["R-MENS-08", "R-ESS-01"], {"deductible": True})
    if type_absence in ("enfant_maladie_justifiee", "ferie_chome"):
        raise ErreurSaisie("Utiliser absence_enfant_malade() ou ferie_chome().")
    raise ErreurSaisie(f"Type d'absence inconnu : {type_absence}.")


@api("R-ABS-01", "R-ABS-02", "R-ABS-03", "R-ABS-04")
def absence_enfant_malade(jours_absence, jours_calendaires_consecutifs, jours_accueil_concernes,
                          justificatif=True, demi_journee=False,
                          cumul_anterieur_12_mois_glissants=0, cumul_anterieur_depuis_anniversaire=0,
                          longue_absence_anterieure=False):
    """Absence de l'enfant pour maladie (R-ABS-02, R-ABS-03, R-ABS-04).
    Sans justificatif : absence remuneree (R-ABS-01).
    Le moteur ne conclut que si : jours entiers, jours calendaires = jours
    d'accueil (sinon A-15), memes cumuls selon les deux lectures de la periode
    (sinon A-16), aucune longue absence anterieure (sinon A-17/A-18), absence de
    5 jours au plus (sinon A-17).
    Sortie : jours_deductibles, jours_remuneres."""
    j = entier(jours_absence, "jours_absence", 1)
    jc = entier(jours_calendaires_consecutifs, "jours_calendaires_consecutifs", 1)
    ja = entier(jours_accueil_concernes, "jours_accueil_concernes", 1)
    if not justificatif:
        return resultat_ok(["R-ABS-01"], {"jours_deductibles": 0, "jours_remuneres": j})
    if demi_journee or jc != ja or j != ja:
        raise NonGere("A-15", ["R-ABS-02"])
    c1 = entier(cumul_anterieur_12_mois_glissants, "cumul_anterieur_12_mois_glissants")
    c2 = entier(cumul_anterieur_depuis_anniversaire, "cumul_anterieur_depuis_anniversaire")
    if c1 != c2:
        raise NonGere("A-16", ["R-ABS-04"])
    if longue_absence_anterieure:
        raise NonGere("A-17", ["R-ABS-03"], precision="Une longue absence existe deja sur la periode (voir aussi A-18).")
    if j > 5:
        raise NonGere("A-17", ["R-ABS-03"], precision="Absence de plus de 5 jours.")
    deductibles = max(0, min(j, 5 - c1))
    return resultat_ok(absence_enfant_malade.regles, {"jours_deductibles": deductibles,
                                                      "jours_remuneres": j - deductibles})


@api("T103-R3")
def maintien_droit_local(indemnites_journalieres_centimes=None):
    """T-103 (R3, decision du DG, A3) : Alsace-Moselle, maladie de l'AM ou de son enfant : salaire maintenu
    (qualifier_absence : non deductible) moins les indemnites journalieres de l'absence (C. trav. L1226-23, al. 2).
    indemnites_journalieres_centimes : montant saisi ; absent : refus R3-IJ-MANQUANTES.
    Sortie : deduction_ij_centimes."""
    if indemnites_journalieres_centimes is None:
        raise NonGere("R3-IJ-MANQUANTES", ["T103-R3"], precision=(
            "Alsace-Moselle : montant des indemnites journalieres de l'absence a saisir (L1226-23)."))
    return resultat_ok(maintien_droit_local.regles, {
        "deduction_ij_centimes": entier(indemnites_journalieres_centimes, "indemnites_journalieres_centimes")})


@api("R-CP-09", "T103-C15", "T103-C17")
def absence_retenue_du_jour(types_saisis):
    """T-103 (C15, C17) : plusieurs absences de l'AM saisies sur un meme jour.
    - Conge paye et arret maladie (« am_maladie ») : l'arret l'emporte. CCN 48.1.1.3 : « les jours de conges payes
      qui coincident avec la periode de l'arret de travail ne sont pas decomptes [...] l'absence du salarie est
      traitee comme une absence pour maladie » (C15, A1).
    - Toute autre double saisie : refus C17-SAISIE-CONTRADICTOIRE (C17, B : l'utilisatrice choisit).
    types_saisis : liste des types (cp, am_malade, am_enfant_malade, sans_solde, evenement...).
    Sortie : type (le type retenu)."""
    t = sorted(set(types_saisis or ()))
    if not t:
        raise ErreurSaisie("types_saisis : au moins un type.")
    if len(t) == 1:
        return resultat_ok(["R-CP-09"], {"type": t[0]})
    if t == ["am_malade", "cp"]:
        return resultat_ok(absence_retenue_du_jour.regles, {"type": "am_malade",
                                                            "note": "Arret maladie pendant le conge (CCN 48.1.1.3)."})
    raise NonGere("C17-SAISIE-CONTRADICTOIRE", ["R-CP-09"], precision="Absences saisies le meme jour : " + ", ".join(t))


def _anniversaire(debut, k):
    """Debut de la k-ieme periode de 12 mois a compter de la date d'effet de l'embauche (CCN 105). Un 29 fevrier
    sans 29 fevrier l'annee k : refus DATE-MOIS (cas non ecrit)."""
    try:
        return debut.replace(year=debut.year + k)
    except ValueError:
        raise NonGere("DATE-MOIS", ["R-ABS-04"], precision="Embauche un 29 fevrier : date anniversaire non ecrite.")


def _periode_105(debut, d):
    """Index et bornes de la periode de 12 mois qui contient d (C4 : chaque jour compte dans sa periode)."""
    k = max(0, d.year - debut.year - 1)
    while _anniversaire(debut, k + 1) <= d:
        k += 1
    return k


@api("R-ABS-01", "R-ABS-02", "R-ABS-03", "R-ABS-04", "T103-C1", "T103-C5")
def absences_enfant_malade_art105(date_debut_contrat, certificats, jours_absence, deja_retenus=None,
                                  date_debut_suivi=None):
    """T-103 (C1 a C5) : absences de l'enfant justifiees (CCN 105, KALIARTI000043942278).
    Texte : l'AM « n'est pas remunere au titre de la periode d'absence dans les limites suivantes : – en cas de
    courtes absences de l'enfant, pas necessairement consecutives, dans la limite de 5 jours d'absence. Au-dela
    [...] le particulier employeur doit proceder au paiement du salaire ; – en cas d'absence durant 14 jours
    calendaires consecutifs. Au-dela [...] doit reprendre le paiement du salaire [...]. Ces limites sont appreciees
    par periode de 12 mois glissants a compter de la date d'effet de l'embauche ou de sa date anniversaire. »
    - C3 (B) : chaque absence porte les dates du certificat (du, au), obligatoires : sans elles, refus
      C3-DATES-CERTIFICAT. La duree de l'absence est celle du certificat.
    - C1, C2 (A2, lettre du texte) : certificat de 14 jours calendaires ou plus : absence longue (non payee sur
      ses 14 premiers jours calendaires, payee au-dela), quel que soit le nombre de jours d'accueil ; moins de
      14 jours : courtes absences, 5 jours d'absence par periode, payes au-dela.
    - Jour d'absence : jour d'accueil prevu ou l'enfant est absent (jours_absence) ; un jour sans accueil prevu
      n'est pas une absence de l'enfant. Demi-journee : refus A-15 (hors tableau).
    - C4 (A2) : chaque jour compte dans la periode de 12 mois qui le contient (date anniversaire).
    - Deux absences longues dans la meme periode : refus A-18 (hors tableau, non tranche).
    - C5 (B) : deja_retenus = {"jours": n, "longue": bool} pour la periode qui contient date_debut_suivi (jours
      deja retenus avant le suivi). n > 0 sans « longue » : refus C5-ORIGINE-MANQUANTE. longue False : n jours
      deja pris sur la limite de 5 ; longue True : l'absence longue de la periode est deja faite.
    certificats : liste de {"du": date, "au": date, "demi_journee": False}. jours_absence : dates.
    Sortie : jours = {date iso : "retenu" | "paye"}, absences (classe et jours par certificat), jours_retenus."""
    if not isinstance(date_debut_contrat, date):
        raise ErreurSaisie("date_debut_contrat : date attendue.")
    certs = []
    for i, c in enumerate(certificats or []):
        du, au = c.get("du"), c.get("au")
        if du is None or au is None:
            raise NonGere("C3-DATES-CERTIFICAT", ["R-ABS-02"], precision=(
                f"Certificat {i + 1} : dates « du ... au ... » obligatoires (T-103, C3)."))
        if not (isinstance(du, date) and isinstance(au, date)) or au < du:
            raise ErreurSaisie(f"certificats[{i}] : dates du et au, dans l'ordre.")
        if c.get("demi_journee"):
            raise NonGere("A-15", ["R-ABS-02"], precision="Demi-journee d'absence : non tranche (hors tableau T-103).")
        certs.append((du, au))
    certs.sort()
    for (a1, b1), (a2, b2) in zip(certs, certs[1:]):
        if a2 <= b1:
            raise ErreurSaisie("Certificats qui se chevauchent.")
    jours = sorted(set(jours_absence or ()))
    for d in jours:
        if not isinstance(d, date):
            raise ErreurSaisie("jours_absence : dates attendues.")
        if not any(a <= d <= b for a, b in certs):
            raise NonGere("C3-DATES-CERTIFICAT", ["R-ABS-02"], precision=(
                f"Jour d'absence du {d.isoformat()} hors de tout certificat : dates du certificat a saisir."))
    courtes = {}
    longues = set()
    if deja_retenus:
        n = entier(deja_retenus.get("jours", 0), "deja_retenus.jours")
        lg = deja_retenus.get("longue")
        if n and lg is None:
            raise NonGere("C5-ORIGINE-MANQUANTE", ["R-ABS-04"], precision=(
                "Jours deja retenus avant le suivi : absences courtes ou absence de 14 jours ? (T-103, C5)"))
        if not isinstance(date_debut_suivi, date):
            raise ErreurSaisie("date_debut_suivi : date attendue avec deja_retenus.")
        p = _periode_105(date_debut_contrat, date_debut_suivi)
        if lg:
            longues.add(p)
        else:
            courtes[p] = n
    statut = {}
    detail = []
    for du, au in certs:
        dans = [d for d in jours if du <= d <= au]
        duree = (au - du).days + 1
        if duree >= 14:
            limite = du + timedelta(days=13)
            periodes = {_periode_105(date_debut_contrat, d) for d in dans if d <= limite} or \
                {_periode_105(date_debut_contrat, du)}
            if periodes & longues:
                raise NonGere("A-18", ["R-ABS-03"], precision=(
                    f"Deuxieme absence de 14 jours dans la meme periode de 12 mois (certificat du {du.isoformat()})."))
            longues |= periodes
            for d in dans:
                statut[d] = "retenu" if d <= limite else "paye"
            classe = "longue"
        else:
            for d in dans:
                p = _periode_105(date_debut_contrat, d)
                if courtes.get(p, 0) < 5:
                    courtes[p] = courtes.get(p, 0) + 1
                    statut[d] = "retenu"
                else:
                    statut[d] = "paye"
            classe = "courte"
        detail.append({"du": du.isoformat(), "au": au.isoformat(), "jours_calendaires": duree, "classe": classe,
                       "jours_retenus": sum(1 for d in dans if statut[d] == "retenu"),
                       "jours_payes": sum(1 for d in dans if statut[d] == "paye")})
    return resultat_ok(absences_enfant_malade_art105.regles, {
        "jours": {d.isoformat(): s for d, s in sorted(statut.items())}, "absences": detail,
        "jours_retenus": sum(1 for s in statut.values() if s == "retenu")})


def _deduction(type_annee, salaire_mensualise_centimes, non_travaille, prevu_sans_absence,
               semaines_non_accueil_dans_mois):
    type_annee_valide(type_annee)
    regles = ["R-ABS-07"] if type_annee == "complete" else ["R-ABS-08"]
    s = entier(salaire_mensualise_centimes, "salaire_mensualise_centimes")
    nt = positif(non_travaille, "non_travaille")
    pv = positif(prevu_sans_absence, "prevu_sans_absence")
    sna = entier(semaines_non_accueil_dans_mois, "semaines_non_accueil_dans_mois")
    if pv == 0:
        raise ErreurSaisie("prevu_sans_absence nul.", regles)
    if nt > pv:
        raise ErreurSaisie("Plus d'heures ou de jours absents que prevus.", regles)
    if type_annee == "complete" and sna:
        raise ErreurSaisie("Semaines de non-accueil impossibles en annee complete.", regles)
    if type_annee == "incomplete":
        if nt.denominator != 1 or pv.denominator != 1:
            raise NonGere("A-21", regles)
        # T-040 (MB5) : A-19 leve. CCN art. 111, dernier alinea : « Les periodes
        # d'absence, les semaines de non-accueil ainsi que les jours feries chomes
        # correspondant a un jour habituellement travaille, sont comptabilises dans
        # les heures et les jours qui auraient ete travailles ». La semaine de
        # non-accueil est deja comptee dans prevu_sans_absence (voir prevu_du_mois).
    # T-040 (MB5) : A-20 leve. Absence sur tout le mois : la formule de l'art. 111
    # (salaire mensualise x non travaille / prevu) donne une deduction egale au
    # salaire mensualise, donc un salaire du nul. La declaration du mois reste hors
    # du calcul (CSS L133-5-8, al. 2 : declaration des mois « au cours [desquels] une
    # activite a ete effectuee », relu par T-021b ; note dans le resultat).
    return regles, Fraction(s) * nt / pv, s


_NOTE_MOIS_ENTIER = (
    "Absence non remuneree sur tout le mois : salaire du nul (CCN art. 111). "
    "Declaration Pajemploi du mois sans activite : CSS L133-5-8, al. 2, ne vise que "
    "les mois au cours desquels une activite a ete effectuee ; point non tranche par le moteur.")


@api("R-ABS-07", "R-ABS-08", "R-ABS-09", "R-JF-05")
def deduction_absence(type_annee, salaire_mensualise_centimes, non_travaille, prevu_sans_absence,
                      semaines_non_accueil_dans_mois=0, date_paie=None):
    """Deduction d'absence de l'article 111 de la CCN.
    Annee complete (R-ABS-07) : unites en minutes. Annee incomplete (R-ABS-08) :
    unites en jours entiers.
    deduction = salaire mensualise x non travaille / prevu sans l'absence.
    prevu_sans_absence inclut les absences et les feries chomes d'un jour
    habituellement travaille (art. 111, dernier alinea ; R-JF-05).
    Semaines de non-accueil du mois : comptees au denominateur (art. 111, T-040).
    Absence sur tout le mois : salaire du nul, avec note (T-040).
    Refus : A-21 (fraction de jour en annee incomplete), ARR-01.
    Sortie : deduction_centimes, salaire_du_centimes, coefficient (fraction exacte)."""
    verifier_date_ccn(date_paie, ["R-ABS-09"])
    regles, ded, s = _deduction(type_annee, salaire_mensualise_centimes, non_travaille,
                                prevu_sans_absence, semaines_non_accueil_dans_mois)
    d = vers_centimes(ded, "deduction d'absence", regles)
    res = {"deduction_centimes": d, "salaire_du_centimes": s - d,
           "coefficient": texte_fraction(Fraction(non_travaille) / Fraction(prevu_sans_absence))}
    if d == s:
        res["note"] = _NOTE_MOIS_ENTIER
    return resultat_ok(deduction_absence.regles, res)


@api("R-ABS-07", "R-ABS-08", "R-JF-05")
def prevu_du_mois(annee, mois, planning_minutes_par_jour, type_annee, contient_semaine_non_accueil=False):
    """Denominateur de la deduction pour un mois civil (art. 111, dernier alinea) :
    tous les jours du mois selon le planning hebdomadaire, absences, CP et feries
    chomes d'un jour habituellement travaille compris.
    planning_minutes_par_jour : {0: lundi, ..., 6: dimanche} -> minutes (entiers).
    Annee complete : total en minutes. Annee incomplete : nombre de jours.
    T-040 (MB5) : A-19 leve. Les semaines de non-accueil du mois sont comptees
    selon le planning (art. 111 : « les semaines de non-accueil [...] sont
    comptabilises » ; « les parties se referent aux dispositions prevues dans le
    contrat de travail ou au planning remis au salarie »). Le parametre
    contient_semaine_non_accueil est garde pour la compatibilite ; il ne change
    plus le resultat."""
    type_annee_valide(type_annee)
    plan = {int(k): entier(v, "planning") for k, v in planning_minutes_par_jour.items()}
    total_min = 0
    total_jours = 0
    for d in jours_du_mois(annee, mois):
        m = plan.get(d.weekday(), 0)
        total_min += m
        total_jours += 1 if m > 0 else 0
    if type_annee == "complete":
        return resultat_ok(["R-ABS-07", "R-JF-05"], {"prevu_minutes": total_min,
                                                     "prevu_heures": texte_fraction(Fraction(total_min, 60))})
    return resultat_ok(["R-ABS-08", "R-JF-05"], {"prevu_jours": total_jours})


_PRESENCES = ("travaille", "absence_autorisee", "absence_enfant", "absence_employeur", "absence_am")


def _jour_de_travail(depart, pas, jours_travailles, jours_non_accueil):
    d = depart + timedelta(days=pas)
    for _ in range(400):
        if d.weekday() in jours_travailles and d not in jours_non_accueil:
            return d
        d += timedelta(days=pas)
    raise ErreurSaisie("Aucun jour de travail trouve autour du ferie.")


@api("R-JF-01", "R-JF-02", "R-JF-04", "R-JF-05")
def ferie_chome(date_ferie, jours_travailles, presence_veille="travaille", presence_lendemain="travaille",
                jours_non_accueil=(), region="metropole"):
    """Jour ferie chome (R-JF-02 ; 1er mai : R-JF-04).
    jours_travailles : jours de la semaine travailles (0 = lundi).
    presence_veille / presence_lendemain : « travaille », « absence_autorisee »,
    « absence_enfant », « absence_employeur », « absence_am ».
    Sortie : jour_habituellement_travaille, jours_condition (dernier jour de
    travail avant et premier apres), remuneration_maintenue.
    Lundi de Pentecote : ferie ordinaire (T-040, A-31 leve ; CCN art. 47.2 et 101,
    C. trav. L3133-1, 6°). Aucune journee de solidarite : ni la CCN ni le CASF
    L423-2 ne la prevoient pour l'AM.
    Refus : A-32 (absence du fait de l'enfant ou de l'employeur),
    R-JF-02-LIMITE (ferie dans une semaine de non-accueil).
    T-077 (R3) : region. Ferie local (26/12, Vendredi saint ; 27/04 a Mayotte) un
    jour habituellement travaille : refus A77-FERIE-LOCAL (lecture A : ferie de
    l'art. 47.2 ; lecture B : jour ordinaire). Ferie national dont le jour de
    travail voisin est un ferie local : refus A77-FERIE-VOISIN (lecture A : voisin
    ferie, A-32 ; lecture B : condition sur ce jour ordinaire)."""
    if not isinstance(date_ferie, date):
        raise ErreurSaisie("date_ferie : date attendue.")
    verifier_date_ccn(date_ferie, ["R-JF-02"])
    region = region_valide(region)
    feries = jours_feries(date_ferie.year, region)  # T-103 (R4) : 27 avril a Mayotte
    locaux = feries_locaux_entre(date_ferie, date_ferie, region)
    jt = set(int(j) for j in jours_travailles)
    jna = set(jours_non_accueil)
    if date_ferie in locaux and date_ferie not in feries:
        if date_ferie.weekday() not in jt:
            return resultat_ok(ferie_chome.regles + ["T077-R3"], {
                "jour_habituellement_travaille": False, "remuneration_maintenue": None,
                "note": "Ferie local hors jour habituellement travaille : sans effet sur le salaire (deux lectures)."})
        if date_ferie in jna:
            lect_a = "R-JF-02-LIMITE (ferie dans une semaine de non-accueil)"
        else:
            av = _jour_de_travail(date_ferie, -1, jt, jna)
            ap = _jour_de_travail(date_ferie, 1, jt, jna)
            if av in feries or ap in feries or av in locaux or ap in locaux:
                lect_a = "A-32 (le jour de travail voisin est lui-meme ferie)"
            else:
                lect_a = (f"maintenu si l'AM a travaille le {av.isoformat()} et le {ap.isoformat()} "
                          "(ou absence autorisee), sinon retenu")
        raise NonGere("A77-FERIE-LOCAL", ["R-JF-02", "T077-R3"], details={
            "lectures": {"A": lect_a, "B": "jour ordinaire non travaille : paye si les parents n'ont pas confie "
                                            "l'enfant (CCN 105 al. 1), retenu si l'AM a ferme"},
            "ferie_local": locaux[date_ferie], "message": MESSAGE_FERIE_LOCAL})
    if date_ferie not in feries:
        raise ErreurSaisie("Cette date n'est pas un jour ferie ordinaire (R-JF-01).")
    if date_ferie in jna:
        raise NonGere("R-JF-02-LIMITE", ["R-JF-02"])
    if date_ferie.weekday() not in jt:
        return resultat_ok(ferie_chome.regles, {"jour_habituellement_travaille": False,
                                                "remuneration_maintenue": None,
                                                "note": "Ferie hors jour habituellement travaille : sans effet sur le salaire."})
    if date_ferie.month == 5 and date_ferie.day == 1:
        # R-JF-04 : pas de condition de presence.
        return resultat_ok(["R-JF-04"], {"jour_habituellement_travaille": True, "jours_condition": [],
                                         "remuneration_maintenue": True})
    avant = _jour_de_travail(date_ferie, -1, jt, jna)
    apres = _jour_de_travail(date_ferie, 1, jt, jna)
    for p in (presence_veille, presence_lendemain):
        if p not in _PRESENCES + ("inconnu",):
            raise ErreurSaisie(f"Presence inconnue : {p}.")
    if (avant in feries or apres in feries):
        raise NonGere("A-32", ["R-JF-02"], precision="Le jour de travail voisin est lui-meme ferie.")
    if avant in locaux or apres in locaux:
        # T-077 (R3.3) : lecture A, le voisin est un ferie (regle existante : A-32) ; lecture B, jour ordinaire.
        statuts_b = (presence_veille, presence_lendemain)
        if "inconnu" in statuts_b:
            lect_b = ("selon qui a decide du ferie local non travaille : A-32 si les parents n'ont pas confie "
                      "l'enfant, non maintenu si l'AM a ferme")
        elif any(p in ("absence_enfant", "absence_employeur") for p in statuts_b):
            lect_b = "A-32 (absence du fait de l'enfant ou de l'employeur)"
        else:
            lect_b = ("maintenu" if all(p in ("travaille", "absence_autorisee") for p in statuts_b) else "non maintenu")
        raise NonGere("A77-FERIE-VOISIN", ["R-JF-02", "T077-R3"], details={
            "lectures": {"A": "A-32 (le jour de travail voisin est un ferie local)", "B": lect_b},
            "jours_condition": [avant.isoformat(), apres.isoformat()]})
    if "inconnu" in (presence_veille, presence_lendemain):
        raise ErreurSaisie("Presence « inconnu » admise seulement pour un ferie local voisin (T-077).")
    statuts = (presence_veille, presence_lendemain)
    if any(p in ("absence_enfant", "absence_employeur") for p in statuts):
        raise NonGere("A-32", ["R-JF-02"])
    maintenu = all(p in ("travaille", "absence_autorisee") for p in statuts)
    return resultat_ok(ferie_chome.regles, {"jour_habituellement_travaille": True,
                                            "jours_condition": [avant.isoformat(), apres.isoformat()],
                                            "remuneration_maintenue": maintenu})


@api("R-JF-03", "R-JF-04")
def ferie_travaille(date_ferie):
    """Ferie travaille (R-JF-03, R-JF-04) : refus A-33 dans tous les cas
    (majoration en plus du mensualise ou paiement complet, non tranche)."""
    raise NonGere("A-33", ["R-JF-03", "R-JF-04"])


@api("R-JF-03", "T077-R3")
def ferie_local_travaille(date_ferie, region, minutes_presence, taux_horaire_centimes):
    """T-077 (R3.2) : ferie local (26/12, Vendredi saint ; 27/04 a Mayotte) travaille.
    Salaire de base du jour paye dans les deux lectures. Majoration de 10 % des heures
    de presence (CCN 47.2) en lecture A, aucune en lecture B : refus
    A77-FERIE-LOCAL-TRAVAILLE, montant de la lecture A dans details
    (minutes x taux x 10 / 100 / 60, centime le plus proche, ARR-01)."""
    from .commun import arrondi_arr01
    region = region_valide(region)
    if not isinstance(date_ferie, date):
        raise ErreurSaisie("date_ferie : date attendue.")
    locaux = feries_locaux_entre(date_ferie, date_ferie, region)
    if date_ferie not in locaux:
        raise ErreurSaisie("Cette date n'est pas un ferie local de la region (T-077, R3).")
    mn = entier(minutes_presence, "minutes_presence")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    exact_ = Fraction(mn) * t * 10 / 100 / 60
    maj = arrondi_arr01(exact_)
    raise NonGere("A77-FERIE-LOCAL-TRAVAILLE", ["R-JF-03", "T077-R3"], details={
        "lectures": {"A": maj, "B": 0},
        "majoration_exacte_centimes": texte_fraction(exact_),
        "ferie_local": locaux[date_ferie],
        "message": "Majoration de 10 % a confirmer, non comprise dans le total (lecture A : ferie de l'art. 47.2 ; "
                   "lecture B : jour ordinaire)."})
