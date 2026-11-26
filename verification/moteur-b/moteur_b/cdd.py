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
# verif-1 (T-107, cas 4) : fins levees a partir des textes (base LEGI de la DILA, fonds du 08/11/2026). CASF L423-2,
# 4° rend applicable a l'AM le titre IV du livre II de la premiere partie (L1241-1 a L1248-11).
FINS_CDD.update({
    "jeune_vacances": (False, "C. trav. L1243-10, 2° : IFC non due, contrat conclu avec un jeune pour une periode "
                              "comprise dans ses vacances scolaires ou universitaires."),
    "saisonnier": (False, "C. trav. L1243-10, 1° : IFC non due, contrat conclu au titre du 3° de L1242-2 (emploi a "
                          "caractere saisonnier)."),
    "force_majeure": (False, "C. trav. L1243-10, 4° : IFC non due en cas de rupture anticipee due a un cas de force "
                             "majeure ; sinistre : indemnite de L1243-4 al. 2 (indemnite_sinistre_cdd)."),
    "inaptitude": (True, "C. trav. L1243-1 (rupture pour inaptitude constatee par le medecin du travail) ; L1243-10 ne "
                         "l'exclut pas : IFC due (L1243-8). L1243-4 : pas de dommages et interets."),
    "agrement": (False, "CASF L423-24 al. 2 : apres trois mois d'emploi au moins, « les charges liees a la rupture du "
                        "contrat de travail consecutives a la suspension ou au retrait de l'agrement ne peuvent etre "
                        "supportees par le particulier employeur » : IFC non due. Avant trois mois : "
                        "voir ifc_due_agrement (lecture, jugee ORANGE)."),
})
FINS_NON_GEREES = {
    "usage": "CDD d'usage : impossible pour une AM (C. trav. D1242-1 : le particulier employeur et l'accueil d'enfants "
             "ne sont pas dans la liste des secteurs ; L1242-2, 3°).",
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
    # T-103 (F11, A1 et A3) : lecture 1. CCN 108.1 : salaire mensualise « quels que soient le nombre d'heures de
    # travail par semaine et le nombre de semaines de travail dans l'annee » ; C. trav. L1242-14 : les dispositions
    # conventionnelles du CDI s'appliquent au CDD ; DG 22/11/2026, question n° 9 close. La fiche DREETS (heures x
    # taux) n'est pas un texte. taux et minutes sont gardes pour les appels existants (controle de saisie seul).
    return resultat_ok(salaire_mois_cdd_moins_d_un_mois.regles, {
        "valeur_centimes": s - d, "lectures": [s - d, s - d], "a_confirmer_centimes": 0,
        "texte": "CCN 108.1, 111 ; C. trav. L1242-14 (T-103, F11)"})


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
    # T-103 (F12, A1) : mode 46 semaines. CCN 97.1 et 109.2 definissent l'accueil « 46 semaines ou moins » par les
    # semaines du contrat ; L1242-14 les applique au CDD ; la FAQ DREETS (52 semaines avec retenues) n'est pas un
    # texte. La lecture « 52 » est refusee comme saisie.
    if lecture != "46":
        raise ErreurSaisie("lecture : « 46 » seulement (T-103, F12 : mode 46 semaines, CCN 97.1, 109.2).")
    return resultat_ok(["P2"], {"deductible": False})


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
    iccp_centimes : ICCP la plus haute (lecture 2 de P3 quand elle est calculee),
    pour que les lectures couvrent [plus petite, plus grande].
    Sortie : indemnite_centimes (part sure), lectures, a_confirmer_centimes."""
    regles = ["R-CDD-07", "R-CDD-08"]
    due, texte = _fin(fin_cdd, regles)
    brut = entier(brut_cdd_centimes, "brut_cdd_centimes")
    if not due:
        return resultat_ok(indemnite_fin_cdd.regles, {"indemnite_centimes": 0, "raison": texte, "lectures": [0, 0],
                                                      "a_confirmer_centimes": 0})
    # T-103 (F10, A2) : l'ICCP n'entre pas dans la base de l'IFC (circulaire DRT n° 18/90 du 30/10/1990, § 4.2.3 ;
    # reponse ministerielle n° 8078 de 1999 ; Urssaf) ; l'IFC entre dans la base de l'ICCP (iccp_cdd). L'autre
    # lecture tourne en rond. iccp_centimes est garde pour les appels existants et n'est plus lu.
    l1 = vers_centimes(Fraction(brut, 10), "IFC", regles)
    return resultat_ok(indemnite_fin_cdd.regles, {"indemnite_centimes": l1, "texte": texte,
                                                  "lectures": [l1, l1], "a_confirmer_centimes": 0})


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
    T-103 (F9) : P3 tranche : max(maintien ; dixieme) par periode (CCN
    48.1.1.5 ; les fiches DREETS et Pajemploi ne sont pas des textes).
    Maintien = jours / 6 x heures hebdo x taux ; jours inconnus (acquisition
    refusee) : refus avec le code de l'acquisition ; jours non multiples de 6 :
    refus A-26. T-103 (F7) : deux periodes : l'ICCP de la premiere entre dans la
    base de la derniere.
    periodes : liste (la plus ancienne d'abord) de {salaires_bruts_periode_centimes,
    icp_versee_pendant_periode_centimes, icp_annee_precedente_centimes,
    regularisation_due_centimes (derniere periode), jours_acquis (int ou None),
    jours_payes, code_jours (code du refus d'acquisition, facultatif),
    jours_supplementaires}.
    Refus : A-28 (ICP selon la lecture), CP-SUPP (jours supplementaires),
    CDD-PLANCHER-L1242-16 (CP payes pendant le CDD : plancher non applique tel quel)."""
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
    precedente = Fraction(0)
    for i, p in enumerate(periodes):
        derniere = i == len(periodes) - 1
        payes = entier(p.get("jours_payes", 0), f"periodes[{i}].jours_payes")
        if payes:
            raise NonGere("CDD-PLANCHER-L1242-16", regles, precision=(
                "CP payes pendant le CDD : le plancher de L1242-16 sur toute la duree du contrat n'est pas applique "
                "tel quel (aucune regle de repartition lue)."))
        sal = entier(p.get("salaires_bruts_periode_centimes"), f"periodes[{i}].salaires_bruts_periode_centimes")
        icp1 = entier(p.get("icp_versee_pendant_periode_centimes", 0), "icp_versee_pendant_periode_centimes")
        icp2 = entier(p.get("icp_annee_precedente_centimes", icp1), "icp_annee_precedente_centimes")
        if icp1 != icp2:
            raise NonGere("A-28", regles + ["R-CP-06"])
        reg = max(0, entier(p.get("regularisation_due_centimes", 0) or 0, "regularisation_due_centimes")) \
            if derniere else 0
        # T-103 (F7) : l'ICCP de la periode precedente, versee a la fin, entre dans la base de la derniere periode
        # (CCN 48.1.1.5). Refus A-50 (D10) leve.
        # verif-1 : l'ICCP de la periode precedente, versee a la fin du contrat, n'entre pas dans la base de la
        # derniere periode : guide DREETS Bourgogne-Franche-Comte (juin 2026), p. 39-40, deux exemples de fin de
        # contrat : base de la 2e periode = salaires de cette periode et CP pris pendant celle-ci (« 1/10 [(384 x 3)
        # + (270,50 EUR)] »), sans le solde de la 1re periode (75,10 EUR, verse a la rupture). CCN 48.1.1.5 : « y
        # compris celle versee au titre des conges payes pris au cours de ladite periode » vise les conges pris.
        base = sal + icp1 + reg + (ifc if derniere else 0)
        dix = Fraction(base, 10)
        sup = entier(p.get("jours_supplementaires", 0) or 0, "jours_supplementaires")
        if sup:
            # CP-SUPP (comme R-CP-06) : jours supplementaires hors du dixieme ; si cela change le dixieme : refus.
            raise NonGere("CP-SUPP", regles + ["R-CP-06"])
        dixiemes.append(dix)
        j = p.get("jours_acquis")
        if j is None:
            raise NonGere(p.get("code_jours", "JOURS-ACQUIS-INCONNUS"), regles, precision=(
                "Jours acquis inconnus : le maintien de salaire, a comparer au dixieme (T-103, F9), n'est pas connu."))
        j = entier(j, f"periodes[{i}].jours_acquis")
        # verif-1 (B-7) : jours non multiples de 6 : jours / 6 x semaine habituelle (Cass. soc. 09/05/2019). A-26 leve.
        mt = Fraction(j, 6) * h / 60 * t
        maintiens.append(mt)
        precedente = Fraction(vers_centimes(max(dix, mt), f"ICCP periode {i + 1}", regles)) if not derniere else 0
    plancher = Fraction(brut + ifc, 10)
    # T-103 (F9, A1) : CCN 48.1.1.5 : « le montant le plus avantageux pour le salarie sera retenu » ; CCN 67 et 123
    # valent pour tout contrat ; C. trav. L1242-14 (le CDD suit les regles du CDI) ; L1242-16 n'est qu'un plancher.
    # Comparaison au maintien par periode, plancher de L1242-16 sur tout le contrat.
    exact_l2 = max(sum(max(d, m_) for d, m_ in zip(dixiemes, maintiens)), plancher)
    v = vers_centimes(exact_l2, "ICCP du CDD (comparaison, T-103 F9)", regles)
    res = {"iccp_centimes": v, "plancher_l1242_16_exact_centimes": texte_fraction(plancher),
           "dixieme_exact_centimes": texte_fraction(sum(dixiemes)),
           "maintien_exact_centimes": [texte_fraction(m_) for m_ in maintiens]}
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


@api("R-CDD-09", "P2", "D11")
def solde_fin_cdd(totaux_lectures_centimes, verse_mois_centimes, fin_cdd):
    """Solde verse a la fin d'un CDD dont le salaire a deux lectures (P2 ; P1 sur
    plusieurs mois). D11 (decisions, section 4) : total sur = min(total lecture 1,
    total lecture 2) ; chaque mois a deja verse sa part sure ; le solde de fin
    est total sur - verse. A confirmer : plus grand total - total sur. Jamais sous
    la plus petite lecture (decisions, preambule). D8 : CDD suivi d'un CDI : ni
    regularisation de fin ni solde (L1243-11, CCN 124 : fin du contrat seulement).
    totaux_lectures_centimes : [total 1, total 2] (salaires du contrat et
    regularisation de fin de chaque lecture). Sortie : solde_centimes, lectures."""
    _fin(fin_cdd, ["R-CDD-09"])
    t1, t2 = (entier(x, "total") for x in totaux_lectures_centimes)
    v = entier(verse_mois_centimes, "verse_mois_centimes")
    if fin_cdd == "suite_cdi":
        return resultat_ok(["D8"], {"solde_centimes": 0, "lectures": [0, 0],
                                    "raison": "D8 : CDD suivi d'un CDI, pas de solde de fin (L1243-11, CCN 124)."})
    if min(t1, t2) < v:
        raise ErreurSaisie("Le verse depasse le plus petit total : parts sures des mois incoherentes.")
    return resultat_ok(solde_fin_cdd.regles, {"solde_centimes": min(t1, t2) - v, "lectures": [t1 - v, t2 - v],
                                              "a_confirmer_centimes": max(t1, t2) - min(t1, t2)})


@api("R-CDD-08", "D9", "L1243-11")
def controle_dates_cdd(fin_cdd, date_fin, date_terme):
    """D9 (decisions, section 4) : une fin anticipee (initiative de l'AM, commun
    accord, employeur, faute grave, essai) a la date du terme ou apres : refus
    CDD-DATE-FIN (« au terme, choisis Terme »). Travail apres le terme sans CDI
    signe : C. trav. L1243-11 (« Lorsque la relation contractuelle de travail se
    poursuit apres l'echeance du terme du contrat a duree determinee, celui-ci
    devient un contrat a duree indeterminee ») : refus CDD-DEVENU-CDI."""
    _fin(fin_cdd, ["R-CDD-08"])
    if not (isinstance(date_fin, date) and isinstance(date_terme, date)):
        raise ErreurSaisie("Dates attendues.")
    anticipees = ("initiative_am", "commun_accord", "employeur", "faute_grave", "essai")
    if fin_cdd in anticipees and date_fin >= date_terme:
        raise NonGere("CDD-DATE-FIN", ["D9"], precision="Fin anticipee a la date du terme ou apres : au terme, choisis Terme.")
    if date_fin > date_terme and fin_cdd != "suite_cdi":
        raise NonGere("CDD-DEVENU-CDI", ["D9"], precision="Travail apres le terme sans CDI signe : L1243-11.")
    return resultat_ok(["D9"], {"dates_coherentes": True})


@api("R-CDD-05", "D3")
def verifier_cas_cdd(planning_variable, moins_d_un_mois, semaines_sans_accueil):
    """D15 (decisions, section 5, remplace D3 pour le planning variable) : CDD a
    planning variable refuse en entier au passage 1. D3 : CDD qui cumule P1 et P2
    (moins d'un mois avec semaines sans accueil) : refus. Code CDD-PASSAGE-2."""
    if planning_variable:
        raise NonGere("CDD-PASSAGE-2", ["D15"], precision="CDD a planning variable : non calcule au passage 1.")
    if moins_d_un_mois and semaines_sans_accueil:
        raise NonGere("CDD-PASSAGE-2", ["D3"], precision="CDD de moins d'un mois avec semaines sans accueil (P1 et P2).")
    return resultat_ok(["D3"], {"gere": True})


@api("R-CDD-12", "D19", "L1242-10")
def controle_essai_cdd(date_debut, date_terme_initial, date_fin):
    """D19 (decisions, section 5) : fin « pendant la periode d'essai » apres la duree
    maximale d'essai : refus. C. trav. L1242-10 : « cette periode d'essai ne peut
    exceder une duree calculee a raison d'un jour par semaine, dans la limite de deux
    semaines lorsque la duree initialement prevue au contrat est au plus egale a six
    mois et d'un mois dans les autres cas. » Aucun texte lu ne dit comment compter les
    semaines (R-CDD-12) : semaines entieres (lecture stricte) ou entamees (lecture
    large). Jours comptes en jours calendaires depuis le debut. Fin apres la limite
    large : refus CDD-ESSAI-DEPASSE ; entre les deux lectures : refus CDD-ESSAI-LIMITE.
    Sortie : dans_essai (True)."""
    for d in (date_debut, date_terme_initial, date_fin):
        if not isinstance(d, date):
            raise ErreurSaisie("Dates attendues.")
    duree = (date_terme_initial - date_debut).days + 1
    six_mois = ajouter_mois(date_debut, 6) - timedelta(days=1)
    plafond = 14 if date_terme_initial <= six_mois else (ajouter_mois(date_debut, 1) - date_debut).days
    strict = min(duree // 7, plafond)
    large = min(-(-duree // 7), plafond)
    jours = (date_fin - date_debut).days + 1
    # verif-1 (T-107, cas 7) : « une duree calculee a raison d'un jour par semaine » : semaines entieres du contrat
    # (lecture stricte : la periode d'essai deroge au droit commun de la rupture du CDD, L1243-1, et s'interprete
    # strictement ; Cass. soc. 28/04/2011, n° 09-72.165 : decompte calendaire ; 11/06/1987, n° 84-41.299 et
    # 07/03/2000, n° 97-44.486 : la duree legale est un maximum). Lecture jugee ORANGE : aucun arret sur une semaine
    # entamee. Au-dela : ce n'est pas une fin pendant l'essai (refus CDD-ESSAI-DEPASSE : choisir la vraie fin).
    if jours > strict:
        raise NonGere("CDD-ESSAI-DEPASSE", ["D19"], precision=f"Fin au jour {jours} ; essai de {strict} jours au plus.")
    return resultat_ok(["D19"], {"dans_essai": True, "essai_max_jours": strict})


@api("L1243-4")
def indemnite_sinistre_cdd(remunerations_jusqu_au_terme_centimes):
    """verif-1 (T-107, cas 4) : C. trav. L1243-4 al. 2 : rupture avant le terme « en raison d'un sinistre relevant d'un
    cas de force majeure » : indemnite compensatrice « egale aux remunerations qu'il aurait percues jusqu'au terme du
    contrat », a la charge de l'employeur. L'appelant donne ces remunerations (salaire mensualise et retenue de
    l'art. 111 du mois du terme). Sortie : indemnite_centimes."""
    return resultat_ok(["L1243-4"], {"indemnite_centimes": entier(remunerations_jusqu_au_terme_centimes,
                                                                  "remunerations_jusqu_au_terme_centimes")})


@api("CASF-L423-24")
def ifc_due_agrement(date_debut, date_rupture):
    """verif-1 (T-107, R-CDD-18) : CDD rompu par la suspension ou le retrait de l'agrement. CASF L423-24 al. 2 ne vise
    que l'AM employee « depuis trois mois au moins » : au-dela, IFC non due. Avant : la regle generale de l'IFC
    (L1243-8 ; L1243-10 ne l'exclut pas) : due. Lecture de la lettre, sans arret publie (jugee ORANGE).
    Sortie : due, texte."""
    if not (isinstance(date_debut, date) and isinstance(date_rupture, date)):
        raise ErreurSaisie("Dates attendues.")
    trois = ajouter_mois(date_debut, 3)
    due = date_rupture < trois
    return resultat_ok(["CASF-L423-24"], {"due": due, "texte": FINS_CDD["agrement"][1] if not due else
                                          "Moins de trois mois d'emploi : CASF L423-24 al. 2 ne s'applique pas ; "
                                          "IFC due (L1243-8)."})
