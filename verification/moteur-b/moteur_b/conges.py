"""Conges payes : acquisition, jours supplementaires, decompte, indemnite,
paiement (domaine 5 de regles-v0)."""

from datetime import date, timedelta
from fractions import Fraction
from itertools import product
import math

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, positif, entier,
    vers_centimes, texte_fraction, type_annee_valide,
)
from .calendrier import jours_feries

DATE_LOI_MALADIE_CP = date(2024, 4, 24)  # R-CP-02 : L3141-5-1 en vigueur le 24/04/2024


def _ceil(x):
    return math.ceil(Fraction(x))


def _acquisition(type_annee, periode_complete, mois, semaines, jours, jours_par_semaine,
                 mois_arret_maladie, semaines_arret_maladie, accident_travail, date_fin_periode, report):
    type_annee_valide(type_annee)
    regles = ["R-CP-01", "R-CP-02"]
    code_methode = "SUS-11" if type_annee == "incomplete" else "A-23"
    if accident_travail:
        raise NonGere("EXCLU-AT", regles)
    if report:
        raise NonGere("CP-REPORT", regles)
    ma = positif(mois_arret_maladie, "mois_arret_maladie")
    sa = positif(semaines_arret_maladie, "semaines_arret_maladie")
    maladie = ma > 0 or sa > 0
    if periode_complete:
        # R-CP-01 : une periode de reference complete donne 30 jours ouvrables.
        if type_annee != "complete" or maladie:
            raise ErreurSaisie("periode_complete : seulement en annee complete, sans arret maladie.", regles)
        return 30, {"periode_complete": 30}
    if maladie:
        if ma == 0 or sa == 0:
            raise NonGere(code_methode, regles, precision="Arret maladie a fournir en mois et en semaines.")
        if not isinstance(date_fin_periode, date):
            raise ErreurSaisie("date_fin_periode obligatoire en cas d'arret maladie.", ["R-CP-02"])
        if date_fin_periode < DATE_LOI_MALADIE_CP:
            raise NonGere("R-CP-02-DATE", ["R-CP-02"])
    if mois is None or semaines is None:
        raise NonGere(code_methode, regles,
                      precision="Le moteur exige la duree en mois et en semaines pour verifier que les methodes concordent.")
    m = positif(mois, "mois")
    s = positif(semaines, "semaines")
    # Candidats : (part travail exacte, part maladie exacte) par methode.
    deux_et_demi = Fraction(5, 2)
    cand = {
        "mois": (deux_et_demi * m, min(Fraction(2) * ma, Fraction(24))),
        "semaines": (s / 4 * deux_et_demi, min(sa / 4 * 2, Fraction(24))),
    }
    if jours is not None:
        jps = positif(jours_par_semaine, "jours_par_semaine")
        if jps == 0:
            raise ErreurSaisie("jours_par_semaine nul.")
        j = positif(jours, "jours")
        # Formule Urssaf citee par R-CP-01 (cas limites) : jours x 2,5 / (4 x jours par semaine).
        cand["jours"] = (j * deux_et_demi / (4 * jps), min(sa / 4 * 2, Fraction(24)))
    resultats = {}
    for nom, (trav, mal) in cand.items():
        a = _ceil(trav) + _ceil(mal)
        b = _ceil(trav + mal)
        if a != b:
            raise NonGere("CP-ARRONDI-PARTS", regles, details={"methode": nom})
        resultats[nom] = min(30, a)
    if len(set(resultats.values())) != 1:
        raise NonGere(code_methode, regles + ["R-CP-01"], details={"resultats_par_methode": resultats})
    return next(iter(resultats.values())), resultats


@api("R-CP-01", "R-CP-02")
def acquisition_cp(type_annee, periode_complete=False, mois=None, semaines=None, jours=None,
                   jours_par_semaine=None, mois_arret_maladie=0, semaines_arret_maladie=0,
                   accident_travail=False, date_fin_periode=None, report=False):
    """Jours ouvrables de CP acquis sur une periode de reference (R-CP-01, R-CP-02).
    - periode_complete=True (annee complete, sans maladie) : 30 jours.
    - Sinon : mois ET semaines de travail effectif ou assimile obligatoires,
      jours (avec jours_par_semaine) facultatifs. Chaque methode est calculee
      (2,5 jours par mois ; par 4 semaines ; par 4 x jours par semaine), arrondie
      a l'entier superieur (L3141-7), plafonnee a 30. Si les methodes ne
      donnent pas le meme resultat : refus A-23 (annee complete) ou SUS-11
      (annee incomplete).
    - Maladie non professionnelle (loi, A-24 levee) : 2 jours par mois d'arret
      ou par 4 semaines, plafond 24 ; mois et semaines d'arret obligatoires.
    Sortie : jours_acquis, resultats_par_methode."""
    j, detail = _acquisition(type_annee, periode_complete, mois, semaines, jours, jours_par_semaine,
                             mois_arret_maladie, semaines_arret_maladie, accident_travail, date_fin_periode, report)
    return resultat_ok(acquisition_cp.regles, {"jours_acquis": j, "resultats_par_methode": detail})


def _compte_1980(a, b, dans):
    """Cass. soc. 10/01/1980 : mois complets, puis semaines restantes, puis jours restants (lundi a samedi).
    dans(d) : vrai si le jour d compte (travail effectif ou assimile ; ou arret maladie pour la part maladie).
    Mois complet : mois civil entier dans [a, b] dont tous les jours comptent. Semaine : lundi a dimanche, hors des
    mois complets, dont tous les jours comptent et sont dans [a, b]. Jour : lundi a samedi restant qui compte.
    Renvoie (mois, semaines, jours)."""
    import calendar
    pris = set()
    mois = 0
    y, mth = a.year, a.month
    while date(y, mth, 1) <= b:
        p = date(y, mth, 1)
        q = date(y, mth, calendar.monthrange(y, mth)[1])
        if p >= a and q <= b and all(dans(p + timedelta(days=i)) for i in range((q - p).days + 1)):
            mois += 1
            pris.update(p + timedelta(days=i) for i in range((q - p).days + 1))
        y, mth = (y + 1, 1) if mth == 12 else (y, mth + 1)
    semaines = 0
    d = a - timedelta(days=a.weekday())
    while d <= b:
        sem = [d + timedelta(days=i) for i in range(7)]
        if all(a <= x <= b and x not in pris and dans(x) for x in sem):
            semaines += 1
            pris.update(sem)
        d += timedelta(days=7)
    jours = sum(1 for i in range((b - a).days + 1)
                for x in [a + timedelta(days=i)] if x not in pris and x.weekday() <= 5 and dans(x))
    return mois, semaines, jours


@api("R-CP-01", "R-CP-02", "T103-C10", "T103-C11")
def acquisition_cp_periode(type_annee, debut, fin, jours_non_assimiles=(), jours_arret_maladie=(),
                           semaines_sans_accueil=(), semaines_cp_am=None, accident_travail=False, report=False,
                           droits_cp_disponibles=None, jours_travail_semaine=None):
    """T-103 (C10, C11, A2) : jours de CP acquis sur une periode de reference [debut, fin] (bornes de la periode,
    du contrat inclus : CCN 48.1.1.1).
    Cass. soc. 10/01/1980, n° 78-41.140, publie (JURITEXT000007004681) : « retenir d'abord le nombre des mois
    complets de travail, puis celui des semaines supplementaires groupees par quatre et enfin celui des jours
    restants groupes par vingt-quatre ». CCN 48.1.1.2 (KALIARTI000043942122) : 2,5 jours « a l'issue de chaque mois
    de travail ou de chaque periode equivalente », calcul « pro rata temporis, en cas d'embauche, de depart ou
    d'absence », nombre decimal « arrondi a l'entier superieur ». Les restes (semaines au-dela des groupes de 4,
    jours au-dela des groupes de 24) comptent au prorata (tableau T-103, apres la porte-verite) :
    part travail = 2,5 x (mois + semaines / 4 + jours / 24), arrondie a l'entier superieur.
    - jours_non_assimiles : dates sans travail effectif ni assimile (conge sans solde, enfant malade de l'AM...).
    - C11 : annee incomplete : les semaines sans accueil (semaines_sans_accueil, lundis) ne sont pas du travail
      effectif : leurs jours ne comptent pas. Reserve de B (voir le rapport T-103) : CCN 97.1 definit l'accueil
      « 46 semaines ou moins [...] hors conges payes du salarie » ; les semaines ou l'AM prend ses conges payes sont
      donc parmi les semaines sans accueil, et C. trav. L3141-5, 1° (« Les periodes de conge paye ») et CCN 48.1.1.3
      (« Les periodes de conges payes sont assimilees a du temps de travail effectif ») les assimilent a du travail.
      semaines_cp_am : lundis des semaines sans accueil qui sont des conges payes de l'AM (comptent). Absent alors
      que la periode contient des semaines sans accueil : refus C11-SEMAINES-CP-AM.
    - Maladie non professionnelle (loi, A-24 levee ; depuis le 24/04/2024) : jours_arret_maladie ; meme methode
      avec 2 jours par mois, plafond 24 (comme acquisition_cp).
    Plafond total : 30. Sortie : jours_acquis, decompte (mois, semaines, jours ; maladie).
    Verification independante du 25/11/2026 :
    - B-2 (C11 bis) : L3141-5, 1° vise « les periodes de conge paye ». Une semaine sans accueil n'est un conge paye
      que dans la limite des droits acquis : droits_cp_disponibles (jours ouvrables acquis avant la periode et
      utilisables pendant celle-ci). Les jours ouvrables (lundi a samedi) des semaines_cp_am, dans l'ordre, comptent
      tant qu'il reste des droits ; le dimanche suit le samedi. Sans droits_cp_disponibles : refus C11-DROITS-CP-AM.
    - B-1 (C10 bis) : service-public F18260 (verifie le 20/02/2026) : « Si le salarie est absent durant la periode
      de reference, le decompte de ses conges payes s'effectue [...] selon la regle qui lui est la plus favorable » :
      mensuel (decompte de 1980 ci-dessus), hebdomadaire (2,5 jours par 4 semaines de travail effectif : semaines
      civiles entieres qui comptent) ou journalier (2,5 jours par 24 jours, 20 jours sur 5 jours par semaine, 22 sur
      5,5 ; jours de travail prevus qui comptent ; jours_travail_semaine = jours du planning, 0 = lundi). C. trav.
      L3141-4 (4 semaines ou 24 jours equivalent a un mois). S'applique quand la periode contient une absence non
      assimilee, un arret maladie ou une semaine sans accueil non comptee ; sinon, decompte mensuel."""
    type_annee_valide(type_annee)
    regles = ["R-CP-01", "R-CP-02"]
    if accident_travail:
        raise NonGere("EXCLU-AT", regles)
    if report:
        raise NonGere("CP-REPORT", regles)
    if not (isinstance(debut, date) and isinstance(fin, date)) or fin < debut:
        raise ErreurSaisie("debut et fin : dates, dans l'ordre.")
    na = set(jours_non_assimiles or ())
    mal = set(jours_arret_maladie or ())
    lundis = set(semaines_sans_accueil or ())
    if type_annee == "complete" and lundis:
        raise ErreurSaisie("Semaines sans accueil impossibles en annee complete.")
    if mal and fin < DATE_LOI_MALADIE_CP:
        raise NonGere("R-CP-02-DATE", ["R-CP-02"])

    cp_am = None if semaines_cp_am is None else set(semaines_cp_am)
    if lundis and cp_am is None:
        raise NonGere("C11-SEMAINES-CP-AM", regles, precision=(
            "Semaines sans accueil dans la periode : lesquelles sont des conges payes de l'AM (assimilees a du travail, "
            "L3141-5, CCN 48.1.1.3) ?"))
    if cp_am and not cp_am <= lundis:
        raise ErreurSaisie("semaines_cp_am : lundis parmi les semaines sans accueil.")

    jours_cp_am = set()
    if cp_am:
        if droits_cp_disponibles is None:
            raise NonGere("C11-DROITS-CP-AM", regles, precision=(
                "Droits a conges acquis avant la periode : necessaires pour savoir quelles semaines sans accueil sont "
                "des conges payes (L3141-5, 1°)."))
        reste = entier(droits_cp_disponibles, "droits_cp_disponibles")
        for lu in sorted(cp_am):
            for i in range(6):
                if reste > 0:
                    jours_cp_am.add(lu + timedelta(days=i))
                    reste -= 1
            if lu + timedelta(days=5) in jours_cp_am:
                jours_cp_am.add(lu + timedelta(days=6))

    def sans_accueil(d):
        lu = d - timedelta(days=d.weekday())
        return lu in lundis and d not in jours_cp_am

    def compte(d):
        return d not in na and d not in mal and not sans_accueil(d)

    m, s, j = _compte_1980(debut, fin, compte)
    trav = Fraction(5, 2) * (m + Fraction(s, 4) + Fraction(j, 24))
    methodes = {"mensuel": trav}
    if na or mal or any(sans_accueil(d) for d in (debut + timedelta(days=i) for i in range((fin - debut).days + 1))):
        # B-1 : decomptes hebdomadaire et journalier, le plus favorable l'emporte (F18260).
        sem = 0
        lu = debut - timedelta(days=debut.weekday())
        while lu <= fin:
            jours7 = [lu + timedelta(days=i) for i in range(7)]
            if all(debut <= x <= fin and compte(x) for x in jours7):
                sem += 1
            lu += timedelta(days=7)
        methodes["hebdomadaire"] = Fraction(5, 2) * Fraction(sem, 4)
        if jours_travail_semaine is not None:
            jts = set(jours_travail_semaine)
            diviseur = {5: 20, 6: 24}.get(len(jts))
            if diviseur is not None:
                nj = sum(1 for i in range((fin - debut).days + 1)
                         for x in [debut + timedelta(days=i)] if x.weekday() in jts and compte(x))
                methodes["journalier"] = Fraction(5, 2) * Fraction(nj, diviseur)
        trav = max(methodes.values())
    mm, sm, jm = _compte_1980(debut, fin, lambda d: d in mal) if mal else (0, 0, 0)
    maladie = min(Fraction(2) * (mm + Fraction(sm, 4) + Fraction(jm, 24)), Fraction(24))
    a, b = _ceil(trav) + _ceil(maladie), _ceil(trav + maladie)
    if a != b:
        raise NonGere("CP-ARRONDI-PARTS", regles)
    return resultat_ok(acquisition_cp_periode.regles, {
        "jours_acquis": min(30, a),
        "decompte": {"mois": m, "semaines": s, "jours": j, "part_travail_exacte": texte_fraction(trav),
                     "methodes": {k: texte_fraction(v) for k, v in methodes.items()},
                     "maladie": {"mois": mm, "semaines": sm, "jours": jm}, "part_maladie_exacte": texte_fraction(maladie)}})


@api("R-CP-03")
def jours_enfants_a_charge(jours_acquis, age_am_au_30_avril, nombre_enfants_a_charge, periode_atteint_31_mai=True):
    """Jours supplementaires pour enfants a charge (R-CP-03, CCN art. 48.1.3.3,
    Code du travail L3141-8). Enfant a charge : vit au foyer et a moins de 15 ans
    au 30 avril de l'annee en cours, ou est en situation de handicap (a verifier
    par l'appelant). Acquis au 31 mai : 0 si la periode s'arrete avant.
    Sortie : jours_supplementaires, total."""
    ja = entier(jours_acquis, "jours_acquis")
    age = entier(age_am_au_30_avril, "age_am_au_30_avril", 14)
    n = entier(nombre_enfants_a_charge, "nombre_enfants_a_charge")
    if not periode_atteint_31_mai or n == 0:
        sup = 0
    elif age >= 21:
        sup = min(2 * n, max(0, 30 - ja))
    else:
        sup = (1 if ja <= 6 else 2) * n
    return resultat_ok(jours_enfants_a_charge.regles, {"jours_supplementaires": sup, "total": ja + sup})


@api("R-CP-04")
def jours_fractionnement(droits_acquis, jours_conge_principal_pris_du_1er_mai_au_31_octobre,
                         renonciation_ecrite=False):
    """Jours de fractionnement (R-CP-04, CCN art. 48.1.1.4). Conge principal =
    24 premiers jours ouvrables (la 5e semaine ne compte pas). Jours hors periode =
    conge principal - jours pris du 1er mai au 31 octobre. 2 jours si 6 ou plus ;
    1 jour si 3 a 5 ; 0 sinon. Renonciation ecrite : 0.
    Sortie : jours_hors_periode, jours_fractionnement."""
    d = entier(droits_acquis, "droits_acquis")
    dans = entier(jours_conge_principal_pris_du_1er_mai_au_31_octobre, "jours_pris_dans_periode")
    principal = min(d, 24)
    if dans > principal:
        raise ErreurSaisie("Jours pris dans la periode superieurs au conge principal.")
    hors = principal - dans
    if renonciation_ecrite:
        f = 0
    elif hors >= 6:
        f = 2
    elif hors >= 3:
        f = 1
    else:
        f = 0
    return resultat_ok(jours_fractionnement.regles, {"jours_hors_periode": hors, "jours_fractionnement": f})


@api("R-CP-09", "R-JF-01")
def decompte_jours_cp(premier_jour_absence, jour_reprise, jours_travailles, feries_travailles=(),
                      region="metropole", jours_arret_maladie=(), date_fin_contrat=None):
    """Jours de CP decomptes (R-CP-09) : du premier jour ouvrable qui aurait du
    etre travaille jusqu'a la veille de la reprise ; chaque jour ouvrable compte
    (lundi a samedi), sauf ferie chome. jours_travailles : 0 = lundi.
    Lundi de Pentecote : ferie ordinaire (T-040).
    T-103 (C15, A1) : CCN 48.1.1.3 (KALIARTI000043942123) : « les jours de conges
    payes qui coincident avec la periode de l'arret de travail ne sont pas
    decomptes » : jours_arret_maladie (dates) ne sont pas comptes.
    T-103 (C16, A2) : contrat fini avant la reprise : decompte jusqu'a la fin du
    contrat (date_fin_contrat) ; le reste est paye en indemnite compensatrice
    (CCN 67).
    Sortie : jours_decomptes, premier_jour_decompte."""
    if not (isinstance(premier_jour_absence, date) and isinstance(jour_reprise, date)):
        raise ErreurSaisie("Dates attendues.")
    if jour_reprise <= premier_jour_absence:
        raise ErreurSaisie("La reprise doit suivre le premier jour d'absence.")
    if date_fin_contrat is not None:
        if not isinstance(date_fin_contrat, date) or date_fin_contrat < premier_jour_absence:
            raise ErreurSaisie("date_fin_contrat : date attendue, apres le premier jour d'absence.")
        jour_reprise = min(jour_reprise, date_fin_contrat + timedelta(days=1))
    exclus = set(jours_arret_maladie or ())
    if any(not isinstance(x, date) for x in exclus):
        raise ErreurSaisie("jours_arret_maladie : dates attendues.")
    jt = set(int(x) for x in jours_travailles)
    ft = set(feries_travailles)
    feries = {}
    for a in range(premier_jour_absence.year, jour_reprise.year + 1):
        feries.update(jours_feries(a, region))  # T-103 (R4) : 27 avril a Mayotte
    # T-077 (R3.4) : lecture A, le ferie local chome n'est pas decompte ; lecture B, il l'est.
    from .regions import region_valide, feries_locaux_entre
    locaux = {d: n for d, n in feries_locaux_entre(premier_jour_absence, jour_reprise, region_valide(region)).items()
              if d not in feries}
    if locaux:
        a = _decompte(premier_jour_absence, jour_reprise, jt, ft, {**feries, **locaux}, exclus)
        b = _decompte(premier_jour_absence, jour_reprise, jt, ft, feries, exclus)
        if a != b:
            raise NonGere("A77-DECOMPTE-CP", ["R-CP-09", "T077-R3"], details={
                "lectures": {"A": a[0], "B": b[0]},
                "message": f"Conge a decompte a confirmer : {a[0]} jours si le ferie local est un ferie de l'AM "
                           f"(lecture A), {b[0]} jours sinon (lecture B)."})
    n, debut = _decompte(premier_jour_absence, jour_reprise, jt, ft, feries, exclus)
    return resultat_ok(decompte_jours_cp.regles, {"jours_decomptes": n,
                                                  "premier_jour_decompte": debut.isoformat() if debut < jour_reprise else None})


def _decompte(premier_jour_absence, jour_reprise, jt, ft, feries, exclus=frozenset()):

    def chome(d):
        return d in feries and d not in ft

    # T-040 (MB5) : A-31 leve. Le lundi de Pentecote est un ferie ordinaire (CCN
    # art. 47.2, C. trav. L3133-1, 6°) : chome, il n'est pas decompte (chome()).
    d = premier_jour_absence
    while d < jour_reprise and (d.weekday() not in jt or chome(d)):
        d += timedelta(days=1)
    debut = d
    n = 0
    while d < jour_reprise:
        if d.weekday() <= 5 and not chome(d) and d not in exclus:
            n += 1
        d += timedelta(days=1)
    return n, debut


def _culprit(resultats, dimensions):
    """Trouve la premiere dimension dont le seul changement modifie le resultat."""
    cles = list(resultats)
    for i, code in enumerate(dimensions):
        for k1 in cles:
            for k2 in cles:
                if k1[i] != k2[i] and all(k1[j] == k2[j] for j in range(len(k1)) if j != i):
                    if resultats[k1] != resultats[k2]:
                        return code
    return dimensions[0] if dimensions else "A-26"


def _indemnite_cp(jours_conges, heures_hebdo_minutes, taux_horaire_centimes, salaires_bruts_periode_centimes,
                  icp_versee_pendant_periode_centimes, icp_annee_precedente_centimes, heures_conge_minutes,
                  jours_supplementaires, sommes_assiette_ambigues, regles, type_annee=None):
    j = entier(jours_conges, "jours_conges", 1)
    h = positif(heures_hebdo_minutes, "heures_hebdo_minutes")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    base = Fraction(entier(salaires_bruts_periode_centimes, "salaires_bruts_periode_centimes"))
    icp1 = entier(icp_versee_pendant_periode_centimes, "icp_versee_pendant_periode_centimes")
    icp2 = entier(icp_annee_precedente_centimes, "icp_annee_precedente_centimes")
    sup = entier(jours_supplementaires, "jours_supplementaires")
    if sup >= j:
        raise ErreurSaisie("jours_supplementaires doit etre inferieur a jours_conges.")
    # Maintien (A-26) : formule Urssaf simplifiee (jours / 6 x heures hebdo x taux) ;
    # decompte reel (heures qui auraient ete travaillees pendant le conge).
    m1 = Fraction(j, 6) * h / 60 * t
    # T-103 (C12, A2) : annee incomplete : maintien = jours / 6 x heures habituelles par semaine x taux (CCN
    # 48.1.1.5 ; Cass. soc. 09/05/2019, n° 17-26.232 : « duree normale habituelle d'accueil [...] pendant toute la
    # periode de reference »). Le decompte reel n'est plus une lecture : refus A-26 leve en annee incomplete.
    # verif-1 (B-7, A-26) : 52 semaines aussi : CCN 48.1.1.5 (« remuneration brute que le salarie aurait percue pour
    # une duree de travail egale a celle du conge ») lue avec Cass. soc. 09/05/2019, n° 17-26.232, publie (« duree
    # normale habituelle d'accueil [...] pendant toute la periode de reference ») : jours ouvrables / 6 x salaire
    # d'une semaine habituelle, quel que soit le nombre de jours. Le decompte reel des heures du conge n'est pas la
    # duree habituelle : il n'est plus une lecture. Refus A-26 leve.
    if True:
        m2 = m1
    elif heures_conge_minutes is not None:
        m2 = positif(heures_conge_minutes, "heures_conge_minutes") / 60 * t
    else:
        m2 = None
    maintiens = [m1] if m2 is None else ([m1] if m2 == m1 else [m1, m2])
    if m2 is None:
        raise NonGere("A-26", regles, precision=(
            "Conge qui n'est pas un nombre entier de semaines : fournir heures_conge_minutes "
            "(heures qui auraient ete travaillees pendant le conge)."),
            details={"maintien_formule_urssaf_exact_centimes": texte_fraction(m1)})
    # Dixieme (R-CP-06) : variantes selon les ambiguites ouvertes.
    dims = ["A-26"]
    options = [maintiens]
    # T-103 (F7) : CCN 48.1.1.5 : base « y compris celle versee au titre des conges payes pris au cours de ladite
    # periode » : l'ICP versee pendant la periode (icp1). CASF L423-6 (LEGIARTI000006798032 : dixieme de la
    # remuneration recue « et [de] l'indemnite de conge paye de l'annee precedente ») est un minimum legal (C. trav.
    # L2251-1) : controle apres le calcul ; refus A-28 seulement si ce minimum depasse le resultat de la CCN.
    dims.append("A-28")
    options.append([icp1])
    dims.append("CP-SUPP")
    options.append([False, True] if sup else [False])
    amb = sommes_assiette_ambigues or {}
    amb_items = []
    for nom, (montant, code) in amb.items():
        montant = entier(montant, nom)
        amb_items.append((nom, montant))
        dims.append(code)
        options.append([0, montant] if montant else [0])
    resultats = {}
    dixiemes = set()
    for combo in product(*options):
        m, icp, scale = combo[0], combo[1], combo[2]
        assiette = base + icp + sum(combo[3:])
        dix = assiette / 10
        if scale:
            dix = dix * j / (j - sup)
        dixiemes.add(dix)
        resultats[combo] = max(m, dix)
    if len(set(resultats.values())) != 1:
        code = _culprit(resultats, dims)
        raise NonGere(code, regles, details={
            "maintien_exact_centimes": [texte_fraction(x) for x in maintiens],
            "dixieme_exact_centimes": sorted(texte_fraction(x) for x in dixiemes)})
    valeur = next(iter(resultats.values()))
    if icp2 != icp1:
        legal = (base + icp2 + sum(mt for _, mt in amb_items)) / 10
        if legal > valeur:
            raise NonGere("A-28", regles, precision=(
                "Le dixieme du CASF L423-6 (ICP de l'annee precedente) depasse ici le resultat de la CCN 48.1.1.5."),
                details={"ccn_exact_centimes": texte_fraction(valeur), "casf_l423_6_exact_centimes": texte_fraction(legal)})
    if all(valeur == m for m in maintiens) and all(valeur > d for d in dixiemes):
        methode = "maintien"
    elif all(valeur == d for d in dixiemes) and all(valeur > m for m in maintiens):
        methode = "dixieme"
    else:
        methode = "egalite"
    return valeur, methode, maintiens, dixiemes


@api("R-CP-06")
def indemnite_cp(jours_conges, heures_hebdo_minutes, taux_horaire_centimes, salaires_bruts_periode_centimes,
                 icp_versee_pendant_periode_centimes=0, icp_annee_precedente_centimes=0,
                 heures_conge_minutes=None, jours_supplementaires=0, type_annee=None):
    """Indemnite de CP pour un droit annuel (R-CP-06) : le plus favorable entre
    maintien et dixieme.
    - jours_conges : droit total en jours ouvrables (jours supplementaires inclus).
    - salaires_bruts_periode_centimes : remuneration brute de la periode de
      reference, hors indemnites d'entretien, de repas et kilometriques.
    - icp_* : indemnite de CP selon les deux lectures (A-28) ; si elles
      different et changent le resultat : refus A-28.
    - heures_conge_minutes : obligatoire si le conge n'est pas un nombre entier
      de semaines (A-26).
    - jours_supplementaires : jours enfants ou fractionnement inclus dans
      jours_conges ; s'ils changent le resultat du dixieme : refus CP-SUPP.
    Sortie : indemnite_centimes, methode (maintien, dixieme, egalite)."""
    v, methode, maint, dix = _indemnite_cp(jours_conges, heures_hebdo_minutes, taux_horaire_centimes,
                                           salaires_bruts_periode_centimes, icp_versee_pendant_periode_centimes,
                                           icp_annee_precedente_centimes, heures_conge_minutes,
                                           jours_supplementaires, None, ["R-CP-06"], type_annee)
    return resultat_ok(indemnite_cp.regles, {
        "indemnite_centimes": vers_centimes(v, "indemnite de CP", ["R-CP-06"]),
        "methode": methode,
        "maintien_exact_centimes": [texte_fraction(x) for x in maint],
        "dixieme_exact_centimes": sorted(texte_fraction(x) for x in dix),
        # T-040d : maintien en centimes (ARR-01, plus proche) quand une seule formule est en jeu.
        "maintien_centimes": (vers_centimes(maint[0], "maintien de salaire (information)", ["R-CP-06"])
                              if len(maint) == 1 else None),
    })


@api("R-CP-07", "R-CP-06")
def complement_cp_annee_complete(resultat_indemnite_cp):
    """Annee complete (R-CP-07) : le salaire mensualise est maintenu pendant les
    CP. Si le maintien est retenu (ou egalite), aucun complement. Si le dixieme
    l'emporte : refus A-29 (moment et forme du complement non ecrits).
    Entree : la sortie de indemnite_cp(). Sortie : complement_centimes."""
    if not isinstance(resultat_indemnite_cp, dict) or resultat_indemnite_cp.get("statut") not in ("ok", "provisoire"):
        raise ErreurSaisie("Fournir un resultat valide de indemnite_cp().")
    methode = resultat_indemnite_cp["resultat"]["methode"]
    if methode in ("maintien", "egalite"):
        return resultat_ok(complement_cp_annee_complete.regles, {"complement_centimes": 0})
    raise NonGere("A-29", ["R-CP-07"])


@api("R-CP-08")
def paiement_cp_annee_incomplete(modalite, indemnite_annuelle_centimes, salaire_mensualise_centimes, mois_de_paie,
                                 mois_prise_principale=None, prise_principale_sur_deux_mois=False):
    """Annee incomplete (R-CP-08) : l'indemnite annuelle (arretee au 31 mai)
    s'ajoute au salaire mensualise, selon la modalite du contrat :
    « juin » (en une fois en juin), « prise_principale » (lors de la prise
    principale), « fur_et_a_mesure » (refus A-30). Toute autre modalite est
    interdite. Sortie : montant_cp_du_mois_centimes, total_mois_centimes."""
    ind = entier(indemnite_annuelle_centimes, "indemnite_annuelle_centimes")
    sal = entier(salaire_mensualise_centimes, "salaire_mensualise_centimes")
    mois = entier(mois_de_paie, "mois_de_paie", 1)
    if mois > 12:
        raise ErreurSaisie("mois_de_paie entre 1 et 12.")
    if modalite == "juin":
        cp = ind if mois == 6 else 0
    elif modalite == "prise_principale":
        if prise_principale_sur_deux_mois:
            raise NonGere("R-CP-08-PRISE", ["R-CP-08"])
        mpp = entier(mois_prise_principale, "mois_prise_principale", 1)
        cp = ind if mois == mpp else 0
    elif modalite == "fur_et_a_mesure":
        raise NonGere("A-30", ["R-CP-08"])
    else:
        raise ErreurSaisie("Modalite interdite par la CCN art. 102.1.2.2 (pas de versement mensuel de 10 %).", ["R-CP-08"])
    return resultat_ok(paiement_cp_annee_incomplete.regles, {"montant_cp_du_mois_centimes": cp,
                                                             "total_mois_centimes": sal + cp})


@api("R-CP-07", "R-CP-08", "R-CP-06")
def indemnite_cp_prise_partielle(type_annee):
    """Indemnite pour une partie seulement du droit annuel (comparaison
    maintien / dixieme au moment de chaque prise). Non ecrit : refus A-29 en
    annee complete, A-30 en annee incomplete."""
    type_annee_valide(type_annee)
    raise NonGere("A-29" if type_annee == "complete" else "A-30", ["R-CP-06"])


@api("R-CP-07", "R-CP-08")
def conges_apres_changement_type(types_periode_acquisition, type_annee_prise):
    """T-072 (T-052) : conges pris apres un avenant qui change le type d'annee.
    types_periode_acquisition : types d'annee en vigueur pendant la periode de
    reference ou les jours pris ont ete acquis (CCN 48.1.1.1 : 1er juin - 31 mai) ;
    type_annee_prise : type en vigueur le jour pris.
    Textes lus (copies citees dans regles/t021-convention.md, regles-v0 R-CP-07, R-CP-08) :
    - CCN 102.1.2.1 (52 semaines) : « les conges payes sont indemnises au moment de
      leur prise. Pour la duree des conges payes, l'indemnite brute due au titre de
      ces derniers se substitue au salaire mensuel brut » ;
    - CCN 102.1.2.2 (46 semaines ou moins) : l'indemnite s'ajoute au salaire
      mensualise, versee en une fois en juin, a la prise principale ou au fur et a
      mesure ;
    - CCN 48.1.1.5 : comparaison maintien / dixieme.
    Aucun de ces articles, ni les fiches DREETS lues (Occitanie 1/5 du 05/11/2024,
    Auvergne-Rhone-Alpes du 25/03/2024), ne dit comment payer des jours acquis sous
    un type et pris sous l'autre (substitution au salaire, ou indemnite en plus).
    Un meme type partout : rien a trancher (sortie ok). Sinon refus
    AVENANT-CP-A-CONFIRMER : le salaire et les conges des jours en cause sont a
    confirmer ; regle du projet (T-019, T-030) : un montant a confirmer n'est ni
    paye ni retenu."""
    types = list(types_periode_acquisition or ())
    for t in types + [type_annee_prise]:
        type_annee_valide(t)
    if not types:
        raise ErreurSaisie("types_periode_acquisition : au moins un type.")
    if all(t == type_annee_prise for t in types):
        return resultat_ok(conges_apres_changement_type.regles, {"meme_regime": True})
    raise NonGere("AVENANT-CP-A-CONFIRMER", ["R-CP-07", "R-CP-08"],
                  precision="Jours acquis sous « " + "/".join(sorted(set(types))) + " », pris sous « "
                  + type_annee_prise + " ».",
                  details={"types_acquisition": sorted(set(types)), "type_prise": type_annee_prise,
                           "consigne": "ni paye ni retenu tant que ce n'est pas confirme"})


@api("VERIF1-OCC")
def salaire_accueil_occasionnel(minutes_accueil_du_mois, taux_horaire_centimes):
    """verif-1 (T-104, cas 2) : CCN 108.2 (pas de mensualisation), 109.3 (« salaire horaire brut x nombre d'heures
    d'accueil [effectuees au cours du mois] ») ; CASF L423-19 (« versee au moins une fois par mois »).
    Sortie : salaire_centimes."""
    m = positif(minutes_accueil_du_mois, "minutes_accueil_du_mois")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    return resultat_ok(["VERIF1-OCC"], {"salaire_centimes": vers_centimes(m / 60 * t, "salaire occasionnel", ["VERIF1-OCC"])})


@api("VERIF1-OCC")
def conges_accueil_occasionnel(salaires_bruts_periode_centimes, jours_calendaires_periode):
    """verif-1 (T-104, cas 2) : CCN 102.1.2.3 : indemnite de CP par « la regle du dixieme », « versee au terme de
    l'accueil occasionnel » (pas de comparaison avec le maintien). Jours declares : semaines x 2,5 / 4 (Urssaf,
    « La gestion des conges payes », 15/09/2026), arrondi a l'entier superieur (L3141-7), 30 au plus.
    Sortie : indemnite_centimes, jours."""
    base = entier(salaires_bruts_periode_centimes, "salaires_bruts_periode_centimes")
    j = entier(jours_calendaires_periode, "jours_calendaires_periode", 1)
    return resultat_ok(["VERIF1-OCC"], {"indemnite_centimes": vers_centimes(Fraction(base, 10), "CP occasionnel", ["VERIF1-OCC"]),
                                        "jours": min(30, _ceil(Fraction(j, 7) * Fraction(5, 2) / 4))})
