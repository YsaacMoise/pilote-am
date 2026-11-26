"""T-119 : conges de depart, quand Arvela commence le suivi d'un contrat deja en cours.

Specification unique : regles/t119-conges-depart.md (depot calculateur-arvela), regle de la direction du
26/11/2026. Les sections citees (§) sont celles de ce fichier.

Le calcul d'acquisition n'est pas recode : il est demande a conges.acquisition_cp_periode (T-103 C10, C10 bis, C11 ;
T-113 : decompte le plus favorable entre mensuel, semaines entieres / 4 et jours d'accueil / (4 x jours par semaine))
et a conges.jours_enfants_a_charge (R-CP-03).
"""

from datetime import date, timedelta
from fractions import Fraction
import math

from .commun import NonGere, ErreurSaisie, api, resultat_ok, entier, texte_fraction, verifier_date_ccn, type_annee_valide
from .calendrier import jours_feries
from .conges import acquisition_cp_periode, jours_enfants_a_charge

REGLES_T119 = ("T119-3.1", "T119-3.2", "T119-3.3", "T119-3.4", "T119-3.4-PLAFOND", "T119-3.5")


def _relancer(r):
    """Sortie d'une fonction publique de B : resultat si ok, sinon le meme refus ou la meme erreur."""
    if r["statut"] in ("ok", "provisoire"):
        return r["resultat"]
    if r["statut"] == "non_gere":
        raise NonGere(r["code"], r.get("regles", ()), precision=r.get("precision"), details=r.get("details"))
    raise ErreurSaisie(r.get("message", "erreur de saisie"), r.get("regles", ()))


def _premier_juin_avant(t):
    """§ 1 : y = annee du 1er juin qui precede ou egale T."""
    return t.year if t >= date(t.year, 6, 1) else t.year - 1


def _lire_contrat(contrat):
    if not isinstance(contrat, dict):
        raise ErreurSaisie("contrat : dictionnaire attendu (debut, type_annee, planning).")
    debut = contrat.get("debut")
    if not isinstance(debut, date):
        raise ErreurSaisie("contrat.debut : date attendue.")
    type_annee = type_annee_valide(contrat.get("type_annee"))
    planning = contrat.get("planning")
    if not isinstance(planning, dict) or not planning:
        raise ErreurSaisie("contrat.planning : {0 = lundi ... 6 = dimanche : minutes} attendu.")
    jours = set()
    for j, mn in planning.items():
        if not isinstance(j, int) or not 0 <= j <= 6:
            raise ErreurSaisie("contrat.planning : cles de 0 (lundi) a 6 (dimanche).")
        if entier(mn, "contrat.planning (minutes)") > 0:
            jours.add(j)
    if not jours:
        raise ErreurSaisie("contrat.planning : aucun jour avec des heures.")
    # § 5 : rien n'est devine. Avenants, planning variable, CDD : cas que ce calcul ne gere pas (refus propre).
    if contrat.get("avenants"):
        raise NonGere("T119-NON-GERE", ["T119-3.5"], precision="Contrat avec avenants : la periode change de contrat.")
    if contrat.get("planning_variable"):
        raise NonGere("T119-NON-GERE", ["T119-3.5"], precision="Planning variable : jours d'accueil prevus inconnus.")
    if contrat.get("cdd"):
        raise NonGere("T119-NON-GERE", ["T119-3.5"], precision="CDD : non couvert par la regle T-119.")
    sans_accueil = contrat.get("semaines_sans_accueil")
    if type_annee == "incomplete":
        # § 5 : annee incomplete sans toutes les semaines sans accueil au contrat : impossible a calculer.
        if not sans_accueil:
            raise NonGere("T119-SEMAINES-SANS-ACCUEIL", ["T119-3.5"])
    elif sans_accueil:
        raise ErreurSaisie("Semaines sans accueil impossibles en annee complete.")
    lundis = set(sans_accueil or ())
    if any(not isinstance(x, date) or x.weekday() != 0 for x in lundis):
        raise ErreurSaisie("contrat.semaines_sans_accueil : lundis (dates).")
    cp_am = contrat.get("semaines_cp_am")
    cp_am = None if cp_am is None else set(cp_am)
    return debut, type_annee, jours, lundis, cp_am, contrat.get("region", "metropole")


@api(*REGLES_T119)
def conges_de_depart(contrat, suivi_depuis, pris_depuis_juin=0, absence_prec=0, absence_cours=0,
                     enfants_a_charge=0, age_am_au_30_avril=None):
    """T-119 (§ 3) : soldes de conges au debut du suivi d'un contrat deja en cours.

    contrat : {debut (date S), type_annee, planning {0 = lundi : minutes}, semaines_sans_accueil (lundis, annee
    incomplete), semaines_cp_am (lundis, C11), region}. suivi_depuis : date T (T > S).
    pris_depuis_juin : P, jours ouvrables de CP pris du 1er juin y a T-1 (§ 2). absence_prec, absence_cours : Aprec et
    Acours, jours d'accueil prevus non travailles et non payes (§ 2). enfants_a_charge, age_am_au_30_avril : R-CP-03.

    Sortie :
    - droits_prec (D, § 3.1) : jours acquis sur la periode y-1, du max(S, 1er juin y-1) au 31 mai y, arrondis a
      l'entier superieur, plafonnes a 30, jours pour enfants compris ; 0 si S >= 1er juin y.
    - cp_restants (§ 3.2) : max(0, D - P).
    - cp_en_cours (§ 3.3) : jours acquis du max(S, 1er juin y) a T-1, sans arrondi (fraction exacte) ;
      cp_en_cours_centiemes : arrondi au centieme le plus proche (demi vers le haut), pour l'enregistrement.
    - absences_prec, absences_cours : dates ou les absences ont ete placees (§ 3.4).
    - § 3.4, « Plafond » : avec une absence, D et cp_en_cours = le plus petit des calculs avec et sans l'absence.
    """
    regles = list(REGLES_T119)
    S, type_annee, jts, lundis, cp_am, region = _lire_contrat(contrat)
    T = suivi_depuis
    if not isinstance(T, date):
        raise ErreurSaisie("suivi_depuis : date attendue.")
    if T <= S:
        raise ErreurSaisie("suivi_depuis doit etre apres le debut du contrat (§ 1 : T > S).")
    P = entier(pris_depuis_juin, "pris_depuis_juin")
    a_prec = entier(absence_prec, "absence_prec")
    a_cours = entier(absence_cours, "absence_cours")
    n_enf = entier(enfants_a_charge, "enfants_a_charge")
    if n_enf > 0 and age_am_au_30_avril is None:
        raise ErreurSaisie("age_am_au_30_avril : obligatoire s'il y a des enfants a charge (R-CP-03).")
    age = 35 if age_am_au_30_avril is None else age_am_au_30_avril  # sans effet quand n_enf = 0 (R-CP-03)

    y = _premier_juin_avant(T)

    def prevu(d):
        """§ 3.4 : jour d'accueil prevu : heures au planning, hors jour ferie, hors semaine sans accueil."""
        if d.weekday() not in jts or d in jours_feries(d.year, region):
            return False
        return (d - timedelta(days=d.weekday())) not in lundis

    def placer(a, b, n, nom):
        """§ 3.4 : les n jours d'absence sur les premiers jours d'accueil prevus de [a, b]."""
        out = []
        d = a
        while len(out) < n and d <= b:
            if prevu(d):
                out.append(d)
            d += timedelta(days=1)
        if len(out) < n:
            raise ErreurSaisie(f"{nom} : {n} jours d'absence pour {len(out)} jours d'accueil prevus dans la fenetre.")
        return out

    def acquis(a, b, absences, droits):
        """Calcul d'acquisition de B (conges.acquisition_cp_periode), absences en conge sans solde non assimile
        (§ 3.4, L3141-5)."""
        verifier_date_ccn(a, regles)
        sa = sorted(x for x in lundis if x + timedelta(days=6) >= a and x <= b)
        cpam = None if cp_am is None else sorted(x for x in cp_am if x in sa)
        kw = {}
        if cpam:
            kw["droits_cp_disponibles"] = droits()
        return _relancer(acquisition_cp_periode(type_annee, a, b, jours_non_assimiles=absences,
                                                semaines_sans_accueil=sa, semaines_cp_am=cpam,
                                                jours_travail_semaine=sorted(jts), **kw))

    def droits_periode(annee, absences=()):
        """Jours acquis sur la periode [1er juin annee, 31 mai annee+1] du contrat, arrondis, plafonnes, enfants
        compris (§ 3, regles deja en place). Sert a D et aux droits disponibles de C11 (periode precedente)."""
        a = max(S, date(annee, 6, 1))
        b = date(annee + 1, 5, 31)
        if a > b:
            return 0, 0, None
        r = acquis(a, b, list(absences), lambda: droits_periode(annee - 1)[0])
        e = _relancer(jours_enfants_a_charge(r["jours_acquis"], age, n_enf, periode_atteint_31_mai=True))
        return e["total"], r["jours_acquis"], r["decompte"]

    # § 3.1 : D, droits de la periode precedente.
    abs_prec = []
    if S < date(y, 6, 1):
        abs_prec = placer(max(S, date(y - 1, 6, 1)), date(y, 5, 31), a_prec, "absence_prec")
        D, d_hors_enfants, det_prec = droits_periode(y - 1, abs_prec)
        if abs_prec:
            # § 3.4, « Plafond » (direction, 26/11/2026) : une absence ne donne jamais plus de jours qu'aucune
            # absence ; D = le plus petit des deux calculs (D final : arrondi, plafond et enfants compris).
            D0, d0_hors_enfants, _ = droits_periode(y - 1)
            if D0 < D:
                D, d_hors_enfants = D0, d0_hors_enfants
    else:
        if a_prec:
            raise ErreurSaisie("absence_prec : pas de periode precedente (contrat commence apres le 1er juin y).")
        D, d_hors_enfants, det_prec = 0, 0, None

    # § 3.2 : reste a prendre.
    restants = max(0, D - P)

    # § 3.3 : acquis du max(S, 1er juin y) a T-1, sans arrondi.
    a, b = max(S, date(y, 6, 1)), T - timedelta(days=1)
    abs_cours = []
    if a > b:
        if a_cours:
            raise ErreurSaisie("absence_cours : aucun jour entre le 1er juin y et le debut du suivi.")
        en_cours, det_cours = Fraction(0), None
    else:
        abs_cours = placer(a, b, a_cours, "absence_cours")
        r = acquis(a, b, abs_cours, lambda: D)
        en_cours = min(Fraction(30), Fraction(r["decompte"]["part_travail_exacte"]))
        det_cours = r["decompte"]
        if abs_cours:
            # § 3.4, « Plafond » : cp_en_cours = le plus petit des calculs avec et sans l'absence (valeurs exactes).
            r0 = acquis(a, b, [], lambda: D)
            en_cours = min(en_cours, Fraction(30), Fraction(r0["decompte"]["part_travail_exacte"]))
    centiemes = math.floor(en_cours * 100 + Fraction(1, 2))

    return resultat_ok(regles, {
        "periode_reference": y,
        "droits_prec": D,
        "droits_prec_hors_enfants": d_hors_enfants,
        "pris_depuis_juin": P,
        "cp_restants": restants,
        "cp_en_cours": texte_fraction(en_cours),
        "cp_en_cours_centiemes": centiemes,
        "absences_prec": [x.isoformat() for x in abs_prec],
        "absences_cours": [x.isoformat() for x in abs_cours],
        "decompte_prec": det_prec,
        "decompte_cours": det_cours,
    })
