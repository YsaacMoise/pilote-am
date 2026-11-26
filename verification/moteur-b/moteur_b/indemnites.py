"""Indemnites d'entretien, de repas et kilometriques (domaine 7 de regles-v0)."""

import math
from datetime import date
from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, positif, entier,
    vers_centimes, texte_fraction, verifier_date_ccn,
)
from .baremes import minimum_garanti, bareme_km, bareme_fiscal_auto, PLANCHER_ENTRETIEN_JOURNALIER

JOURNEE_9H = 9 * 60


# T-040b (MB5) : A-35 leve. Le minimum d'une journee de duree quelconque est
# proportionnel a la duree, avec le plancher de 2,65 EUR :
#   minimum exact = max(2,65 EUR ; 90 % du MG x duree / 9 heures).
# Sources relues en entier le 18/11/2026 :
# - CCN art. 114.1 : le montant horaire « varie en fonction de la duree de travail
#   effectif, sans pouvoir etre inferieur a 90 % du minimum garanti lorsque la duree
#   de travail journaliere est de 9 heures » ; « Quel que soit le nombre d'heures
#   [...] le montant journalier [...] ne peut pas etre inferieur a 2,65 EUR ».
# - CASF D423-7 (version du 01/05/2008) : 85 % du MG « pour une journee de neuf
#   heures. Ce montant est calcule en fonction de la duree effective d'accueil
#   quotidien » (la CCN est plus favorable).
# - Urssaf, « Taux et baremes - Assistant maternel agree » (mis a jour le 01/06/2026) :
#   « Ce montant est proratisable en fonction du nombre d'heures d'accueil par jour.
#   Il ne peut etre inferieur a 2,65 EUR. »
# - DREETS Bourgogne-Franche-Comte, guide assistants maternels (aout 2026), fiche
#   remuneration : minimum horaire « MG x 0.9 / 9 » ; « Jusqu'a 6 h : 2,65 EUR » ;
#   7 h, 8 h, 9 h, 10 h au prorata (0,435 EUR x duree).
# A-36 (T-040c) : aucun texte ne fixe l'arrondi au centime. Application de la
# decision ARR-01 du DG du 18/11/2026 (03-JOURNAL.md : « arrondi au centime :
# arrondi au plus proche garde, avec une phrase [...] jusqu'a la reponse de la
# DDETS ») : le minimum est arrondi au centime le plus proche, pour toutes les
# periodes et toutes les durees, 9 h comprises. Cela remplace la regle « centime
# superieur » de T-035a. Les autres lectures restent dans details, pour la trace.

ARRONDI_ARR01 = ("arrondi au centime le plus proche, decision ARR-01 du DG du 18/11/2026 "
                 "dans l'attente de la DDETS ; le minimum exact est {} EUR")
ARRONDI_SUPERIEUR = ("arrondi au centime superieur (CCN 114.1 : « sans pouvoir etre inferieur a 90 % du minimum "
                     "garanti ») ; le minimum exact est {} EUR")


def _demi_haut(x):
    """Arrondi au centime le plus proche, demi vers le haut (x en centimes)."""
    return math.floor(Fraction(x) + Fraction(1, 2))


def _euros_exacts(centimes):
    """Montant exact en euros, sans arrondi : decimal s'il est fini, sinon fraction."""
    f = Fraction(centimes) / 100
    d = f.denominator
    while d % 2 == 0:
        d //= 2
    while d % 5 == 0:
        d //= 5
    if d != 1:
        return f"{f.numerator}/{f.denominator}"
    ent, reste = divmod(f.numerator * 10 ** 12 // f.denominator, 10 ** 12)
    dec = str(reste).rjust(12, "0").rstrip("0")
    dec = (dec + "00")[:max(2, len(dec))]
    return f"{ent},{dec}"


def _minimum_entretien(d, duree_minutes):
    """Minimum journalier exact (Fraction, centimes), minimum paye (centimes,
    arrondi ARR-01) et details (mention, autres lectures)."""
    mg, src, prov = minimum_garanti(d)
    neuf = Fraction(9, 10) * mg
    dur = positif(duree_minutes, "duree_minutes")
    if dur == 0:
        raise ErreurSaisie("Duree d'accueil nulle : aucune indemnite (R-ABS-10).")
    plancher = Fraction(PLANCHER_ENTRETIEN_JOURNALIER)
    exact_min = max(plancher, neuf * dur / JOURNEE_9H)
    # T-109 (comparateur des verifications, correction 3) : CCN 114.1, « sans pouvoir etre inferieur a 90 % du minimum
    # garanti » : un plancher ne s'arrondit pas en dessous : centime superieur (Urssaf : 3,39 EUR au 01/01/2022 pour
    # 3,384 EUR). Remplace l'arrondi au plus proche (ARR-01) pour ce minimum.
    paye = math.ceil(exact_min)
    details = {
        "arrondi": ARRONDI_SUPERIEUR.format(_euros_exacts(exact_min)),
        "minimum_exact_centimes": texte_fraction(exact_min),
        "source_mg": src,
        "autres_lectures_centimes": {
            "centime_le_plus_proche": _demi_haut(exact_min),
            "simulateur_service_public": max(PLANCHER_ENTRETIEN_JOURNALIER,
                                             _demi_haut(Fraction(_demi_haut(neuf)) * dur / JOURNEE_9H)),
        },
    }
    return exact_min, paye, details, prov


@api("R-IND-01", "R-IND-02", "R-SAL-02")
def minimum_entretien_journalier(d, duree_minutes):
    """Minimum journalier d'entretien pour une duree donnee (R-IND-02, T-040b) :
    max(2,65 EUR ; 90 % du MG x duree / 9 h), arrondi au centime superieur
    (CCN 114.1, T-109 ; avant : plus proche, ARR-01). Sortie : minimum_centimes, details."""
    exact_min, paye, details, prov = _minimum_entretien(d, duree_minutes)
    return resultat_ok(minimum_entretien_journalier.regles,
                       {"minimum_centimes": paye, "details": details}, provisoire=prov)


@api("R-IND-02", "R-SAL-02")
def verifier_entretien_journalier(montant_journalier_centimes, d, duree_minutes):
    """Controle d'un montant journalier d'entretien face au minimum (R-IND-02).
    Conforme s'il atteint le minimum exact du texte (sans arrondi).
    Sortie : conforme (bool), details."""
    mt = positif(montant_journalier_centimes, "montant_journalier_centimes")
    exact_min, paye, details, prov = _minimum_entretien(d, duree_minutes)
    return resultat_ok(verifier_entretien_journalier.regles, {"conforme": mt >= exact_min, "details": details},
                       provisoire=prov)


def duree_travail_art99(j, i=0):
    """T-103 (M1, M3) : duree de travail du jour au sens de la CCN art. 99
    (KALIARTI000043942263) : le travail « debute a l'heure prevue dans le contrat
    [...] ou encore a l'heure d'arrivee de l'enfant [...] si celle-ci est
    anterieure » et « prend fin a l'heure prevue [...] ou a l'heure a laquelle
    l'enfant quitte le lieu d'accueil [...] si celle-ci est posterieure ».
    Le jour j donne soit duree_minutes (deja calculee), soit les heures en minutes
    depuis minuit : debut_prevu, fin_prevue (None si le jour est hors planning),
    arrivee, depart. Hors planning (M3) : rien n'est prevu, le travail va de
    l'arrivee au depart de l'enfant."""
    cles = ("debut_prevu", "fin_prevue", "arrivee", "depart")
    if any(k in j for k in cles):
        dp, fp = j.get("debut_prevu"), j.get("fin_prevue")
        ar, de = j.get("arrivee"), j.get("depart")
        if (dp is None) != (fp is None):
            raise ErreurSaisie(f"jours[{i}] : debut_prevu et fin_prevue vont ensemble.")
        if dp is None:
            if ar is None or de is None:
                raise ErreurSaisie(f"jours[{i}] : jour hors planning, arrivee et depart de l'enfant obligatoires.")
            debut, fin = entier(ar, "arrivee"), entier(de, "depart")
        else:
            debut, fin = entier(dp, "debut_prevu"), entier(fp, "fin_prevue")
            if ar is not None:
                debut = min(debut, entier(ar, "arrivee"))
            if de is not None:
                fin = max(fin, entier(de, "depart"))
        if fin <= debut:
            raise ErreurSaisie(f"jours[{i}] : fin du travail avant son debut.")
        return fin - debut
    return positif(j.get("duree_minutes"), f"jours[{i}].duree_minutes")


def _entretien_jours(jours, taux, d, journalier=None):
    """Calcul jour par jour (T-040e, T-103).
    taux : montant horaire du contrat (Fraction) ou None ; journalier : montant
    fixe par journee du contrat (M2) ou None.
    Renvoie (total_centimes, jours_payes, sous, ecart, det, prov)."""
    total = 0
    n = 0
    prov = False
    sous = []
    ecart = Fraction(0)
    det = {}
    for i, j in enumerate(jours):
        if not j.get("travail_effectif", False):
            continue
        dur = duree_travail_art99(j, i)
        montant = taux * dur / 60 if journalier is None else Fraction(journalier)
        exact_min, paye, details, p = _minimum_entretien(d, dur)
        prov = prov or p
        if montant < exact_min:
            nouveau = max(montant, Fraction(paye))
            sous.append(i + 1)
            ecart += nouveau - montant
            det[i + 1] = details
            montant = nouveau
        # T-040e : arrondi jour par jour, puis somme (decision ARR-01 ; voir docstring).
        total += vers_centimes(montant, f"indemnite d'entretien, jour {i + 1}", ["R-IND-02"])
        n += 1
    return total, n, sous, ecart, det, prov


@api("R-IND-02", "R-ABS-10", "R-IND-06")
def indemnite_entretien_mois(jours, montant_horaire_contrat_centimes, d, montant_journalier_contrat_centimes=None):
    """Indemnite d'entretien du mois (R-IND-02, R-ABS-10). Rien les jours sans
    travail effectif (absence de l'enfant, CP, ferie chome).
    jours : liste de dicts {"duree_minutes": int, "travail_effectif": bool} ou,
    a la place de duree_minutes, {"debut_prevu", "fin_prevue", "arrivee",
    "depart"} en minutes depuis minuit (voir duree_travail_art99).
    T-103 (M1, A1) : la duree du jour est la duree de TRAVAIL de l'art. 99. CCN
    114.1 (KALIARTI000043942300) : indemnite « versee en cas de travail effectif,
    par heure de travail » ; « Il varie en fonction de la duree de travail
    effectif ». La cle duree_accueil_minutes (presence de l'enfant) n'est plus
    lue : le refus ENTRETIEN-DUREE-ACCUEIL-OU-TRAVAIL de T-040e est leve.
    Contrat : soit un montant horaire (montant_horaire_contrat_centimes), soit
    un montant fixe par journee (montant_journalier_contrat_centimes, et
    montant_horaire_contrat_centimes=None).
    T-103 (M2, M3, A1) : montant fixe par journee = clause du contrat, du pour
    chaque journee de travail effectif quelle que soit sa duree, jour hors
    planning compris ; seul le minimum de 114.1 suit la duree du travail.
    Minimum (T-040b) : max(2,65 EUR ; 90 % du MG x duree / 9 h). Jour sous le
    minimum exact : paye au plus haut du montant du contrat et du minimum arrondi
    au centime le plus proche (ARR-01), ecart signale.
    Arrondi : chaque jour au centime le plus proche, puis somme (ARR-01, T-040e).
    Hors salaire, sans cotisations.
    Sortie : indemnite_centimes, jours_payes, mode_contrat, jours_sous_minimum, ecart_minimum, details."""
    if (montant_horaire_contrat_centimes is None) == (montant_journalier_contrat_centimes is None):
        raise ErreurSaisie("Donner soit le montant horaire, soit le montant par journee du contrat (un seul).")
    if montant_journalier_contrat_centimes is None:
        taux = positif(montant_horaire_contrat_centimes, "montant_horaire_contrat_centimes")
        total, n, sous, ecart, det, prov = _entretien_jours(jours, taux, d)
        mode = "horaire"
    else:
        jr = entier(montant_journalier_contrat_centimes, "montant_journalier_contrat_centimes")
        total, n, sous, ecart, det, prov = _entretien_jours(jours, None, d, journalier=jr)
        mode = "par_journee"
    res = {"indemnite_centimes": total, "jours_payes": n, "mode_contrat": mode,
           "duree_du_jour": "temps de travail de la CCN art. 99 (CCN 114.1 : par heure de travail effectif)",
           "arrondi_jour_par_jour": "chaque jour arrondi au centime le plus proche puis additionne, decision ARR-01 "
                                    "du DG du 18/11/2026 dans l'attente de la DDETS"}
    notes = None
    if sous:
        res["jours_sous_minimum"] = sous
        res["ecart_minimum"] = texte_fraction(ecart)
        res["details"] = det
        notes = ["Le montant d'entretien du contrat est sous le minimum de la convention (CCN art. 114.1) : "
                 "le minimum est verse pour les jours concernes, " + ARRONDI_ARR01.split(" ;")[0] + ". "
                 "Le contrat doit etre corrige."]
    return resultat_ok(indemnite_entretien_mois.regles, res, provisoire=prov, notes=notes)


@api("R-IND-03")
def indemnite_repas_mois(repas_fournis_par_am, montant_par_repas_centimes, repas_fournis_par_employeur=False):
    """Indemnite de repas du mois (R-IND-03, CCN art. 114.2) : nombre de repas
    fournis par l'AM x montant du contrat. Rien si l'employeur fournit les repas.
    Hors salaire, exclue des CP. Sortie : indemnite_centimes."""
    n = entier(repas_fournis_par_am, "repas_fournis_par_am")
    m = entier(montant_par_repas_centimes, "montant_par_repas_centimes")
    if repas_fournis_par_employeur:
        return resultat_ok(indemnite_repas_mois.regles, {"indemnite_centimes": 0})
    return resultat_ok(indemnite_repas_mois.regles, {"indemnite_centimes": n * m})


def _classe_administration(cv):
    """Classe du bareme de l'administration (arrete du 03/07/2006, art. 1er) :
    « 5 CV et moins », « 6 CV et 7 CV », « 8 CV et plus »."""
    if cv <= 5:
        return "5cv_et_moins"
    if cv <= 7:
        return "6_7cv"
    return "8cv_et_plus"


def _controle_bornes_km(t, d, cv, electrique):
    """Controle du taux du contrat face aux deux bornes de la CCN art. 57.
    La tranche de chaque bareme depend d'un cumul annuel de kilometres dont la
    base n'est pas definie pour l'AM (A-38) : controle robuste sur toutes les
    tranches. Renvoie (provisoire, details) ou leve NonGere."""
    verifier_date_ccn(d, ["R-IND-04"])
    table, src_adm, prov_adm = bareme_km(d)
    tranches = table[_classe_administration(cv)]
    if electrique is None:
        # Motorisation inconnue : plafond le plus bas sans majoration, le plus haut avec.
        (f_min, _), src_fisc, prov_fisc = bareme_fiscal_auto(d, cv, False)
        (_, f_max_e), _, _ = bareme_fiscal_auto(d, cv, True)
        (_, f_max_t), _, _ = bareme_fiscal_auto(d, cv, False)
        if f_max_t < t <= f_max_e:
            raise NonGere("KM-ELECTRIQUE-INCONNU", ["R-IND-04"])
        f_max = f_max_e
        (f_min_e, _), _, _ = bareme_fiscal_auto(d, cv, True)
    else:
        (f_min, f_max), src_fisc, prov_fisc = bareme_fiscal_auto(d, cv, electrique)
    details = {"bareme_administration_centimes": list(tranches), "source_administration": src_adm,
               "bareme_fiscal_min_centimes": texte_fraction(f_min), "bareme_fiscal_max_centimes": texte_fraction(f_max),
               "source_fiscal": src_fisc}
    if t < min(tranches):
        raise NonGere("KM-SOUS-PLANCHER", ["R-IND-04"], details=details)
    if t > f_max:
        raise NonGere("KM-SUR-PLAFOND", ["R-IND-04"], details=details)
    if t < max(tranches) or t > f_min:
        if electrique is None and t <= f_min_e and t >= max(tranches):
            raise NonGere("KM-ELECTRIQUE-INCONNU", ["R-IND-04"], details=details)
        raise NonGere("A-38", ["R-IND-04"], details=details)
    return prov_adm or prov_fisc, details


def _quote_part(employeurs_demandeurs, enfants_de_cet_employeur, enfants_transportes, trajet_pour_enfants_am):
    """CCN art. 113 : partage au prorata des enfants transportes seulement
    « lorsque plusieurs particuliers employeurs sont demandeurs de deplacements ».
    Un seul employeur demandeur : il doit l'indemnite entiere. Un seul employeur
    demandeur et trajet fait aussi pour les enfants de l'AM : le texte ne dit pas
    s'il y a partage (KM-PARTAGE-AM)."""
    n = entier(employeurs_demandeurs, "employeurs_demandeurs", 1)
    e = entier(enfants_de_cet_employeur, "enfants_de_cet_employeur", 1)
    tot = entier(enfants_transportes, "enfants_transportes", 1)
    if e > tot:
        raise ErreurSaisie("Plus d'enfants de l'employeur que d'enfants transportes.")
    if n == 1:
        if trajet_pour_enfants_am:
            raise NonGere("KM-PARTAGE-AM", ["R-IND-04"])
        return Fraction(1), "aucun partage (un seul employeur demandeur, CCN art. 113 al. 2 a contrario)"
    if tot < n:
        raise ErreurSaisie("Plusieurs employeurs demandeurs : au moins un enfant transporte par employeur.")
    return Fraction(e, tot), f"prorata {e}/{tot} (CCN art. 113 al. 2 et 3)"


@api("R-IND-04")
def indemnite_kilometrique(km, taux_contrat_centimes_par_km, d, puissance_cv, employeurs_demandeurs=1,
                           enfants_de_cet_employeur=1, enfants_transportes=1, trajet_pour_enfants_am=False,
                           electrique=False, vehicule_de_l_employeur=False):
    """Indemnite kilometrique d'un groupe de trajets de meme partage (R-IND-04
    corrigee, CCN art. 57 et 113 ; T-027).
    - Vehicule de l'employeur : rien (art. 57 al. 3).
    - Taux du contrat entre le bareme de l'administration (arrete du 03/07/2006,
      majore du 01/06 au 31/12/2026 par l'arrete du 29/05/2026, selon la date du
      trajet) et le bareme fiscal (CGI ann. IV art. 6 B, + 20 % si electrique).
      Sous le plancher pour toutes les tranches : KM-SOUS-PLANCHER ; au-dessus du
      plafond pour toutes les distances : KM-SUR-PLAFOND ; selon la tranche : A-38.
    - Montant = km x taux x quote-part (art. 113), arrondi au centime le plus proche (ARR-01, T-040d).
    puissance_cv : puissance administrative (entier). d : date des trajets.
    enfants_transportes : enfants presents dans le vehicule, y compris ceux de
    l'AM si le trajet repond a leurs besoins (art. 113).
    electrique : True, False, ou None si la motorisation est inconnue (refus
    KM-ELECTRIQUE-INCONNU quand le controle en depend).
    Sortie : indemnite_centimes, quote_part."""
    if vehicule_de_l_employeur:
        return resultat_ok(indemnite_kilometrique.regles, {"indemnite_centimes": 0,
                                                           "raison": "vehicule de l'employeur (CCN art. 57)"})
    k = positif(km, "km")
    t = positif(taux_contrat_centimes_par_km, "taux_contrat_centimes_par_km")
    cv = entier(puissance_cv, "puissance_cv", 1)
    q, texte_q = _quote_part(employeurs_demandeurs, enfants_de_cet_employeur, enfants_transportes,
                             trajet_pour_enfants_am)
    prov, details = _controle_bornes_km(t, d, cv, electrique)
    montant = k * t * q
    return resultat_ok(indemnite_kilometrique.regles,
                       {"indemnite_centimes": vers_centimes(montant, "indemnite kilometrique", ["R-IND-04"]),
                        "quote_part": texte_fraction(q), "partage": texte_q,
                        "source_plancher": details["source_administration"],
                        "source_plafond": details["source_fiscal"]}, provisoire=prov)


@api("R-IND-04")
def indemnite_kilometrique_mois(trajets, taux_contrat_centimes_par_km, puissance_cv, electrique=False):
    """Indemnite kilometrique du mois (T-027). trajets : liste de dicts
    {"date": date, "km": exact, "employeurs_demandeurs": int, "enfants_de_cet_employeur": int,
    "enfants_transportes": int, "trajet_pour_enfants_am": bool}. Chaque trajet est
    controle (bornes a sa date) ; chaque trajet est arrondi au centime le plus
    proche, puis les trajets sont additionnes (decision ARR-01 du DG, T-040d).
    Sortie : indemnite_centimes, km_total."""
    t = positif(taux_contrat_centimes_par_km, "taux_contrat_centimes_par_km")
    cv = entier(puissance_cv, "puissance_cv", 1)
    total = Fraction(0)
    km_total = Fraction(0)
    prov = False
    for i, tr in enumerate(trajets):
        d = tr.get("date")
        k = positif(tr.get("km"), f"trajets[{i}].km")
        if k == 0:
            continue
        q, _ = _quote_part(tr.get("employeurs_demandeurs", 1), tr.get("enfants_de_cet_employeur", 1),
                           tr.get("enfants_transportes", 1), tr.get("trajet_pour_enfants_am", False))
        p, _ = _controle_bornes_km(t, d, cv, electrique)
        prov = prov or p
        # T-040d : arrondi jour par jour (un trajet par jour), decision ARR-01 etendue
        # aux km par le DG le 18/11/2026 au soir (03-JOURNAL.md, l. 164).
        total += vers_centimes(k * t * q, f"indemnite kilometrique, trajet {i + 1}", ["R-IND-04"])
        km_total += k
    return resultat_ok(indemnite_kilometrique_mois.regles,
                       {"indemnite_centimes": vers_centimes(total, "indemnite kilometrique du mois", ["R-IND-04"]),
                        "km_total": texte_fraction(km_total)}, provisoire=prov)
