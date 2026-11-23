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
                      region="metropole"):
    """Jours de CP decomptes (R-CP-09) : du premier jour ouvrable qui aurait du
    etre travaille jusqu'a la veille de la reprise ; chaque jour ouvrable compte
    (lundi a samedi), sauf ferie chome. jours_travailles : 0 = lundi.
    Lundi de Pentecote : ferie ordinaire (T-040).
    Sortie : jours_decomptes, premier_jour_decompte."""
    if not (isinstance(premier_jour_absence, date) and isinstance(jour_reprise, date)):
        raise ErreurSaisie("Dates attendues.")
    if jour_reprise <= premier_jour_absence:
        raise ErreurSaisie("La reprise doit suivre le premier jour d'absence.")
    jt = set(int(x) for x in jours_travailles)
    ft = set(feries_travailles)
    feries = {}
    for a in range(premier_jour_absence.year, jour_reprise.year + 1):
        feries.update(jours_feries(a))
    # T-077 (R3.4) : lecture A, le ferie local chome n'est pas decompte ; lecture B, il l'est.
    from .regions import region_valide, feries_locaux_entre
    locaux = {d: n for d, n in feries_locaux_entre(premier_jour_absence, jour_reprise, region_valide(region)).items()
              if d not in feries}
    if locaux:
        a = _decompte(premier_jour_absence, jour_reprise, jt, ft, {**feries, **locaux})
        b = _decompte(premier_jour_absence, jour_reprise, jt, ft, feries)
        if a != b:
            raise NonGere("A77-DECOMPTE-CP", ["R-CP-09", "T077-R3"], details={
                "lectures": {"A": a[0], "B": b[0]},
                "message": f"Conge a decompte a confirmer : {a[0]} jours si le ferie local est un ferie de l'AM "
                           f"(lecture A), {b[0]} jours sinon (lecture B)."})
    n, debut = _decompte(premier_jour_absence, jour_reprise, jt, ft, feries)
    return resultat_ok(decompte_jours_cp.regles, {"jours_decomptes": n,
                                                  "premier_jour_decompte": debut.isoformat() if debut < jour_reprise else None})


def _decompte(premier_jour_absence, jour_reprise, jt, ft, feries):

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
        if d.weekday() <= 5 and not chome(d):
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
                  jours_supplementaires, sommes_assiette_ambigues, regles):
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
    if j % 6 == 0:
        m2 = m1  # semaines entieres : les deux lectures concordent.
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
    dims.append("A-28")
    options.append(sorted({icp1, icp2}))
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
                 heures_conge_minutes=None, jours_supplementaires=0):
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
                                           jours_supplementaires, None, ["R-CP-06"])
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


# T-082 (decision du DG du 22/11/2026) : droits de la periode precedente a confirmer sans lecture chiffree.
# Codes de refus de acquisition_cp qui laissent le droit a confirmer. Sans `resultats_par_methode` dans les
# details, aucune lecture n'est chiffree : la borne haute (borne_haute_droits_cp) s'applique.
CODES_DROIT_A_CONFIRMER = ("SUS-11", "A-23", "R-CP-02-DATE", "CP-ARRONDI-PARTS")


@api("R-CP-01", "R-CP-02", "R-CP-03", "T082")
def borne_haute_droits_cp(type_annee, mois, semaines, jours=None, jours_par_semaine=None,
                          age_am_au_30_avril=35, nombre_enfants_a_charge=0, periode_atteint_31_mai=True,
                          accident_travail=False, report=False, types_periode_acquisition=None):
    """T-082 : borne haute des jours de CP acquis sur une periode de reference dont le droit est a confirmer.
    Entrees : mois, semaines et jours de travail effectif ou assimile, comptes EN TRAITANT chaque jour d'arret
    maladie non professionnel comme du travail effectif.
    Textes : CCN 48.1.1.2 et L3141-3 (2,5 jours par mois de travail ou periode equivalente, L3141-4) ; un jour
    d'arret ouvre 0 jour (CCN 49) ou 2 jours par mois (L3141-5-1), jamais plus de 2,5 : aucune lecture de la
    maladie ne depasse ce calcul. Arrondi a l'entier superieur sur le droit total (48.1.1.2, L3141-7), plafond
    30 (L3141-3). Chaque methode est calculee ; la borne est la plus haute (pas de concordance exigee).
    Jours pour enfants a charge ajoutes (CCN 48.1.3.3, L3141-8, R-CP-03 ; croissants avec le droit).
    types_periode_acquisition : types d'annee en vigueur pendant la periode (avenants) ; plus d'un type : refus
    T082-BORNE-AVENANT (unites de la periode non definies sous deux mensualisations, CCN 109.1 muet).
    Refus : EXCLU-AT, CP-REPORT, T082-BORNE-AVENANT.
    Sortie : borne_haute_hors_enfants, jours_enfants, borne_haute, resultats_par_methode."""
    type_annee_valide(type_annee)
    regles = ["R-CP-01", "R-CP-02", "R-CP-03"]
    if accident_travail:
        raise NonGere("EXCLU-AT", regles)
    if report:
        raise NonGere("CP-REPORT", regles)
    types = list(types_periode_acquisition or [type_annee])
    for t in types:
        type_annee_valide(t)
    if len(set(types)) > 1:
        raise NonGere("T082-BORNE-AVENANT", regles, details={"types_acquisition": sorted(set(types))})
    if mois is None or semaines is None:
        raise ErreurSaisie("mois et semaines obligatoires.", regles)
    deux_et_demi = Fraction(5, 2)
    res = {"mois": min(30, _ceil(deux_et_demi * positif(mois, "mois"))),
           "semaines": min(30, _ceil(positif(semaines, "semaines") / 4 * deux_et_demi))}
    if jours is not None:
        jps = positif(jours_par_semaine, "jours_par_semaine")
        if jps == 0:
            raise ErreurSaisie("jours_par_semaine nul.")
        res["jours"] = min(30, _ceil(positif(jours, "jours") * deux_et_demi / (4 * jps)))
    borne = max(res.values())
    e = jours_enfants_a_charge.interne(borne, age_am_au_30_avril, nombre_enfants_a_charge, periode_atteint_31_mai)
    sup = e["resultat"]["jours_supplementaires"]
    return resultat_ok(borne_haute_droits_cp.regles, {"borne_haute_hors_enfants": borne, "jours_enfants": sup,
                                                       "borne_haute": borne + sup, "resultats_par_methode": res})


STATUTS_JOUR_CP = ("paye", "paye_droit_a_confirmer", "a_confirmer", "au_dela_des_droits")


@api("R-CP-09", "R-CP-01", "T082")
def statut_jours_cp_pris(rangs, droit=None, lectures=None, borne_haute=None):
    """Statut de chaque jour de CP pris, selon les droits de la periode d'acquisition.
    rangs : rang de chaque jour = jours ouvrables decomptes (R-CP-09, CCN 48.1.1.3) depuis le premier conge de la
    periode de prise, jusqu'a ce jour inclus ; None si le decompte n'est pas etabli (statut None ; refus
    T082-JOUR-NON-ETABLI quand la mention en depend, forme borne_haute). Donner une seule des trois formes de droit :
    - droit (entier certain) : rang <= droit -> paye ; sinon au_dela_des_droits (CCN 102.2) ;
    - lectures (au moins une lecture chiffree, regle T-030) : rang <= plus basse -> paye ; <= plus haute ->
      a_confirmer ; sinon au_dela_des_droits. Aucune mention « droit a confirmer » ;
    - borne_haute (droit a confirmer sans lecture chiffree, decision du DG du 22/11/2026, T-082) :
      rang <= borne -> paye_droit_a_confirmer (paye, mention « droit a confirmer ») ; sinon a_confirmer (ni
      paye ni retenu, T-052, T-019).
    Sortie : statuts (liste alignee sur rangs), jours_droit_a_confirmer (nombre de paye_droit_a_confirmer)."""
    formes = [x is not None for x in (droit, lectures, borne_haute)]
    if sum(formes) != 1:
        raise ErreurSaisie("Donner exactement un de : droit, lectures, borne_haute.")
    rs = [None if r is None else entier(r, "rang", 1) for r in rangs]
    if borne_haute is not None and None in rs:
        raise NonGere("T082-JOUR-NON-ETABLI", ["R-CP-09"], details={"rangs": rs})
    if droit is not None:
        n = entier(droit, "droit")
        st = [None if r is None else "paye" if r <= n else "au_dela_des_droits" for r in rs]
    elif lectures is not None:
        ls = [entier(x, "lecture") for x in lectures]
        if not ls:
            raise ErreurSaisie("lectures : au moins une lecture chiffree (sinon borne_haute).")
        lo, hi = min(ls), max(ls)
        st = [None if r is None else "paye" if r <= lo else "a_confirmer" if r <= hi else "au_dela_des_droits"
              for r in rs]
    else:
        b = entier(borne_haute, "borne_haute")
        st = ["paye_droit_a_confirmer" if r <= b else "a_confirmer" for r in rs]
    return resultat_ok(statut_jours_cp_pris.regles, {"statuts": st,
                                                      "jours_droit_a_confirmer": st.count("paye_droit_a_confirmer")})
