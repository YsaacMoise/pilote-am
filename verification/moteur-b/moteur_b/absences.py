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
}
_NOTE_ENFANT_SANS_SOLDE = (
    "Absence de l'enfant sur une periode d'accueil prevue au contrat : salaire maintenu "
    "(CCN art. 105 al. 1, CASF L423-20). Aucun texte ne prevoit d'absence de l'enfant "
    "non payee, meme avec accord des parents, hors maladie justifiee par certificat "
    "medical ou bulletin d'hospitalisation (utiliser absence_enfant_malade). "
    "Absence du seul fait de l'AM : saisir une absence de l'AM.")
_REFUS = {
    "am_evenement_familial": ("R-ABS-06", ["R-ABS-06"]),
    "am_evenement_familial_indemnise_secu": ("M-05", ["R-ABS-06"]),
    "maternite": ("EXCLU-MATERNITE", []),
    "paternite": ("EXCLU-MATERNITE", []),
    "adoption": ("EXCLU-MATERNITE", []),
    "conge_naissance": ("EXCLU-MATERNITE", []),
    "accident_travail": ("EXCLU-AT", []),
    "maladie_professionnelle": ("EXCLU-AT", []),
    "accident_trajet": ("EXCLU-AT", []),
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
        raise NonGere("A77-MAINTIEN-LOCAL", ["T077-R4"], details={
            "lectures": {"A": "salaire maintenu, moins les indemnites journalieres de la securite sociale (montant "
                              "connu de l'AM seule)",
                         "B": "retenue (deductible), comme hors Alsace-Moselle"},
            "message": MESSAGE_MAINTIEN})
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
    feries = jours_feries(date_ferie.year)
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
