"""Contrat a duree determinee (CDD) de l'AM (T-076, passage 1).

Sources : regles/t076-cdd.md (R-CDD-01 a R-CDD-14, points P1 a P5) ; choix de
calcul : regles/t076-decisions-direction.md, section 2. CASF L423-2, 4° : le
titre IV du livre II de la premiere partie du code du travail (CDD,
L1241-1 a L1248-11) s'applique a l'AM. CCN 41.3, 44.2, 62 : renvoi au droit
commun. C. trav. L1242-14 : les regles du CDI (mensualisation, HC, HM,
absences, CP, indemnites) s'appliquent, sauf la rupture (R-CDD-02).

Point a confirmer : part sure = plus petite lecture ; a confirmer = ecart
(decisions, preambule).
"""

from datetime import date, timedelta
from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, positif, entier, vers_centimes, texte_fraction,
)
from .calendrier import ajouter_mois
from .mensualisation import _mensualisation

# R-CDD-08 : table de decision. Valeur : (IFC due, texte cite).
FINS_CDD = {
    "terme": (True, "C. trav. L1243-8 : IFC due a l'issue du contrat (terme atteint, renouvellement ou report compris)."),
    "suite_cdi": (False, "C. trav. L1243-8 al. 1 et L1243-11 : la relation continue en CDI, IFC non due."),
    "refus_cdi": (False, "C. trav. L1243-10, 3° : refus d'un CDI pour le meme emploi ou un emploi similaire, "
                         "a remuneration au moins equivalente."),
    "initiative_am": (False, "C. trav. L1243-10, 4° : rupture anticipee a l'initiative du salarie."),
    "faute_grave": (False, "C. trav. L1243-10, 4° : rupture anticipee pour faute grave."),
    "essai": (False, "C. trav. L1242-11, 4° : l'IFC ne s'applique pas pendant la periode d'essai."),
    "commun_accord": (True, "C. trav. L1243-10 (liste fermee, n'exclut pas l'accord des parties) ; DREETS Occitanie, "
                            "guide CDD, p. 15."),
    "employeur": (True, "C. trav. L1243-4 : rupture anticipee par l'employeur « sans prejudice de l'indemnite de fin de "
                        "contrat » ; dommages et interets non calcules, a voir avec un conseil (R-CDD-13)."),
}
# R-CDD-08, partie 6 du rapport : non geres.
FINS_NON_GEREES = {
    "force_majeure": "Force majeure (L1243-1, L1243-4 al. 2) : hors perimetre (R-CDD-13).",
    "inaptitude": "Inaptitude constatee par le medecin du travail : hors perimetre (R-CDD-13).",
    "jeune_vacances": "CDD d'un jeune pendant ses vacances (L1243-10, 2°) : hors du cas de l'AM agreee.",
    "saisonnier": "CDD saisonnier ou d'usage (L1243-10, 1°) : hors du cas de l'AM agreee (R-CDD-03).",
}


def _fin(fin_cdd, regles):
    if fin_cdd in FINS_NON_GEREES:
        raise NonGere("CDD-FIN-NON-GEREE", regles + ["R-CDD-08"], precision=FINS_NON_GEREES[fin_cdd])
    if fin_cdd not in FINS_CDD:
        raise ErreurSaisie(f"fin_cdd parmi {sorted(FINS_CDD) + sorted(FINS_NON_GEREES)}.")
    return FINS_CDD[fin_cdd]


def _deux_lectures(l1, l2):
    """Part sure = plus petite lecture ; a confirmer = ecart (decisions, preambule)."""
    sure = min(l1, l2)
    return {"valeur_centimes": sure, "a_confirmer_centimes": max(l1, l2) - sure, "lectures": [l1, l2]}


@api("R-CDD-04", "R-CDD-02", "R-MENS-03")
def mensualisation_cdd(heures_hebdo_minutes, taux_horaire_centimes, date_paie=None):
    """Salaire mensualise du CDD : comme un CDI, 52 semaines sur 12 mois, quelle que
    soit la duree du CDD (R-CDD-04, lecture A retenue). CCN 108.1 (« quels que
    soient le nombre d'heures de travail par semaine et le nombre de semaines
    de travail dans l'annee ») et 109.1 (« nombre d'heures de travail par
    semaine x 52 semaines /12 mois »), appliques au CDD par C. trav. L1242-14.
    Concordants : service-public F12812, DREETS Occitanie (guide CDD, fiche
    mensualisation, FAQ q. 1.23, modele CDD).
    Sortie : heures_mensualisees, salaire_mensualise_centimes."""
    ta, minutes, salaire = _mensualisation(52, heures_hebdo_minutes, taux_horaire_centimes, date_paie=date_paie)
    return resultat_ok(mensualisation_cdd.regles, {
        "type_annee": ta, "heures_mensualisees": texte_fraction(minutes / 60),
        "salaire_mensualise_centimes": vers_centimes(salaire, "salaire mensualise du CDD", ["R-CDD-04"])})


@api("R-CDD-05", "P1")
def cdd_moins_d_un_mois(date_debut, date_terme):
    """P1 : CDD a terme precis de moins d'un mois ? Le terme est le dernier jour du
    contrat ; un mois de date a date (du 1er au 30 septembre) n'est pas « inferieur
    a un mois » (DREETS, guide CDD p. 7 : « duree inferieure a un mois »).
    Depart apres le 28 : refus DATE-MOIS (methode non ecrite). Sortie : moins_d_un_mois."""
    if not (isinstance(date_debut, date) and isinstance(date_terme, date)):
        raise ErreurSaisie("Dates attendues.")
    if date_terme < date_debut:
        raise ErreurSaisie("Le terme precede le debut.")
    limite = ajouter_mois(date_debut, 1) - timedelta(days=1)
    return resultat_ok(["R-CDD-05", "P1"], {"moins_d_un_mois": date_terme < limite,
                                            "dernier_jour_d_un_mois_entier": limite.isoformat()})


@api("R-CDD-05", "P1", "R-ABS-07", "R-FIN-12")
def salaire_mois_cdd_moins_d_un_mois(salaire_mensualise_centimes, deduction_art111_centimes, taux_horaire_centimes,
                                     minutes_reelles_dans_le_contrat):
    """P1, salaire de base du mois d'un CDD de moins d'un mois, deux lectures :
    - lecture 1 (CCN 108.1, 111 ; R-FIN-12) : salaire mensualise - deduction de
      l'art. 111 (heures prevues hors des dates du contrat comprises) ;
    - lecture 2 (DREETS Occitanie, guide CDD p. 7 et fiche CDD p. 3 : « le salaire
      du est determine en multipliant la remuneration horaire par le nombre
      d'heures de travail reellement effectuees ») : taux x heures reelles.
    minutes_reelles_dans_le_contrat : heures reellement effectuees dans la limite
    des heures prevues de chaque semaine ; les heures en plus (HC, HM) sont
    payees a part, avec leur majoration, dans les deux lectures (CCN 110.1,
    110.2 par L1242-14), pour ne pas les compter deux fois.
    Sortie : valeur_centimes (part sure), a_confirmer_centimes, lectures."""
    s = entier(salaire_mensualise_centimes, "salaire_mensualise_centimes")
    d = entier(deduction_art111_centimes, "deduction_art111_centimes")
    if d > s:
        raise ErreurSaisie("Deduction superieure au salaire mensualise.")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    m = positif(minutes_reelles_dans_le_contrat, "minutes_reelles_dans_le_contrat")
    l2 = vers_centimes(m / 60 * t, "salaire au reel (P1, lecture 2)", ["P1"])
    res = _deux_lectures(s - d, l2)
    res["question"] = ("Question DDETS P1 : CDD de moins d'un mois mensualise puis reduit (art. 111) ou paye au reel ?")
    return resultat_ok(salaire_mois_cdd_moins_d_un_mois.regles, res)


@api("R-CDD-05", "P2", "R-ABS-07", "R-MENS-04")
def qualifier_semaine_sans_accueil_cdd(lecture):
    """P2, semaine sans accueil prevue au contrat d'un CDD :
    - lecture « 46 » (CCN 97.1, 109.2 et 124 par L1242-14) : semaine non
      programmee ; mensualise sur les semaines programmees, rien a deduire ;
    - lecture « 52 » (DREETS Occitanie, FAQ q. 1.24 : « Pour les mois de travail
      comportant ces semaines d'absences, le salaire sera alors minore et calcule
      selon la methode de calcul prevue a l'article 111 ») : heures prevues de la
      semaine deduites selon l'art. 111 (formule 52 semaines, en heures).
    Sortie : deductible."""
    if lecture not in ("46", "52"):
        raise ErreurSaisie("lecture : « 46 » ou « 52 ».")
    return resultat_ok(["P2"], {"deductible": lecture == "52"})


@api("R-CDD-05", "P2")
def deux_lectures_cdd(lecture_1_centimes, lecture_2_centimes, point):
    """Combine deux lectures d'un point a confirmer (P1, P2, P3, P4) : part sure =
    la plus petite, a confirmer = l'ecart (decisions T-076, preambule)."""
    if point not in ("P1", "P2", "P3", "P4"):
        raise ErreurSaisie("point : P1, P2, P3 ou P4.")
    res = _deux_lectures(entier(lecture_1_centimes, "lecture_1"), entier(lecture_2_centimes, "lecture_2"))
    res["point"] = point
    return resultat_ok([point], res)


@api("R-CDD-07")
def assiette_ifc(salaires_mois_centimes, cp_payes_pendant_contrat_centimes=0, regularisation_fin_centimes=0,
                 autres_salaires_centimes=0):
    """BrutCDD, assiette de l'IFC (R-CDD-07). C. trav. L1243-8 : « 10 % de la
    remuneration totale brute versee au salarie » ; L3221-3 (remuneration : salaire
    et « tous les autres avantages et accessoires »). Comprend : salaires du mois
    (mensualise apres deductions de l'art. 111, HC, HM et majorations), CP verses
    pendant le contrat, regularisation de fin (CCN 109.2, 124), autres salaires
    (majoration de ferie travaille, preavis travaille de L1243-2).
    Exclut (ne pas les donner) : entretien et repas (CCN 114.1, 114.2, « n'ayant
    pas le caractere de salaire »), kilometres (CCN 57), ICCP (P4), IFC, dommages
    et interets. Sortie : brut_cdd_centimes."""
    total = sum(entier(v, "salaire du mois") for v in salaires_mois_centimes)
    total += entier(cp_payes_pendant_contrat_centimes, "cp_payes_pendant_contrat_centimes")
    total += entier(regularisation_fin_centimes, "regularisation_fin_centimes")
    total += entier(autres_salaires_centimes, "autres_salaires_centimes")
    return resultat_ok(assiette_ifc.regles, {"brut_cdd_centimes": total})


@api("R-CDD-08")
def ifc_due(fin_cdd):
    """IFC due ou non selon la fin du CDD (table R-CDD-08). Fins non gerees (force
    majeure, inaptitude, jeune en vacances, saisonnier) : refus CDD-FIN-NON-GEREE.
    Sortie : due, texte."""
    due, texte = _fin(fin_cdd, ["R-CDD-08"])
    return resultat_ok(ifc_due.regles, {"due": due, "texte": texte})


@api("R-CDD-07", "R-CDD-08", "R-CDD-09", "P4")
def indemnite_fin_cdd(brut_cdd_centimes, fin_cdd, iccp_centimes=None):
    """Indemnite de fin de contrat (IFC). C. trav. L1243-8 : « Cette indemnite est
    egale a 10 % de la remuneration totale brute versee au salarie. [...] Elle est
    versee a l'issue du contrat en meme temps que le dernier salaire ». Taux de
    10 % : la CCN ne prevoit pas l'accord de L1243-9 (6 %). Due selon R-CDD-08.
    Calculee avant l'ICCP (R-CDD-09 ; Urssaf : « indemnite a calculer avant
    l'indemnite compensatrice de conges payes »).
    P4 : lecture 1 sans l'ICCP dans l'assiette (Urssaf, DREETS, reponse
    ministerielle n° 8078, JO AN 21/06/1999) = part sure ; lecture 2 avec :
    a confirmer = 10 % x ICCP (iccp_centimes, part sure de l'ICCP ; None si non
    calculee : lecture 2 non donnee).
    Sortie : indemnite_centimes (part sure), lectures, a_confirmer_centimes."""
    regles = ["R-CDD-07", "R-CDD-08"]
    due, texte = _fin(fin_cdd, regles)
    brut = entier(brut_cdd_centimes, "brut_cdd_centimes")
    if not due:
        return resultat_ok(indemnite_fin_cdd.regles, {"indemnite_centimes": 0, "raison": texte, "lectures": [0, 0],
                                                      "a_confirmer_centimes": 0})
    l1 = vers_centimes(Fraction(brut, 10), "IFC", regles)
    res = {"indemnite_centimes": l1, "texte": texte}
    if iccp_centimes is None:
        res.update({"lectures": None, "a_confirmer_centimes": None,
                    "note": "Lecture 2 de P4 (ICCP dans l'assiette) non donnee : ICCP non calculee."})
    else:
        ic = entier(iccp_centimes, "iccp_centimes")
        l2 = vers_centimes(Fraction(brut + ic, 10), "IFC, lecture 2 de P4", regles)
        res.update({"lectures": [l1, l2], "a_confirmer_centimes": l2 - l1})
    return resultat_ok(indemnite_fin_cdd.regles, res)


@api("R-CDD-10", "R-FIN-09", "P3", "R-CP-06")
def iccp_cdd(fin_cdd, periodes, ifc_centimes, brut_cdd_centimes, heures_hebdo_minutes, taux_horaire_centimes):
    """ICCP en fin de CDD (R-CDD-10).
    - CASF L423-7 ; CCN 67 et 123 : CP acquis non remuneres a la fin.
    - CCN 48.1.1.5 : dixieme de la remuneration brute de la periode, l'IFC dans la
      base de la derniere periode (L1243-8 : IFC « a titre de complement de
      salaire » ; DREETS fiche CDD p. 4 : « indemnite de fin de contrat incluse »).
    - C. trav. L1242-16 : l'indemnite « ne peut etre inferieure au dixieme de la
      remuneration totale brute percue par le salarie pendant la duree de son
      contrat » : plancher 10 % x (BrutCDD + IFC) quand aucun CP n'a ete paye.
    - L1242-16 al. 3 : pas d'ICCP si le CDD se poursuit en CDI (suite_cdi).
    P3 : lecture 1 (DREETS fiche 5/5, modele Pajemploi) = dixieme seul = part
    sure ; lecture 2 (CCN 48.1.1.5) = max(maintien ; dixieme) par periode ; a
    confirmer = ecart. Maintien = jours / 6 x heures hebdo x taux (formule de
    R-CP-06) ; jours inconnus (acquisition refusee) ou non multiples de 6
    (A-26) : lecture 2 non donnee, part sure seule.
    periodes : liste (la plus ancienne d'abord) de {salaires_bruts_periode_centimes,
    icp_versee_pendant_periode_centimes, icp_annee_precedente_centimes,
    regularisation_due_centimes (derniere periode), jours_acquis (int ou None),
    jours_payes, code_jours (code du refus d'acquisition, facultatif)}.
    Refus : A-28 (ICP selon la lecture), A-50 (jours deja payes en partie, ou
    ICCP de la periode precedente dans la base : SUS-04), CDD-PLANCHER-L1242-16
    (CP payes pendant le CDD : plancher non applique tel quel)."""
    regles = ["R-CDD-10", "R-FIN-09"]
    due_ifc, _ = _fin(fin_cdd, regles)
    if fin_cdd == "suite_cdi":
        return resultat_ok(iccp_cdd.regles, {"iccp_centimes": 0, "lectures": [0, 0], "a_confirmer_centimes": 0,
                                             "raison": "C. trav. L1242-16 al. 3 : le CDD se poursuit en CDI, "
                                                       "les CP restent acquis."})
    ifc = entier(ifc_centimes, "ifc_centimes")
    brut = entier(brut_cdd_centimes, "brut_cdd_centimes")
    h = positif(heures_hebdo_minutes, "heures_hebdo_minutes")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    if not periodes:
        raise ErreurSaisie("periodes : au moins une periode.")
    dixiemes = []
    maintiens = []
    code_l2 = None
    for i, p in enumerate(periodes):
        derniere = i == len(periodes) - 1
        payes = entier(p.get("jours_payes", 0), f"periodes[{i}].jours_payes")
        if payes:
            raise NonGere("CDD-PLANCHER-L1242-16", regles, precision=(
                "CP payes pendant le CDD : le plancher de L1242-16 sur toute la duree du contrat n'est pas applique "
                "tel quel (aucune regle de repartition lue)."))
        if not derniere:
            # SUS-04 / A-50 : l'ICCP de cette periode, payee a la fin, entre-t-elle dans la base de la suivante ?
            raise NonGere("A-50", regles, precision="ICCP de deux periodes : ICCP de la periode precedente dans la base "
                                                    "du dixieme de la derniere (SUS-04).")
        sal = entier(p.get("salaires_bruts_periode_centimes"), f"periodes[{i}].salaires_bruts_periode_centimes")
        icp1 = entier(p.get("icp_versee_pendant_periode_centimes", 0), "icp_versee_pendant_periode_centimes")
        icp2 = entier(p.get("icp_annee_precedente_centimes", icp1), "icp_annee_precedente_centimes")
        if icp1 != icp2:
            raise NonGere("A-28", regles + ["R-CP-06"])
        reg = max(0, entier(p.get("regularisation_due_centimes", 0) or 0, "regularisation_due_centimes")) \
            if derniere else 0
        base = sal + icp1 + reg + (ifc if derniere else 0)
        dixiemes.append(Fraction(base, 10))
        j = p.get("jours_acquis")
        if j is None:
            maintiens.append(None)
            code_l2 = code_l2 or p.get("code_jours", "JOURS-ACQUIS-INCONNUS")
        else:
            j = entier(j, f"periodes[{i}].jours_acquis")
            if j % 6:
                maintiens.append(None)
                code_l2 = code_l2 or "A-26"
            else:
                maintiens.append(Fraction(j, 6) * h / 60 * t)
    plancher = Fraction(brut + ifc, 10)
    l1_exact = max(sum(dixiemes), plancher)
    l1 = vers_centimes(l1_exact, "ICCP, dixieme (P3 lecture 1)", regles)
    res = {"iccp_centimes": l1, "plancher_l1242_16_exact_centimes": texte_fraction(plancher),
           "dixieme_exact_centimes": texte_fraction(sum(dixiemes))}
    if code_l2:
        res.update({"lectures": None, "a_confirmer_centimes": None, "code_lecture_2": code_l2,
                    "note": "Lecture 2 de P3 (comparaison au maintien) non calculee : " + code_l2 + "."})
    else:
        l2_exact = max(sum(max(d, m) for d, m in zip(dixiemes, maintiens)), plancher)
        l2 = vers_centimes(l2_exact, "ICCP, comparaison (P3 lecture 2)", regles)
        res.update({"lectures": [l1, l2], "a_confirmer_centimes": l2 - l1,
                    "maintien_exact_centimes": [texte_fraction(m) for m in maintiens]})
    res["question"] = "Question DDETS P3 (facultative) : dixieme seul ou comparaison au maintien pour l'AM en CDD ?"
    return resultat_ok(iccp_cdd.regles, res)


@api("R-CDD-06", "R-CDD-13")
def preavis_et_rupture_cdd(fin_cdd):
    """R-CDD-06 : le CDD « cesse de plein droit a l'echeance du terme » (C. trav.
    L1243-5) ; L1242-14 exclut les regles de rupture du CDI ; l'art. 120
    (preavis) et l'art. 121.1 (indemnite de rupture) sont au chapitre des
    ruptures du CDI (CCN 118 et 62 renvoient au droit commun). Aucune indemnite
    de preavis ni de rupture, quelle que soit la fin geree (le preavis travaille
    de L1243-2 est paye comme salaire, R-CDD-13). Sortie : preavis_centimes,
    indemnite_rupture_centimes (0)."""
    _fin(fin_cdd, ["R-CDD-06"])
    return resultat_ok(preavis_et_rupture_cdd.regles, {"preavis_centimes": 0, "indemnite_rupture_centimes": 0,
                                                       "texte": "C. trav. L1243-5, L1242-14 ; CCN 62, 118."})
