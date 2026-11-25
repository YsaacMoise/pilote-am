"""Fin de contrat : preavis, indemnite compensatrice de preavis, indemnite de
rupture, ICCP, regularisation d'annee incomplete, indemnite de precarite,
solde de tout compte (domaine 9 et R-MENS-06 de regles-v0)."""

from datetime import date, timedelta
from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, positif, entier,
    vers_centimes, texte_fraction, type_annee_valide, verifier_date_ccn,
)
from .calendrier import anciennete_atteinte
from .conges import _indemnite_cp

_MOTIFS = ("normal", "faute_grave", "faute_lourde", "agrement", "essai", "inaptitude",
           "deces_enfant", "retraite", "deces_employeur", "deces_am", "cdd_rupture_anticipee")


def _motif_exclu(motif, regles):
    if motif not in _MOTIFS:
        raise ErreurSaisie(f"motif parmi {_MOTIFS}.")
    if motif == "inaptitude":
        raise NonGere("EXCLU-INAPTITUDE", regles + ["M-09"])
    if motif == "retraite":
        raise NonGere("EXCLU-RETRAITE", regles + ["R-FIN-15"])
    if motif in ("deces_employeur", "deces_am"):
        raise NonGere("EXCLU-DECES-PARTIE", regles)
    if motif == "cdd_rupture_anticipee":
        raise NonGere("EXCLU-CDD-ANTICIPE", regles)


def _categorie(debut, ref, regles):
    if anciennete_atteinte(debut, ref, 12, regles):
        return "un_an_et_plus"
    if anciennete_atteinte(debut, ref, 3, regles):
        return "trois_mois_a_un_an"
    return "moins_de_trois_mois"


_DUREES = {
    # T-027 : CCN art. 120, « rupture a l'initiative du particulier employeur ou du
    # salarie » : 8 jours calendaires (< 3 mois), 15 jours (3 mois a < 1 an), 1 mois.
    # Retrait : CASF L423-25 (15 jours des 3 mois, 1 mois des 1 an) ne contredit pas.
    # Demission : CASF L423-26 ne vise que l'enfant confie « depuis au moins trois
    # mois » (1 mois) ; avant 3 mois, seule la CCN s'applique (8 jours). De 3 mois a
    # moins d'un an : 1 mois (CASF) contre 15 jours (CCN), refus PREAVIS-DEMISSION-3-12.
    "employeur": {"moins_de_trois_mois": {"jours": 8}, "trois_mois_a_un_an": {"jours": 15},
                  "un_an_et_plus": {"mois": 1}},
    # T-103 (F2, A2) : demission de 3 mois a moins d'un an : 15 jours calendaires (CCN 120). CASF L423-26
    # (LEGIARTI000006798054) : preavis d'un mois « a moins que l'employeur n'accepte d'abreger cette duree » ; la CCN,
    # signee par l'organisation des particuliers employeurs, l'abrege. C. trav. L2251-1 (rendu applicable par CASF
    # L423-2, 6°) : la convention peut etre plus favorable au salarie. Remplace le refus PREAVIS-DEMISSION-3-12.
    "am": {"moins_de_trois_mois": {"jours": 8}, "trois_mois_a_un_an": {"jours": 15},
           "un_an_et_plus": {"mois": 1}},
}


@api("R-FIN-02", "R-FIN-03", "R-ESS-03", "R-FIN-08", "R-FIN-07")
def duree_preavis(auteur, date_debut_accueil, date_envoi, date_premiere_presentation, motif="normal"):
    """Duree du preavis (R-FIN-02 corrigee par T-027, CCN art. 120).
    auteur : « employeur » (retrait de l'enfant) ou « am » (demission).
    Retrait : 8 jours calendaires (< 3 mois), 15 jours (3 mois a < 1 an), 1 mois.
    Demission : 8 jours calendaires (< 3 mois) ; 3 mois a < 1 an : 15 jours
    (T-103, F2) ; 1 mois. Sortie aussi : date_fin_preavis (T-103, F1).
    Pas de preavis : periode d'essai, faute grave ou lourde, agrement.
    Deces de l'enfant : duree du retrait, a la date du deces (R-FIN-07).
    Anciennete appreciee « au jour de la date d'envoi de la lettre recommandee ou
    de sa date de remise en main propre » (CCN art. 120, dernier alinea) ; la date
    de premiere presentation fixe seulement le point de depart (non utilisee ici).
    Sortie : preavis (None, {"jours": n} ou {"mois": 1}), date_fin_preavis."""
    regles = ["R-FIN-02"]
    _motif_exclu(motif, regles)
    if auteur not in ("employeur", "am"):
        raise ErreurSaisie("auteur : « employeur » ou « am ».")
    for v in (date_debut_accueil, date_envoi, date_premiere_presentation):
        if not isinstance(v, date):
            raise ErreurSaisie("Dates attendues (datetime.date).")
    if date_premiere_presentation < date_envoi:
        raise ErreurSaisie("La premiere presentation ne peut pas preceder l'envoi.")
    verifier_date_ccn(date_envoi, regles)
    if motif in ("faute_grave", "faute_lourde", "agrement", "essai"):
        return resultat_ok(duree_preavis.regles, {"preavis": None, "raison": motif})
    if motif == "deces_enfant":
        auteur = "employeur"
    c_envoi = _categorie(date_debut_accueil, date_envoi, regles)
    duree = _DUREES[auteur][c_envoi]
    if isinstance(duree, str):
        raise NonGere(duree, regles + ["R-FIN-03"], details={"casf_l423_26": {"mois": 1}, "ccn_120": {"jours": 15}})
    # T-103 (F1, corrige) : dernier jour du preavis ; le jour de la premiere presentation est le 1er jour.
    res = {"preavis": duree, "anciennete": c_envoi}
    try:
        res["date_fin_preavis"] = _fin_delai(date_premiere_presentation, duree)
    except NonGere as e:  # DATE-MOIS : la duree reste connue, la date de fin non
        res["date_fin_preavis"] = None
        res["code_date_fin_preavis"] = e.code
    return resultat_ok(duree_preavis.regles, res)


@api("R-FIN-05", "R-ABS-07", "R-ABS-08")
def indemnite_compensatrice_preavis(type_annee, mois):
    """Indemnite compensatrice de preavis si l'employeur dispense l'AM (R-FIN-05,
    CCN art. 64.2 et 122). Pour chaque mois civil du preavis : salaire mensualise,
    reduit par la formule de l'art. 111 si le preavis ne couvre qu'une partie du
    mois.
    mois : liste de dicts {"salaire_mensualise_centimes", "prevu_mois",
    "prevu_dans_preavis", "semaines_non_accueil": 0}. Unites : minutes en annee
    complete, jours entiers en annee incomplete.
    Sortie : indemnite_centimes, detail par mois."""
    type_annee_valide(type_annee)
    total = 0
    detail = []
    for i, m in enumerate(mois):
        s = entier(m.get("salaire_mensualise_centimes"), f"mois[{i}].salaire_mensualise_centimes")
        pm = positif(m.get("prevu_mois"), "prevu_mois")
        pp = positif(m.get("prevu_dans_preavis"), "prevu_dans_preavis")
        sna = entier(m.get("semaines_non_accueil", 0), "semaines_non_accueil")
        if pp > pm or pm == 0:
            raise ErreurSaisie(f"mois[{i}] : valeurs incoherentes.")
        if pp == pm:
            v = s
        else:
            if type_annee == "incomplete":
                if pp.denominator != 1 or pm.denominator != 1:
                    raise NonGere("A-21", ["R-ABS-08"])
                if sna:
                    raise NonGere("A-19", ["R-ABS-08"])
            v = vers_centimes(Fraction(s) * pp / pm, f"preavis, mois {i + 1}", ["R-FIN-05"])
        total += v
        detail.append(v)
    return resultat_ok(indemnite_compensatrice_preavis.regles, {"indemnite_centimes": total,
                                                                "detail_centimes": detail})


@api("R-FIN-05", "T074-ICP")
def indemnite_preavis_dispense(type_annee, mois, taux_horaire_centimes):
    """T-074 : indemnite compensatrice de preavis (ICP) quand le particulier
    employeur dispense l'AM de tout ou partie du preavis (regles/t074-preavis-
    dispense.md, points 1 et 11).
    - CCN art. 64.2 : ICP « jusqu'a la date prevue de fin du contrat de travail »,
      « egale au montant de la remuneration brute correspondant a la duree du
      preavis ». Art. 66 : « la remuneration due au salarie jusqu'a la date de fin
      du contrat de travail ». Art. 122 : « Si le preavis se termine en cours de
      mois, le particulier employeur tient compte de la deduction d'absence prevue
      a l'article 111 ». Art. 108.1, 109.1, 109.2 : salaire mensualise.
    - Mois sans aucun jour paye hors dispense (« non mixte ») : tout ce qui est du
      pour le mois est de l'ICP. ICP = mensualise x (prevu - non payes) / prevu,
      c'est-a-dire le mensualise moins la deduction de l'art. 111 pour les jours
      apres la date de fin (et avant l'embauche). Mois entier : mensualise entier.
    - Mois « mixte » (jours payes en salaire et jours dispenses) : T-103 (F5) :
      proportion de l'art. 111 (CCN 122) : mensualise x prevu dispense / prevu du
      mois. Dispense qui couvre une semaine sans accueil dans un mois mixte (annee
      incomplete) : refus P-1 garde (cas absent du tableau T-103).
    mois : liste de dicts {"salaire_mensualise_centimes", "prevu_mois" (minutes en
      annee complete, jours en annee incomplete, denominateur de l'art. 111),
      "non_payes" (memes unites : jours du mois apres la fin et avant l'embauche,
      deduits), "mixte" (bool), "prevu_dispense" (memes unites), "minutes_dispense",
      "semaine_sans_accueil_dans_dispense" (bool)}.
    Sortie : indemnite_centimes, detail_centimes (par mois)."""
    regles = ["R-FIN-05", "T074-ICP"]
    type_annee_valide(type_annee)
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    lect_i, lect_ii, detail_i, detail_ii = 0, 0, [], []
    p1 = False
    for i, mo in enumerate(mois):
        s = entier(mo.get("salaire_mensualise_centimes"), f"mois[{i}].salaire_mensualise_centimes")
        pm = positif(mo.get("prevu_mois"), f"mois[{i}].prevu_mois")
        if pm == 0:
            raise ErreurSaisie(f"mois[{i}] : prevu du mois nul.")
        if mo.get("mixte"):
            pd = positif(mo.get("prevu_dispense"), f"mois[{i}].prevu_dispense")
            md = positif(mo.get("minutes_dispense"), f"mois[{i}].minutes_dispense")
            if pd > pm:
                raise ErreurSaisie(f"mois[{i}] : plus de jours dispenses que prevus.")
            if mo.get("semaine_sans_accueil_dans_dispense"):
                raise NonGere("P-1", regles, precision=(
                    f"Mois {i + 1} : dispense sur une semaine sans accueil dans un mois paye en partie en salaire."))
            vi = vers_centimes(Fraction(s) * pd / pm, f"ICP mois {i + 1}, proportion art. 111", regles)
            # T-103 (F5, A1) : CCN 122 (KALIARTI000043942323) : « Si le preavis se termine en cours de mois, le
            # particulier employeur tient compte de la deduction d'absence prevue a l'article 111 ». La proportion
            # de l'art. 111 est la methode ecrite ; « heures x taux » n'a pas de texte. Refus P-1 leve (sauf semaine
            # sans accueil dans la dispense, ci-dessus, non traitee par le tableau).
            vii = vi
        else:
            npay = positif(mo.get("non_payes", 0), f"mois[{i}].non_payes")
            if npay > pm:
                raise ErreurSaisie(f"mois[{i}] : plus de jours non payes que prevus.")
            vi = vii = vers_centimes(Fraction(s) * (pm - npay) / pm, f"ICP mois {i + 1}", regles)
        lect_i += vi
        lect_ii += vii
        detail_i.append(vi)
        detail_ii.append(vii)
    if p1:
        raise NonGere("P-1", regles, precision=(
            "Repartition salaire / ICP dans un mois paye en partie en salaire : proportion de l'art. 111 ou "
            "heures x taux, non ecrit (regles/t074-preavis-dispense.md, point 1)."),
            details={"lectures_centimes": [lect_i, lect_ii],
                     "detail_proportion_centimes": detail_i, "detail_heures_centimes": detail_ii})
    return resultat_ok(regles, {"indemnite_centimes": lect_i, "detail_centimes": detail_i})


@api("R-FIN-11", "R-MENS-06", "T074-REG")
def regularisation_finale_preavis_dispense(ecarts_annuels_signes_centimes, salaires_mensualises_verses_centimes,
                                           taux_horaire_centimes, heures_travaillees_minutes, minutes_dispensees,
                                           indemnite_preavis_centimes, composantes, nature_taux="brut"):
    """T-074 (point 6, question D-2) : regularisation definitive de l'annee
    incomplete (CCN art. 124, « effectuee a la date de fin du contrat de travail »,
    109.2 « heures reellement effectuees ») quand l'employeur dispense l'AM du
    preavis. Deux lectures, non tranchees :
    (a) les jours dispenses comptent comme dus et payes jusqu'a la date prevue de
        fin : salaires verses (ICP comprise) contre heures travaillees + heures
        dispensees ;
    (b) la regularisation s'arrete au dernier jour travaille, l'ICP etant a part :
        salaires verses moins l'ICP contre heures travaillees seules.
    La lecture (c) (heures dispensees en trop-percu) est ecartee par le juriste
    (elle priverait l'AM de l'ICP, contraire a l'art. 64.2).
    indemnite_preavis_centimes : entier, ou liste d'entiers si l'ICP elle-meme
    a plusieurs lectures (P-1) ; chaque valeur est testee en lecture (b).
    Meme versement dans toutes les lectures : resultat. Sinon : refus D-2.
    Un refus de regularisation_finale (A-06, A-02...) est propage.
    Sortie : versement_centimes."""
    regles = ["R-FIN-11", "T074-REG"]
    icps = indemnite_preavis_centimes if isinstance(indemnite_preavis_centimes, (list, tuple)) \
        else [indemnite_preavis_centimes]
    if not icps:
        raise ErreurSaisie("indemnite_preavis_centimes : au moins une valeur.")
    verse = entier(salaires_mensualises_verses_centimes, "salaires_mensualises_verses_centimes")
    trav = entier(heures_travaillees_minutes, "heures_travaillees_minutes")
    disp = entier(minutes_dispensees, "minutes_dispensees")

    def une(v, h):
        r = regularisation_finale("incomplete", ecarts_annuels_signes_centimes, v, taux_horaire_centimes, h,
                                  composantes, nature_taux=nature_taux)
        if r["statut"] == "non_gere":
            raise NonGere(r["code"], regles, precision=r.get("precision"), details=r.get("details"))
        if r["statut"] not in ("ok", "provisoire"):
            raise ErreurSaisie(r.get("message", "regularisation_finale"), regles)
        return r["resultat"]["versement_centimes"]

    for x in icps:
        if entier(x, "indemnite_preavis_centimes") > verse:
            raise ErreurSaisie("ICP superieure aux salaires verses.", regles)
    # T-103 (F6, A2) : lecture (a). CCN 124 : regularisation « effectuee a la date de fin du contrat de travail » ;
    # CCN 64 : cette date est la « date prevue de fin du preavis » ; CCN 66 : l'ICP « correspond a la remuneration
    # due au salarie jusqu'a la date de fin du contrat ». Les jours dispenses sont dans la periode, comptes comme
    # dus et payes. Refus D-2 leve.
    va = une(verse, trav + disp)
    return resultat_ok(regles, {"versement_centimes": va, "lecture": "a (T-103, F6)"})


@api("R-FIN-10")
def jours_a_indemniser(jours_acquis, jours_deja_payes):
    """R-FIN-10 : jours a indemniser = jours acquis - jours deja payes (les CP
    payes mais non pris ne sont pas indemnises une seconde fois, R-FIN-09).
    Sortie : jours."""
    a = entier(jours_acquis, "jours_acquis")
    p = entier(jours_deja_payes, "jours_deja_payes")
    if p > a:
        raise ErreurSaisie("Plus de jours payes qu'acquis.")
    return resultat_ok(jours_a_indemniser.regles, {"jours": a - p})


@api("R-FIN-09", "R-FIN-10", "R-CP-06")
def iccp(type_annee, motif, periodes, heures_hebdo_minutes, taux_horaire_centimes):
    """Indemnite compensatrice de conges payes (R-FIN-09, R-FIN-10, R-CP-06).
    R-FIN-09 est « douteuse » pour la seule exclusion en cas de faute lourde
    (contre-verification) : faute lourde -> refus A-49. Agrement -> refus A-48.
    periodes : liste, la plus ancienne d'abord, de dicts
      {"jours_acquis", "jours_payes", "salaires_bruts_periode_centimes",
       "icp_versee_pendant_periode_centimes": 0, "icp_annee_precedente_centimes": 0,
       "jours_supplementaires": 0, "heures_conge_minutes": None,
       "regularisation_due_centimes": 0, "regularisation_a_confirmer": False,
       "sommes_assiette_ambigues": {nom: centimes}}.
    Periode dont une partie des jours est deja payee : refus A-50 (repartition
    non ecrite). L'ICCP calculee pour la periode precedente et les autres sommes
    ambigues sont testees avec et sans inclusion dans l'assiette du dixieme ;
    si cela change le resultat : refus A-50 (SUS-04, toujours ouvert).
    T-050b (A-50, regularisation) : la regularisation definitive due a l'AM
    (CCN art. 124, versee a la date de fin) entre dans la base du dixieme de la
    derniere periode (CCN art. 123.2, 48.1.1.5, 48.1.1.1 ; CASF L423-6 ; fiche
    DDETS 31 5/5 du 05/11/2024). Elle n'est plus testee « avec et sans ». Seule
    la derniere periode peut la porter. Un solde negatif (en faveur de
    l'employeur) ne se retire pas de la base : il compte pour 0. Montant « a
    confirmer » : refus ASSIETTE-A-CONFIRMER (la base en depend).
    Sortie : iccp_centimes, detail par periode."""
    regles = ["R-FIN-09", "R-FIN-10"]
    type_annee_valide(type_annee)
    _motif_exclu(motif, regles)
    if motif == "faute_lourde":
        raise NonGere("A-49", regles)
    if motif == "agrement":
        raise NonGere("A-48", regles + ["R-FIN-08"])
    total = 0
    detail = []
    precedente = 0
    for i, p in enumerate(periodes):
        derniere = i == len(periodes) - 1
        reg = p.get("regularisation_due_centimes", 0) or 0
        if not isinstance(reg, int) or isinstance(reg, bool):
            raise ErreurSaisie(f"periodes[{i}].regularisation_due_centimes : entier attendu.")
        reg_conf = p.get("regularisation_a_confirmer", False)
        if (reg or reg_conf) and not derniere:
            raise ErreurSaisie(f"periodes[{i}] : la regularisation de fin ne porte que sur la derniere periode.")
        if any("regularisation" in str(nom) for nom in (p.get("sommes_assiette_ambigues") or {})):
            raise ErreurSaisie("Regularisation : utiliser regularisation_due_centimes (T-050b, plus ambigue).")
        a = entier(p.get("jours_acquis"), f"periodes[{i}].jours_acquis")
        pay = entier(p.get("jours_payes", 0), f"periodes[{i}].jours_payes")
        if pay > a:
            raise ErreurSaisie(f"periodes[{i}] : plus de jours payes qu'acquis.")
        reste = a - pay
        if reste == 0:
            v = 0
        elif pay > 0:
            raise NonGere("A-50", regles, precision=f"Periode {i + 1} : {pay} jours deja payes sur {a}.")
        else:
            if reg_conf:
                raise NonGere("ASSIETTE-A-CONFIRMER", regles + ["R-CP-06"], precision=(
                    "Regularisation de fin a confirmer : la base du dixieme de la derniere periode en depend."),
                    details={"sommes_a_confirmer": ["regularisation"]})
            # T-103 (F7, A1) : CCN 48.1.1.5 : le dixieme porte sur « la remuneration totale brute [...] percue
            # [...] au cours de la periode de reference [...], y compris celle versee au titre des conges payes ».
            # L'ICCP de la periode precedente, versee a la fin du contrat (dans la derniere periode), et la
            # regularisation (salaire, CCN 124) entrent dans la base. Refus A-50 (SUS-04) leve pour l'ICCP.
            base_periode = entier(p.get("salaires_bruts_periode_centimes"),
                                  f"periodes[{i}].salaires_bruts_periode_centimes") + max(0, reg) + precedente
            amb = {}
            for nom, montant in (p.get("sommes_assiette_ambigues") or {}).items():
                amb[nom] = (montant, "A-50")
            val, methode, _, _ = _indemnite_cp(
                a, heures_hebdo_minutes, taux_horaire_centimes, base_periode,
                p.get("icp_versee_pendant_periode_centimes", 0), p.get("icp_annee_precedente_centimes", 0),
                p.get("heures_conge_minutes"), p.get("jours_supplementaires", 0), amb, regles + ["R-CP-06"], type_annee)
            v = vers_centimes(val, f"ICCP periode {i + 1}", regles)
        total += v
        detail.append(v)
        precedente = v
    return resultat_ok(iccp.regles, {"iccp_centimes": total, "detail_centimes": detail})


@api("R-FIN-06", "R-FIN-07", "R-FIN-08", "R-ESS-03")
def indemnite_rupture(motif, auteur, date_debut_accueil, date_reference, salaires_bruts_centimes,
                      iccp_centimes=0, icp_centimes=0, indemnite_preavis_centimes=0, regularisation_centimes=0,
                      sommes_a_confirmer=(), date_fin_contrat=None):
    """Indemnite de rupture (R-FIN-06, CCN art. 121.1) : due en cas de retrait
    de l'enfant (auteur « employeur ») apres au moins 9 mois d'accueil ; non due
    en cas de demission, d'essai, de faute grave ou lourde, d'agrement.
    Montant = 1/80 des salaires bruts du contrat, hors indemnites d'entretien,
    de repas et kilometriques.
    T-050b (A-45) : CCN art. 121.1, « total des salaires bruts perçus pendant la
    duree du contrat », « hors indemnites non soumises a contributions et
    cotisations sociales ». L'ICCP (les deux periodes, art. 123 et 48.1.1.5 :
    « caractere de salaire »), les CP payes pendant le contrat (48.1.1.5) et la
    regularisation definitive (art. 124, soumise a cotisations) sont des
    salaires bruts : ils entrent dans l'assiette. Fiches DDETS 31 du 19/01/2023 :
    11 662,78 EUR (Durand) et 9 148,57 EUR (Bertrand).
    T-103 (F4) : l'indemnite de preavis entre aussi dans l'assiette.
    Restent refuses :
    - regularisation negative : A-45 (un solde en faveur de l'employeur n'est
      pas un salaire percu ; aucun texte lu ne dit s'il se retire) ;
    - sommes_a_confirmer non vide (ICCP ou regularisation non calculee) :
      ASSIETTE-A-CONFIRMER (jamais une assiette incomplete en silence).
    Deces de l'enfant (R-FIN-07) : meme calcul, du quelle que soit l'anciennete
    (T-035a : CCN art. 119.4.2, l'indemnite est due et seul son « montant » suit
    l'art. 121-1 ; service-public F16842 : « cette condition d'anciennete est
    supprimee et l'indemnite est due »). A-47 levee.
    date_reference : date d'envoi de la lettre (ou du deces).
    date_fin_contrat : date de fin du contrat (CCN 64). T-103 (F3) : les 9 mois
    s'apprecient a cette date (CCN 60, 64.2) ; sans elle, a date_reference.
    Sortie : indemnite_centimes (non soumise a cotisations)."""
    regles = ["R-FIN-06"]
    _motif_exclu(motif, regles)
    if not (isinstance(date_debut_accueil, date) and isinstance(date_reference, date)):
        raise ErreurSaisie("Dates attendues.")
    if date_fin_contrat is not None and (not isinstance(date_fin_contrat, date) or date_fin_contrat < date_reference):
        raise ErreurSaisie("date_fin_contrat : date attendue, posterieure ou egale a la date de reference.")
    verifier_date_ccn(date_reference, regles)
    if motif in ("faute_grave", "faute_lourde", "agrement", "essai") or (motif == "normal" and auteur == "am"):
        return resultat_ok(indemnite_rupture.regles, {"indemnite_centimes": 0, "raison": "non due"})
    if auteur not in ("employeur", "am"):
        raise ErreurSaisie("auteur : « employeur » ou « am ».")
    if motif == "deces_enfant":
        regles = ["R-FIN-07"]
        neuf_mois = True  # condition de 9 mois sans objet (CCN 119.4.2 ; F16842)
    else:
        # T-103 (F3, A1) : CCN 60 (KALIARTI000043942169) : l'anciennete « s'arrete a la date a laquelle le contrat
        # de travail prend fin » ; CCN 64 : fin du preavis, ou « date prevue de fin du preavis » s'il est dispense ;
        # CCN 64.2 : la periode d'inexecution compte « au titre de l'anciennete ». Les 9 mois s'apprecient a la fin
        # du contrat (date_fin_contrat). Refus D-1 leve. Sans date_fin_contrat : date_reference, que l'appelant
        # doit alors prendre egale a la fin du contrat.
        neuf_mois = anciennete_atteinte(date_debut_accueil, date_fin_contrat or date_reference, 9, regles)
    if not neuf_mois:
        return resultat_ok(indemnite_rupture.regles, {"indemnite_centimes": 0, "raison": "moins de 9 mois d'accueil"})
    a_confirmer = sorted(str(x) for x in (sommes_a_confirmer or ()))
    if a_confirmer:
        raise NonGere("ASSIETTE-A-CONFIRMER", regles, precision=(
            "Assiette du 1/80 incomplete : " + ", ".join(a_confirmer) + " non calcule(s)."),
            details={"sommes_a_confirmer": a_confirmer})
    base = entier(salaires_bruts_centimes, "salaires_bruts_centimes")
    preavis = entier(indemnite_preavis_centimes, "indemnite_preavis_centimes")
    if isinstance(regularisation_centimes, int) and not isinstance(regularisation_centimes, bool) \
            and regularisation_centimes < 0:
        raise NonGere("A-45", regles, precision="Regularisation negative : effet sur l'assiette non ecrit.",
                      details={"sommes_ambigues_centimes": {"regularisation_centimes": regularisation_centimes}})
    # T-103 (F4, A1) : CCN 121.1 exclut seulement les « indemnites non soumises a contributions et cotisations
    # sociales ». L'indemnite de preavis est « soumise a contributions et cotisations sociales » (CCN 64.2) : elle
    # entre dans l'assiette, comme l'ICCP (48.1.1.5) et la regularisation (124). Refus A-45 leve pour le preavis.
    incluses = {n: entier(v, n) for n, v in (("iccp_centimes", iccp_centimes), ("icp_centimes", icp_centimes),
                                              ("regularisation_centimes", regularisation_centimes))}
    assiette = base + sum(incluses.values()) + preavis
    montant = vers_centimes(Fraction(assiette, 80), "indemnite de rupture", regles)
    return resultat_ok(indemnite_rupture.regles,
                       {"indemnite_centimes": montant, "assiette_centimes": assiette})


TEXTE_DELAIS = (
    "CCN 64.1 (KALIARTI000050724233) : « un delai prefix commencant a courir a compter de la date de la premiere "
    "presentation » ; CCN 120 : la date de premiere presentation « fixe le point de depart du preavis » ; CASF "
    "L423-24 : « La date de presentation de la lettre recommandee fixe le point de depart du preavis ». Fiche "
    "officielle F2883 (code.travail.gouv.fr, mise a jour du 07/08/2026, verifiee par la direction) : lettre "
    "presentee le 8 juillet, « Le preavis s'effectue du 8 juillet au 7 aout 2026 inclus ». Le jour de presentation "
    "est le 1er jour du preavis (tableau T-103, F1 corrige apres la porte-verite).")


def _fin_preavis(premier_jour, preavis):
    """Dernier jour d'un preavis dont premier_jour est le 1er jour (T-103, F1 corrige ; F8).
    Jours : premier_jour + n - 1. Mois : veille du meme quantieme n mois plus tard. Depart apres le 28 pour un
    preavis en mois : refus DATE-MOIS (aucun texte ni exemple officiel pour la veille d'un quantieme absent)."""
    if not isinstance(premier_jour, date):
        raise ErreurSaisie("premier jour du preavis : date attendue.")
    if not isinstance(preavis, dict) or len(preavis) != 1:
        raise ErreurSaisie("preavis : {'jours': n} ou {'mois': n}.")
    if "jours" in preavis:
        return premier_jour + timedelta(days=entier(preavis["jours"], "preavis.jours", 1) - 1)
    if "mois" in preavis:
        from .calendrier import ajouter_mois
        return ajouter_mois(premier_jour, entier(preavis["mois"], "preavis.mois", 1)) - timedelta(days=1)
    raise ErreurSaisie("preavis : {'jours': n} ou {'mois': n}.")


# Ancien nom garde pour les appels internes (duree_preavis).
_fin_delai = _fin_preavis


@api("R-FIN-03", "T103-F1")
def date_fin_preavis(date_premiere_presentation, preavis):
    """T-103 (F1, A2, corrige apres la porte-verite) : dernier jour du preavis.
    Le jour de la premiere presentation (ou de la remise en main propre) est le
    1er jour du preavis :
    - {"jours": n} : presentation + n - 1 (lettre du 15/10, 15 jours : 29/10) ;
    - {"mois": n} : veille du meme quantieme (08/07 : 07/08 ; 15/10 : 14/11) ;
      depart apres le 28 : refus DATE-MOIS.
    Pas de report un samedi, un dimanche ou un ferie (aucun texte ne le prevoit).
    Textes : TEXTE_DELAIS.
    Sortie : date_fin (datetime.date), premier_jour (jour de la presentation)."""
    fin = _fin_preavis(date_premiere_presentation, preavis)
    return resultat_ok(date_fin_preavis.regles, {"date_fin": fin, "premier_jour": date_premiere_presentation,
                                                 "texte": TEXTE_DELAIS})


@api("R-FIN-03", "T103-F1")
def dates_fin_preavis_possibles(date_premiere_presentation, preavis):
    """T-072, modifiee par T-103 (F1) : une seule date de fin, celle de
    date_fin_preavis (jour de presentation compte comme 1er jour). Gardee pour
    les appels existants. Sortie : dates (liste d'une date)."""
    fin = _fin_preavis(date_premiere_presentation, preavis)
    return resultat_ok(dates_fin_preavis_possibles.regles, {"dates": [fin], "texte": TEXTE_DELAIS})


@api("R-FIN-07", "T103-F8")
def periode_indemnite_deces(date_deces, preavis):
    """T-103 (F8, A2) : periode de l'indemnite egale au preavis apres le deces de
    l'enfant. CCN 119.4.2 (KALIARTI000043942317) : rupture « au jour du deces » ;
    versement « du dernier salaire du au jour du deces » et « d'une indemnite egale
    a l'indemnite compensatrice de preavis definie a l'article 122 [...], qui ne
    peut etre execute du fait du deces ». Le jour du deces est paye en salaire ;
    la periode de l'indemnite commence le lendemain et dure le preavis (compte
    comme F1, le lendemain etant le 1er jour). preavis : sortie de
    duree_preavis(motif="deces_enfant").
    Sortie : premier_jour (lendemain du deces), dernier_jour."""
    if not isinstance(date_deces, date):
        raise ErreurSaisie("date_deces : date attendue.")
    premier = date_deces + timedelta(days=1)
    return resultat_ok(periode_indemnite_deces.regles, {"premier_jour": premier,
                                                        "dernier_jour": _fin_preavis(premier, preavis),
                                                        "texte": "CCN 119.4.2 ; " + TEXTE_DELAIS})


def _mois_cle(d):
    return f"{d.year:04d}-{d.month:02d}"


def _mois_suivant(cle):
    a, m = int(cle[:4]), int(cle[5:])
    return f"{a + (m == 12):04d}-{m % 12 + 1:02d}"


@api("R-FIN-06", "R-FIN-07")
def indemnite_rupture_bulletins(motif, auteur, date_debut_accueil, date_reference, variantes,
                                total_bulletins_centimes=None, total_jusqua=None, bruts_lus_centimes=None):
    """T-072 (T-054) : indemnite de rupture quand l'utilisatrice a saisi le total
    reel de ses bulletins (du debut du contrat au mois « total_jusqua » compris,
    « AAAA-MM ») ou des bruts lus sur des bulletins ({"AAAA-MM": centimes}).

    Texte : CCN art. 121.1 (socle AM) : 1/80 « du total des salaires bruts percus
    pendant la duree du contrat, hors indemnites non soumises a contributions et
    cotisations sociales telles que l'indemnite kilometrique, l'indemnite
    d'entretien et les frais de repas ». Le mot « percus » : les montants des
    bulletins font foi pour les mois qu'ils couvrent (consigne T-072 ; regles/
    points-t021.md A-45). Hypothese d'entree, a confirmer par la direction pour
    l'ecran de saisie : le total ou le brut lu est un total de SALAIRES BRUTS
    soumis a cotisations (sans entretien, repas, kilometres, ni l'indemnite de
    rupture elle-meme, exoneree : regles-v0 R-PAJ, declaration de fin).

    Sommes de fin : l'ICCP (CCN art. 67, 123 : conges « non remuneres au jour de
    la date de fin »), la regularisation (art. 124 : « effectuee a la date de fin
    du contrat ») et l'indemnite de preavis sont payees sur le dernier bulletin,
    avec le salaire du dernier mois (regles/t050-trois-regles.md, point 2, 5 ;
    declaration de fin Pajemploi : le parent y « coche les indemnites dues et
    leurs montants », regles-v0 R-PAJ). Donc :
    - dernier mois couvert par les bulletins : ces sommes sont dans le montant
      saisi ; B n'ajoute rien. Restent a confirmer : une regularisation non
      calculee (son signe est inconnu) ; refus A-45 : une regularisation negative
      ou une indemnite de preavis non nulle, dont l'effet sur l'assiette n'est pas
      tranche et qui seraient deja melees au montant saisi ;
    - dernier mois non couvert : B ajoute les salaires des mois non couverts, l'ICCP
      et la regularisation (T-050b) ; une somme non calculee (None) rend
      l'indemnite « a confirmer » (ASSIETTE-A-CONFIRMER).

    variantes : une par date de fin possible (voir dates_fin_preavis_possibles) :
    {"date_fin": date, "salaires_mois_centimes": {"AAAA-MM": int ou None},
     "iccp_centimes": int ou None, "regularisation_centimes": int ou None,
     "indemnite_preavis_centimes": int ou None}. Les salaires d'un mois sont le
    salaire brut et les CP payes ce mois (hors indemnites non soumises).
    B conclut seulement si toutes les variantes donnent la meme assiette ; sinon
    refus FIN-DATE-A-CONFIRMER (aucun texte ne fixe le dernier jour du preavis).
    Sortie : indemnite_centimes, assiette_centimes."""
    regles = ["R-FIN-06"]
    # T-103 (F3) : 9 mois apprecies a la fin du contrat (date de fin des variantes, si elle est unique).
    fins = {v.get("date_fin") for v in (variantes or [])}
    fin_unique = fins.pop() if len(fins) == 1 else None
    essai = indemnite_rupture.interne(motif, auteur, date_debut_accueil, date_reference, 0,
                                      date_fin_contrat=fin_unique if isinstance(fin_unique, date) else None)
    if essai["resultat"].get("raison"):
        return resultat_ok(indemnite_rupture_bulletins.regles, essai["resultat"])
    if motif == "deces_enfant":
        regles = ["R-FIN-07"]
    if total_bulletins_centimes is None and not bruts_lus_centimes:
        raise ErreurSaisie("Donner total_bulletins_centimes (avec total_jusqua) ou bruts_lus_centimes.")
    lus = {}
    for cle, v in (bruts_lus_centimes or {}).items():
        lus[str(cle)] = entier(v, f"bruts_lus_centimes[{cle}]")
    total = 0
    if total_bulletins_centimes is not None:
        total = entier(total_bulletins_centimes, "total_bulletins_centimes")
        if not (isinstance(total_jusqua, str) and len(total_jusqua) == 7):
            raise ErreurSaisie("total_jusqua : mois « AAAA-MM » attendu avec le total.")
        doubles = sorted(c for c in lus if c <= total_jusqua)
        if doubles:
            raise ErreurSaisie("Bruts lus pour des mois deja dans le total saisi : " + ", ".join(doubles) + ".")
    if not variantes:
        raise ErreurSaisie("variantes : au moins une date de fin.")
    debut = _mois_cle(date_debut_accueil)
    assiettes = {}
    a_confirmer = {}
    ambigus = {}
    for v in variantes:
        fin = v.get("date_fin")
        if not isinstance(fin, date) or fin < date_debut_accueil:
            raise ErreurSaisie("variante : date_fin attendue, apres le debut.")
        dernier = _mois_cle(fin)
        manque = []
        if total_bulletins_centimes is not None and total_jusqua > dernier:
            manque.append(f"bulletins saisis au-dela du mois de fin ({total_jusqua})")
        hors = sorted(c for c in lus if c < debut or c > dernier)
        if hors:
            manque.append("bruts lus hors du contrat (" + ", ".join(hors) + ")")

        def couvert(c):
            return (total_bulletins_centimes is not None and c <= total_jusqua) or c in lus

        assiette = total + sum(x for c, x in lus.items() if debut <= c <= dernier)
        sal = v.get("salaires_mois_centimes") or {}
        c = debut
        while c <= dernier:
            if not couvert(c):
                x = sal.get(c)
                if x is None:
                    manque.append(f"salaire {c}")
                else:
                    assiette += entier(x, f"salaires_mois_centimes[{c}]")
            c = _mois_suivant(c)
        reg = v.get("regularisation_centimes")
        pre = v.get("indemnite_preavis_centimes")
        cle_v = fin.isoformat()
        if pre is None:
            manque.append("indemnite de preavis")
        # T-103 (F4) : l'indemnite de preavis entre dans l'assiette (CCN 121.1, 64.2) : comprise dans le dernier
        # bulletin s'il est couvert, ajoutee sinon (ci-dessous). Plus de refus A-45 pour elle.
        if reg is None:
            manque.append("regularisation")
        elif isinstance(reg, int) and not isinstance(reg, bool) and reg < 0:
            ambigus.setdefault(cle_v, {})["regularisation_centimes"] = reg
        if not couvert(dernier):
            iccp_v = v.get("iccp_centimes")
            if iccp_v is None:
                manque.append("iccp")
            else:
                assiette += entier(iccp_v, "iccp_centimes")
            if reg is not None and reg > 0:
                assiette += entier(reg, "regularisation_centimes")
            if pre is not None:
                assiette += entier(pre, "indemnite_preavis_centimes")
        if manque:
            a_confirmer[cle_v] = manque
        else:
            assiettes[cle_v] = assiette
    if ambigus:
        raise NonGere("A-45", regles, precision=(
            "Regularisation negative dans l'assiette du 1/80 : point non tranche."),
            details={"sommes_ambigues_centimes": ambigus})
    if a_confirmer:
        raise NonGere("ASSIETTE-A-CONFIRMER", regles, precision="Assiette du 1/80 incomplete pour au moins une date de fin.",
                      details={"sommes_a_confirmer": a_confirmer, "assiettes_connues_centimes": assiettes})
    valeurs = set(assiettes.values())
    if len(valeurs) > 1:
        raise NonGere("FIN-DATE-A-CONFIRMER", regles + ["R-FIN-03"],
                      precision="L'assiette change selon la date de fin du preavis, que le texte ne fixe pas.",
                      details={"assiettes_centimes": assiettes})
    assiette = valeurs.pop()
    return resultat_ok(indemnite_rupture_bulletins.regles,
                       {"indemnite_centimes": vers_centimes(Fraction(assiette, 80), "indemnite de rupture", regles),
                        "assiette_centimes": assiette, "dates_fin_testees": sorted(assiettes)})


_COMPOSANTES = ("feries_chomes_payes", "absences_remunerees", "heures_complementaires")


def _ecart_regularisation(salaires_mensualises_verses_centimes, taux_horaire_centimes, heures_effectuees_minutes,
                          composantes, nature_taux, regles):
    """Ecart (du - verse) pour les heures reellement effectuees. Renvoie
    (bas, haut) en centimes exacts ; None = inconnu (non borne)."""
    if nature_taux != "brut":
        raise NonGere("A-02", regles, precision="Taux fourni en net.")
    verse = Fraction(entier(salaires_mensualises_verses_centimes, "salaires_mensualises_verses_centimes"))
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    total = positif(heures_effectuees_minutes, "heures_effectuees_minutes")
    if composantes is None:
        raise ErreurSaisie("composantes obligatoires : pour chacune de " + ", ".join(_COMPOSANTES)
                           + ", donner {'minutes': int ou None, 'incluses': bool}.", ["R-MENS-06"])
    bas, haut = total, total
    bas_inconnu = haut_inconnu = False
    for nom in _COMPOSANTES:
        if nom not in composantes:
            raise ErreurSaisie(f"composante manquante : {nom}.", ["R-MENS-06"])
        c = composantes[nom]
        minutes = c.get("minutes")
        incl = bool(c.get("incluses", False))
        if minutes is None:
            if incl:
                bas_inconnu = True
            else:
                haut_inconnu = True
            continue
        m = positif(minutes, f"{nom}.minutes")
        if incl:
            if m > total:
                raise ErreurSaisie(f"{nom} superieur au total d'heures.")
            bas -= m
        else:
            haut += m
    ecart_bas = None if bas_inconnu else bas / 60 * t - verse
    ecart_haut = None if haut_inconnu else haut / 60 * t - verse
    return ecart_bas, ecart_haut


@api("R-MENS-06")
def regularisation_annuelle(type_annee, salaires_mensualises_verses_centimes, taux_horaire_centimes,
                            heures_effectuees_minutes, composantes, nature_taux="brut"):
    """Regularisation previsionnelle annuelle en annee incomplete (R-MENS-06) :
    ecart = salaires dus pour les heures reellement effectuees - salaires
    mensualises verses sur 12 mois. Aucun paiement en cours de contrat.
    composantes : pour feries_chomes_payes, absences_remunerees,
    heures_complementaires : {"minutes": int ou None (inconnu), "incluses": bool
    (comptees dans heures_effectuees_minutes)}. Si l'une est non nulle ou
    inconnue, le resultat depend de A-06 : refus.
    Sortie : ecart_centimes (positif = en faveur de l'AM), paiement_centimes = 0."""
    type_annee_valide(type_annee)
    if type_annee == "complete":
        return resultat_ok(regularisation_annuelle.regles, {"applicable": False, "ecart_centimes": 0,
                                                            "paiement_centimes": 0})
    b, h = _ecart_regularisation(salaires_mensualises_verses_centimes, taux_horaire_centimes,
                                 heures_effectuees_minutes, composantes, nature_taux, ["R-MENS-06"])
    if b is None or h is None or b != h:
        raise NonGere("A-06", ["R-MENS-06"], details={
            "ecart_bas_exact_centimes": None if b is None else texte_fraction(b),
            "ecart_haut_exact_centimes": None if h is None else texte_fraction(h)})
    return resultat_ok(regularisation_annuelle.regles, {
        "applicable": True, "ecart_centimes": vers_centimes(b, "regularisation annuelle", ["R-MENS-06"]),
        "paiement_centimes": 0})


@api("R-FIN-11", "R-MENS-06")
def regularisation_finale(type_annee, ecarts_annuels_signes_centimes, salaires_mensualises_verses_centimes,
                          taux_horaire_centimes, heures_effectuees_minutes, composantes, nature_taux="brut"):
    """Regularisation definitive a la fin du contrat en annee incomplete
    (R-FIN-11) : somme des ecarts annuels deja etablis (signes) + ecart de la
    derniere periode. Versement a l'AM seulement si le solde lui est favorable ;
    sinon rien (consigne de la direction, A-07 : aucune source ne permet de
    recuperer un trop-percu).
    Les composantes suivent la meme regle que regularisation_annuelle ; le
    moteur conclut aussi quand le solde est defavorable a l'AM dans tous les cas.
    Sortie : solde_centimes (exact si connu), versement_centimes."""
    type_annee_valide(type_annee)
    if type_annee == "complete":
        return resultat_ok(regularisation_finale.regles, {"applicable": False, "versement_centimes": 0})
    prec = sum(entier(abs(e), "ecart") * (1 if e >= 0 else -1) for e in ecarts_annuels_signes_centimes)
    b, h = _ecart_regularisation(salaires_mensualises_verses_centimes, taux_horaire_centimes,
                                 heures_effectuees_minutes, composantes, nature_taux, ["R-FIN-11"])
    if h is not None and prec + h <= 0:
        return resultat_ok(regularisation_finale.regles, {"versement_centimes": 0,
                                                          "raison": "solde en faveur de l'employeur : rien n'est du par l'AM"})
    if b is None or h is None or b != h:
        raise NonGere("A-06", ["R-MENS-06", "R-FIN-11"], details={
            "ecart_bas_exact_centimes": None if b is None else texte_fraction(b),
            "ecart_haut_exact_centimes": None if h is None else texte_fraction(h)})
    solde = vers_centimes(prec + b, "regularisation definitive", ["R-FIN-11"])
    return resultat_ok(regularisation_finale.regles, {"solde_centimes": solde,
                                                      "versement_centimes": max(0, solde)})


_EXCLUSIONS_PRECARITE = ("poursuite_en_cdi", "jeune_vacances_scolaires", "refus_cdi_equivalent",
                         "rupture_anticipee_salarie", "faute_grave", "force_majeure")


@api("R-FIN-13")
def indemnite_precarite_cdd(remuneration_brute_totale_centimes, exclusion=None):
    """Indemnite de fin de CDD (R-FIN-13 corrigee, Code du travail L1243-8 et
    L1243-10) : 10 % de la remuneration totale brute versee. Non due dans les
    cas d'exclusion (poursuite en CDI, jeune en vacances scolaires, refus d'un
    CDI equivalent, rupture anticipee par le salarie, faute grave, force
    majeure). CDD saisonnier ou d'usage : refus EXCLU-SAISONNIER.
    Sortie : indemnite_centimes."""
    r = entier(remuneration_brute_totale_centimes, "remuneration_brute_totale_centimes")
    if exclusion in ("saisonnier", "usage"):
        raise NonGere("EXCLU-SAISONNIER", ["R-FIN-13"])
    if exclusion is not None:
        if exclusion not in _EXCLUSIONS_PRECARITE:
            raise ErreurSaisie(f"exclusion parmi {_EXCLUSIONS_PRECARITE}.")
        return resultat_ok(indemnite_precarite_cdd.regles, {"indemnite_centimes": 0, "raison": exclusion})
    return resultat_ok(indemnite_precarite_cdd.regles,
                       {"indemnite_centimes": vers_centimes(Fraction(r, 10), "indemnite de precarite", ["R-FIN-13"])})


@api("R-FIN-15", "R-FIN-14")
def solde_de_tout_compte(elements):
    """Sommes dues a la fin (R-FIN-15). elements : liste de sorties du moteur ou
    d'entiers, avec un libelle : [(libelle, valeur, nature)], nature
    « salaire » (soumis a cotisations) ou « indemnite_rupture » (exoneree,
    declaree a part). Un element non gere rend le solde non gere.
    Sortie : total_salaires_bruts_centimes, indemnite_rupture_centimes."""
    sal = 0
    rup = 0
    for libelle, valeur, nature in elements:
        if isinstance(valeur, dict):
            if valeur.get("statut") not in ("ok", "provisoire"):
                raise NonGere(valeur.get("code", "ARR-01"), ["R-FIN-15"], precision=f"Element « {libelle} » non gere.")
            res = valeur["resultat"]
            cles = [k for k in res if k.endswith("_centimes") and isinstance(res[k], int)]
            if len(cles) != 1:
                raise ErreurSaisie(f"Element « {libelle} » : montant ambigu dans la sortie.")
            valeur = res[cles[0]]
        v = entier(valeur, libelle)
        if nature == "salaire":
            sal += v
        elif nature == "indemnite_rupture":
            rup += v
        else:
            raise ErreurSaisie("nature : « salaire » ou « indemnite_rupture ».")
    return resultat_ok(solde_de_tout_compte.regles, {"total_salaires_bruts_centimes": sal,
                                                     "indemnite_rupture_centimes": rup})


@api("R-FIN-03", "VERIF1-CPP")
def date_fin_preavis_avec_conges(date_premiere_presentation, preavis, periodes_conges_payes=(), accord_ecrit_cumul=None):
    """verif-1 (T-107, cas 1) : CCN 64.1 (KALIARTI000050724233, avenant n° 6) : le preavis ne peut etre suspendu sauf
    en cas [...] « de prise de conges payes. Neanmoins, et par exception, les periodes de preavis et de conges payes
    peuvent se cumuler en cas d'accord ecrit et signe des parties » ; fin = fin du preavis « prorogé, le cas echeant,
    de la duree correspondant » aux suspensions. Conges payes pris dans le preavis (periodes_conges_payes : liste de
    (du, au), jours calendaires) : sans accord ecrit, la fin recule de leur duree ; avec accord, pas de report.
    Accord inconnu (None) alors que des conges tombent dans le preavis : refus CPP-ACCORD-INCONNU.
    Sortie : date_fin."""
    fin = _fin_preavis(date_premiere_presentation, preavis)
    jours = 0
    for du, au in periodes_conges_payes:
        if not (isinstance(du, date) and isinstance(au, date)) or au < du:
            raise ErreurSaisie("periodes_conges_payes : (du, au) dans l'ordre.")
        a, b = max(du, date_premiere_presentation), min(au, fin)
        if a <= b:
            jours += (b - a).days + 1
    if jours and accord_ecrit_cumul is None:
        raise NonGere("CPP-ACCORD-INCONNU", ["VERIF1-CPP"], precision="Conges pendant le preavis : accord ecrit de cumul ?")
    if jours and not accord_ecrit_cumul:
        fin = fin + timedelta(days=jours)
    return resultat_ok(["R-FIN-03", "VERIF1-CPP"], {"date_fin": fin, "jours_de_report": 0 if accord_ecrit_cumul else jours})


@api("VERIF1-DSA")
def indemnite_preavis_non_fait_am(net_preavis_non_fait_centimes, grossesse_medicalement_constatee):
    """verif-1 (T-107, cas 2) : AM qui part sans faire son preavis, sans l'accord des parents. CCN 64.2 al. 2 :
    indemnite « egale au montant de la remuneration nette correspondant a la duree non executee du preavis », au profit
    du particulier employeur. C. trav. L1225-34 (CASF L423-2, 3°) : « La salariee en etat de grossesse medicalement
    constate peut rompre son contrat de travail sans preavis et sans devoir d'indemnite de rupture » : 0.
    service-public F33164 (verifiee le 21/07/2026) : l'employeur « doit alors saisir le conseil de prud'hommes » : la
    somme est demandable, jamais retenue d'office sur le salaire. Sortie : indemnite_demandable_centimes."""
    if grossesse_medicalement_constatee is None:
        raise NonGere("DSA-GROSSESSE-INCONNUE", ["VERIF1-DSA"])
    v = 0 if grossesse_medicalement_constatee else entier(net_preavis_non_fait_centimes, "net_preavis_non_fait_centimes")
    return resultat_ok(["VERIF1-DSA"], {"indemnite_demandable_centimes": v, "retenue_sur_salaire_possible": False})
