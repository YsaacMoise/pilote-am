"""Fin de contrat : preavis, indemnite compensatrice de preavis, indemnite de
rupture, ICCP, regularisation d'annee incomplete, indemnite de precarite,
solde de tout compte (domaine 9 et R-MENS-06 de regles-v0)."""

from datetime import date
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
    "am": {"moins_de_trois_mois": {"jours": 8}, "trois_mois_a_un_an": "PREAVIS-DEMISSION-3-12",
           "un_an_et_plus": {"mois": 1}},
}


@api("R-FIN-02", "R-FIN-03", "R-ESS-03", "R-FIN-08", "R-FIN-07")
def duree_preavis(auteur, date_debut_accueil, date_envoi, date_premiere_presentation, motif="normal"):
    """Duree du preavis (R-FIN-02 corrigee par T-027, CCN art. 120).
    auteur : « employeur » (retrait de l'enfant) ou « am » (demission).
    Retrait : 8 jours calendaires (< 3 mois), 15 jours (3 mois a < 1 an), 1 mois.
    Demission : 8 jours calendaires (< 3 mois) ; 3 mois a < 1 an : refus
    PREAVIS-DEMISSION-3-12 (CASF L423-26 contre CCN 120) ; 1 mois.
    Pas de preavis : periode d'essai, faute grave ou lourde, agrement.
    Deces de l'enfant : duree du retrait, a la date du deces (R-FIN-07).
    Anciennete appreciee « au jour de la date d'envoi de la lettre recommandee ou
    de sa date de remise en main propre » (CCN art. 120, dernier alinea) ; la date
    de premiere presentation fixe seulement le point de depart (non utilisee ici).
    La date de fin n'est pas calculee (PREAVIS-DATE-FIN).
    Sortie : preavis (None, {"jours": n} ou {"mois": 1})."""
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
    return resultat_ok(duree_preavis.regles, {"preavis": duree, "anciennete": c_envoi,
                                              "note": "Date de fin du preavis non calculee (R-FIN-03, methode non ecrite)."})


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
       "sommes_assiette_ambigues": {nom: centimes}}.
    Periode dont une partie des jours est deja payee : refus A-50 (repartition
    non ecrite). L'ICCP calculee pour la periode precedente et les sommes
    ambigues (regularisation, etc.) sont testees avec et sans inclusion dans
    l'assiette du dixieme ; si cela change le resultat : refus A-50 (SUS-04).
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
            amb = {}
            for nom, montant in (p.get("sommes_assiette_ambigues") or {}).items():
                amb[nom] = (montant, "A-50")
            if precedente:
                amb["iccp_periode_precedente"] = (precedente, "A-50")
            val, methode, _, _ = _indemnite_cp(
                a, heures_hebdo_minutes, taux_horaire_centimes, p.get("salaires_bruts_periode_centimes"),
                p.get("icp_versee_pendant_periode_centimes", 0), p.get("icp_annee_precedente_centimes", 0),
                p.get("heures_conge_minutes"), p.get("jours_supplementaires", 0), amb, regles + ["R-CP-06"])
            v = vers_centimes(val, f"ICCP periode {i + 1}", regles)
        total += v
        detail.append(v)
        precedente = v
    return resultat_ok(iccp.regles, {"iccp_centimes": total, "detail_centimes": detail})


@api("R-FIN-06", "R-FIN-07", "R-FIN-08", "R-ESS-03")
def indemnite_rupture(motif, auteur, date_debut_accueil, date_reference, salaires_bruts_centimes,
                      iccp_centimes=0, icp_centimes=0, indemnite_preavis_centimes=0, regularisation_centimes=0):
    """Indemnite de rupture (R-FIN-06, CCN art. 121.1) : due en cas de retrait
    de l'enfant (auteur « employeur ») apres au moins 9 mois d'accueil ; non due
    en cas de demission, d'essai, de faute grave ou lourde, d'agrement.
    Montant = 1/80 des salaires bruts du contrat, hors indemnites d'entretien,
    de repas et kilometriques. L'inclusion de l'ICCP, des CP payes, du preavis et
    de la regularisation n'est pas tranchee (A-45) : si l'une de ces sommes est
    non nulle, refus A-45.
    Deces de l'enfant (R-FIN-07) : meme calcul, du quelle que soit l'anciennete
    (T-035a : CCN art. 119.4.2, l'indemnite est due et seul son « montant » suit
    l'art. 121-1 ; service-public F16842 : « cette condition d'anciennete est
    supprimee et l'indemnite est due »). A-47 levee.
    date_reference : date d'envoi de la lettre (ou du deces).
    Sortie : indemnite_centimes (non soumise a cotisations)."""
    regles = ["R-FIN-06"]
    _motif_exclu(motif, regles)
    if not (isinstance(date_debut_accueil, date) and isinstance(date_reference, date)):
        raise ErreurSaisie("Dates attendues.")
    verifier_date_ccn(date_reference, regles)
    if motif in ("faute_grave", "faute_lourde", "agrement", "essai") or (motif == "normal" and auteur == "am"):
        return resultat_ok(indemnite_rupture.regles, {"indemnite_centimes": 0, "raison": "non due"})
    if auteur not in ("employeur", "am"):
        raise ErreurSaisie("auteur : « employeur » ou « am ».")
    if motif == "deces_enfant":
        regles = ["R-FIN-07"]
        neuf_mois = True  # condition de 9 mois sans objet (CCN 119.4.2 ; F16842)
    else:
        neuf_mois = anciennete_atteinte(date_debut_accueil, date_reference, 9, regles)
    if not neuf_mois:
        return resultat_ok(indemnite_rupture.regles, {"indemnite_centimes": 0, "raison": "moins de 9 mois d'accueil"})
    base = entier(salaires_bruts_centimes, "salaires_bruts_centimes")
    autres = {n: entier(v, n) for n, v in (("iccp_centimes", iccp_centimes), ("icp_centimes", icp_centimes),
                                            ("indemnite_preavis_centimes", indemnite_preavis_centimes),
                                            ("regularisation_centimes", regularisation_centimes))}
    if any(autres.values()):
        raise NonGere("A-45", regles, details={"sommes_ambigues_centimes": {k: v for k, v in autres.items() if v}})
    return resultat_ok(indemnite_rupture.regles,
                       {"indemnite_centimes": vers_centimes(Fraction(base, 80), "indemnite de rupture", regles)})


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
