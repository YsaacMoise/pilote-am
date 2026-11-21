"""Baremes dates du moteur B, avec leur source.

Valeurs recopiees de regles-v0.md corrige par contre-verification-v0.md.
Une periode dont la fin vaut None est ouverte : apres DATE_DERNIERE_VERIFICATION
(18/11/2026), son usage rend le resultat « provisoire ».
SMIC et MG : a partir du 1er decembre 2026, refus A-52 (hausse annoncee, texte
non publie au 18/11/2026).
"""

from datetime import date
from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, DATE_DERNIERE_VERIFICATION, api, resultat_ok,
    exact, texte_fraction,
)

DEBUT_A52 = date(2026, 12, 1)

# R-SAL-01 : SMIC horaire brut metropole, en centimes.
# T-040 (MB5) : periodes 2022 a 2025 ajoutees ; chaque texte relu sur Legifrance le
# 18/11/2026 (article du SMIC en metropole et article du MG). Aucun texte de relevement
# entre le decret n° 2024-951 et le decret n° 2025-1228 : ce dernier porte le SMIC a
# 12,02 EUR « (augmentation de 1,18 %) » et le MG a 4,25 EUR au 1er janvier 2026, ce qui
# part de 11,88 EUR ; 11,88 EUR et 4,22 EUR valent donc du 01/11/2024 au 31/12/2025.
_D2021_1741 = "Decret n° 2021-1741 du 22/12/2021, JORF n° 0298 du 23/12/2021, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000044546647"
_A2022_04 = "Arrete du 19/04/2022, JORF n° 0092 du 20/04/2022, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045602317"
_A2022_07 = "Arrete du 29/07/2022, JORF n° 0175 du 30/07/2022, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000046113517"
_D2022_1608 = "Decret n° 2022-1608 du 22/12/2022, JORF n° 0297 du 23/12/2022, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000046780043"
_A2023_04 = "Arrete du 26/04/2023, JORF n° 0099 du 27/04/2023, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047495817"
_D2023_1216 = "Decret n° 2023-1216 du 20/12/2023, JORF n° 0295 du 21/12/2023, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000048604676"
_D2024_951 = "Decret n° 2024-951 du 23/10/2024, JORF n° 0253 du 24/10/2024, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000050392683"

SMIC = [
    (date(2022, 1, 1), date(2022, 4, 30), 1057, _D2021_1741 + " (art. 1er, 1°)"),
    (date(2022, 5, 1), date(2022, 7, 31), 1085, _A2022_04 + " (art. 2, 1°)"),
    (date(2022, 8, 1), date(2022, 12, 31), 1107, _A2022_07 + " (art. 2, 1°)"),
    (date(2023, 1, 1), date(2023, 4, 30), 1127, _D2022_1608 + " (art. 1er, 1°)"),
    (date(2023, 5, 1), date(2023, 12, 31), 1152, _A2023_04 + " (art. 2, 1°)"),
    (date(2024, 1, 1), date(2024, 10, 31), 1165, _D2023_1216 + " (art. 1er, 1°)"),
    (date(2024, 11, 1), date(2025, 12, 31), 1188, _D2024_951 + " (art. 1er, 1°)"),
    (date(2026, 1, 1), date(2026, 5, 31), 1202,
     "Decret n° 2025-1228 du 17/12/2025, JORF n° 0296 du 18/12/2025, "
     "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053042520"),
    (date(2026, 6, 1), None, 1231,
     "Arrete du 22/05/2026, art. 1, 1°, JORF n° 0121 du 24/05/2026, "
     "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054126589"),
]

# R-SAL-02 et M-03 : minimum garanti (MG), en centimes.
MG = [
    (date(2022, 1, 1), date(2022, 4, 30), 376, _D2021_1741 + " (art. 2)"),
    (date(2022, 5, 1), date(2022, 7, 31), 386, _A2022_04 + " (art. 3)"),
    (date(2022, 8, 1), date(2022, 12, 31), 394, _A2022_07 + " (art. 3)"),
    (date(2023, 1, 1), date(2023, 4, 30), 401, _D2022_1608 + " (art. 2)"),
    (date(2023, 5, 1), date(2023, 12, 31), 410, _A2023_04 + " (art. 3)"),
    (date(2024, 1, 1), date(2024, 10, 31), 415, _D2023_1216 + " (art. 2)"),
    (date(2024, 11, 1), date(2025, 12, 31), 422, _D2024_951 + " (art. 2)"),
    (date(2026, 1, 1), date(2026, 5, 31), 425,
     "Decret n° 2025-1228 du 17/12/2025 (notice), "
     "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053042520"),
    (date(2026, 6, 1), None, 435,
     "Arrete du 22/05/2026, art. 2, "
     "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054126589"),
]

# R-SAL-04 : minimum conventionnel horaire brut (annexe 5 CCN), en centimes.
# T-040 (MB5) : periodes 2022 a mars 2025 ajoutees. Annexe 5, article 1er, de chaque texte
# relu sur Legifrance (KALI) le 18/11/2026. Date d'effet : article 2 de chaque avenant,
# « applicable a compter du premier jour calendaire du mois suivant la date de parution
# de l'arrete d'extension au Journal officiel ». Texte de base : CCN applicable au
# 01/01/2022 (DATE_APPLICATION_CCN). Du 01/01/2025 au 31/03/2025 : avenant n° 8 (3,50 EUR),
# l'avenant n° 9 ne s'appliquant qu'au 01/04/2025 (JORF du 18/03/2025).
_AV = {
    0: ("Annexe 5 du texte de base (CCN du 15/03/2021, etendue par arrete du 06/10/2021)", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000043941642"),
    1: ("Avenant n° 1 du 18/02/2022, etendu par arrete du 23/05/2022, JORF du 14/06/2022", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000045971813"),
    2: ("Avenant n° 2 du 13/05/2022, etendu par arrete du 11/08/2022, JORF du 23/08/2022", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000046226089"),
    3: ("Avenant n° 3 du 15/09/2022, etendu par arrete du 09/11/2022, JORF du 23/11/2022", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000046657163"),
    4: ("Avenant n° 4 du 08/12/2022, etendu par arrete du 21/02/2023, JORF du 01/03/2023", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000047348972"),
    5: ("Avenant n° 5 du 27/01/2023, etendu par arrete du 12/04/2023, JORF du 18/04/2023", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000047416429"),
    6: ("Avenant n° 6 du 17/05/2023, etendu par arrete du 25/07/2023, JORF du 02/08/2023", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000047951859"),
    7: ("Avenant n° 7 du 16/10/2023, etendu par arrete du 15/01/2024, JORF du 24/01/2024", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000048805348"),
    8: ("Avenant n° 8 du 15/01/2024, etendu par arrete du 15/04/2024, JORF du 26/04/2024", "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000049366674"),
}
# (debut, fin, avenant, sans titre, avec titre AM-GE) ; valeurs ecrites dans le tableau de l'art. 1er.
_GRILLE_ANCIENNE = [
    (date(2022, 1, 1), date(2022, 6, 30), 0, 297, 306),   # titre : 3 %
    (date(2022, 7, 1), date(2022, 8, 31), 1, 306, 318),   # titre : 4 % a partir de l'avenant n° 1
    (date(2022, 9, 1), date(2022, 11, 30), 2, 317, 330),
    (date(2022, 12, 1), date(2023, 3, 31), 3, 320, 333),
    (date(2023, 4, 1), date(2023, 4, 30), 4, 326, 339),
    (date(2023, 5, 1), date(2023, 8, 31), 5, 336, 349),
    (date(2023, 9, 1), date(2024, 1, 31), 6, 343, 357),
    (date(2024, 2, 1), date(2024, 4, 30), 7, 345, 359),
    (date(2024, 5, 1), date(2025, 3, 31), 8, 350, 364),
]


def _src_av(n, titre):
    nom, url = _AV[n]
    return f"{nom}, annexe 5 art. 1er{' (titre AM-GE)' if titre else ''}, {url}"


MINIMUM_CONVENTIONNEL = [
    *[(db, fn, v, _src_av(n, False)) for db, fn, n, v, _ in _GRILLE_ANCIENNE],
    (date(2025, 4, 1), date(2026, 5, 31), 364,
     "Avenant n° 9 du 25/11/2024 (annexe 5), etendu par arrete du 25/02/2025, JORF du 18/03/2025, "
     "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000051315265/ ; Urssaf « Remunerer »"),
    (date(2026, 6, 1), None, 420,
     "Avenant n° 10 du 05/02/2026, art. 1er, etendu par arrete du 04/05/2026, JORF du 08/05/2026, "
     "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000054254151/"),
]

# R-SAL-05 : minimum avec titre AM-AP (ex AM-GE), majore de 4 %, en centimes.
MINIMUM_CONVENTIONNEL_TITRE = [
    *[(db, fn, vt, _src_av(n, True)) for db, fn, n, _, vt in _GRILLE_ANCIENNE],
    (date(2025, 4, 1), date(2026, 5, 31), 379,
     "Avenant n° 9 du 25/11/2024 (titre AM-GE, + 4 %), "
     "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000051315265/"),
    (date(2026, 6, 1), None, 437,
     "Avenant n° 10 du 05/02/2026, art. 1er (titre AM-AP, + 4 %), "
     "https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000054254151/"),
]

# R-IND-04 corrigee : bareme kilometrique de l'administration (plancher), en centimes par km.
# Cles : classe de puissance -> (jusqu'a 2 000 km, 2 001 a 10 000 km, au-dela de 10 000 km).
_KM_BASE = {"5cv_et_moins": (32, 40, 23), "6_7cv": (41, 51, 30), "8cv_et_plus": (45, 55, 32)}
_KM_MAJORE = {"5cv_et_moins": (33, 41, 24), "6_7cv": (42, 53, 31), "8cv_et_plus": (46, 57, 33)}
_SRC_KM_BASE = ("Arrete du 03/07/2006 consolide, art. 1er, modifie par l'arrete du 14/03/2022 (art. 2 : "
                "en vigueur au 01/01/2022), https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000792695")
_SRC_KM_MAJORE = ("Arrete du 29/05/2026 portant majoration temporaire, JORF n° 0126 du 31/05/2026, "
                  "https://www.legifrance.gouv.fr/loda/id/JORFTEXT000054154617")
BAREME_KM = [
    (date(2022, 1, 1), date(2026, 5, 31), _KM_BASE, _SRC_KM_BASE),
    (date(2026, 6, 1), date(2026, 12, 31), _KM_MAJORE, _SRC_KM_MAJORE),
    # Contre-verification : « Retour au bareme de base au 1er janvier 2027 sauf nouveau texte ».
    (date(2027, 1, 1), None, _KM_BASE, _SRC_KM_BASE + " (retour au bareme de base, contre-verification R-IND-04)"),
]

# R-IND-02 : plancher journalier de l'indemnite d'entretien, en centimes.
PLANCHER_ENTRETIEN_JOURNALIER = 265  # CCN art. 114.1


def _chercher(table, d, nom, regle, soumis_a52=False):
    """Renvoie (valeur, source, provisoire). Refus si aucune periode."""
    if not isinstance(d, date):
        raise ErreurSaisie(f"{nom} : une date (datetime.date) est attendue.", [regle])
    if soumis_a52 and d >= DEBUT_A52:
        raise NonGere("A-52", [regle], precision=f"{nom} au {d.isoformat()}.")
    for ligne in table:
        debut, fin, valeur, source = ligne
        if d >= debut and (fin is None or d <= fin):
            provisoire = d > DATE_DERNIERE_VERIFICATION
            return valeur, source, provisoire
    raise NonGere("BAREME-ABSENT", [regle], precision=f"{nom} au {d.isoformat()}.")


def smic(d):
    # R-SAL-01
    return _chercher(SMIC, d, "SMIC horaire brut", "R-SAL-01", soumis_a52=True)


def minimum_garanti(d):
    # R-SAL-02, M-03
    return _chercher(MG, d, "Minimum garanti", "R-SAL-02", soumis_a52=True)


def minimum_conventionnel(d, titre_am_ap=False):
    # R-SAL-04, R-SAL-05
    if titre_am_ap:
        return _chercher(MINIMUM_CONVENTIONNEL_TITRE, d, "Minimum conventionnel avec titre", "R-SAL-05")
    return _chercher(MINIMUM_CONVENTIONNEL, d, "Minimum conventionnel", "R-SAL-04")


def bareme_km(d):
    # R-IND-04 (corrigee)
    return _chercher(BAREME_KM, d, "Bareme kilometrique de l'administration", "R-IND-04")


@api("R-SAL-01", "R-SAL-02", "R-SAL-03", "R-SAL-04", "R-SAL-05")
def baremes_du_jour(d, titre_am_ap=False):
    """Affiche les baremes applicables a une date, avec leur source.
    Entree : d (datetime.date), titre_am_ap (bool).
    Sortie : smic, mg, minimum_legal_exact (0,281 x SMIC, R-SAL-03, non arrondi),
    minimum_conventionnel, minimum_applicable (le plus eleve, R-SAL-04)."""
    s, src_s, p1 = smic(d)
    g, src_g, p2 = minimum_garanti(d)
    c, src_c, p3 = minimum_conventionnel(d, titre_am_ap)
    legal = Fraction(281, 1000) * s  # R-SAL-03 (CASF D423-9)
    applicable = max(legal, Fraction(c))
    res = {
        "smic_centimes": s, "source_smic": src_s,
        "mg_centimes": g, "source_mg": src_g,
        "minimum_legal_exact_centimes": texte_fraction(legal),
        "minimum_conventionnel_centimes": c, "source_minimum_conventionnel": src_c,
        "minimum_applicable_exact_centimes": texte_fraction(applicable),
    }
    return resultat_ok(baremes_du_jour.regles, res, provisoire=p1 or p2 or p3)


@api("R-SAL-01", "R-SAL-03", "R-SAL-04", "R-SAL-05", "R-SAL-06")
def minimum_horaire_brut(d, titre_am_ap=False, titre_obtenu_dans_le_mois=False):
    """Minimum horaire brut applicable (R-SAL-04 : max(minimum legal ; minimum
    conventionnel)). Entree : d, titre_am_ap, titre_obtenu_dans_le_mois.
    Sortie : minimum_centimes (entier si exact), composantes et sources.
    Le minimum legal 0,281 x SMIC n'est jamais arrondi : il n'est utilise que
    pour la comparaison exacte."""
    if titre_obtenu_dans_le_mois:
        raise NonGere("A-54", ["R-SAL-05"])
    c, src_c, p_c = minimum_conventionnel(d, titre_am_ap)
    s, src_s, p_s = smic(d)
    legal = Fraction(281, 1000) * s
    mini = max(legal, Fraction(c))
    if mini == c:
        valeur = c
    else:
        # Le minimum legal l'emporte : son arrondi n'est pas ecrit (R-SAL-03).
        from .commun import vers_centimes
        valeur = vers_centimes(mini, "minimum legal 0,281 x SMIC", ["R-SAL-03"])
    res = {
        "minimum_centimes": valeur,
        "origine": "conventionnel" if mini == c else "legal",
        "minimum_legal_exact_centimes": texte_fraction(legal),
        "source_minimum_conventionnel": src_c,
        "source_smic": src_s,
    }
    return resultat_ok(minimum_horaire_brut.regles, res, provisoire=p_c or p_s)


@api("R-SAL-01", "R-SAL-03", "R-SAL-04", "R-SAL-05", "R-SAL-06")
def verifier_taux_horaire(taux_horaire_brut_centimes, d, titre_am_ap=False, titre_obtenu_dans_le_mois=False):
    """Controle du taux horaire brut du contrat face au minimum (R-SAL-04).
    Sortie : conforme (bool). Si le SMIC est inconnu (A-52), le moteur conclut
    seulement quand le taux est inferieur au minimum conventionnel connu."""
    t = exact(taux_horaire_brut_centimes, "taux_horaire_brut_centimes")
    if titre_obtenu_dans_le_mois:
        raise NonGere("A-54", ["R-SAL-05"])
    c, src_c, p_c = minimum_conventionnel(d, titre_am_ap)
    try:
        s, src_s, p_s = smic(d)
    except NonGere:
        if t < c:
            return resultat_ok(verifier_taux_horaire.regles,
                               {"conforme": False, "minimum_conventionnel_centimes": c,
                                "raison": "taux inferieur au minimum conventionnel, quel que soit le SMIC"},
                               provisoire=p_c)
        raise
    legal = Fraction(281, 1000) * s
    mini = max(legal, Fraction(c))
    return resultat_ok(verifier_taux_horaire.regles,
                       {"conforme": t >= mini, "minimum_exact_centimes": texte_fraction(mini),
                        "source_minimum_conventionnel": src_c, "source_smic": src_s},
                       provisoire=p_c or p_s)


# T-027. Bareme fiscal (plafond de l'indemnite kilometrique, CCN art. 57).
# CGI annexe IV art. 6 B, I, tarif applicable aux automobiles, version en vigueur
# depuis le 08/04/2023 (arrete du 27/03/2023), applicable « a compter de
# l'imposition des revenus de l'annee 2022 » ; II : vehicules electriques, montant
# majore de 20 %. Valeurs en euros par km recopiees en millimes d'euro (0,529 -> 529)
# et forfaits en euros. Cle : puissance administrative (CV).
# Chaque ligne : (coef jusqu'a 5 000 km, (coef, forfait) de 5 001 a 20 000 km, coef au-dela de 20 000 km).
_FISCAL_AUTO = {
    3: (529, (316, 1065), 370),   # « 3 CV et moins »
    4: (606, (340, 1330), 407),
    5: (636, (357, 1395), 427),
    6: (665, (374, 1457), 447),
    7: (697, (394, 1515), 470),   # « 7 CV et plus »
}
_SRC_FISCAL = ("CGI annexe IV art. 6 B (version en vigueur depuis le 08/04/2023, arrete du 27/03/2023), "
               "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047417683")
DEBUT_FISCAL = date(2022, 1, 1)       # « imposition des revenus de l'annee 2022 »
# Le bareme de l'annee N est fixe pour l'imposition des revenus de N, publie en N+1
# (le texte en vigueur date de 2023 et s'applique depuis les revenus 2022). Pour une
# annee dont l'imposition n'est pas encore faite, un nouveau texte reste possible :
# resultat « provisoire ».
PREMIERE_ANNEE_FISCALE_OUVERTE = 2026


def bareme_fiscal_auto(d, puissance_cv, electrique=False):
    """Plafond par km du bareme fiscal, en centimes par km, pour chaque lecture
    de la distance annuelle d (inconnue du moteur). Renvoie (bornes, source,
    provisoire) avec bornes = (minimum, maximum) exacts du cout moyen par km
    (montant du bareme / d) sur toutes les distances possibles."""
    if not isinstance(d, date):
        raise ErreurSaisie("date : un objet datetime.date est attendu.", ["R-IND-04"])
    if d < DEBUT_FISCAL:
        raise NonGere("BAREME-ABSENT", ["R-IND-04"], precision=f"Bareme fiscal au {d.isoformat()}.")
    cv = max(3, min(7, puissance_cv))
    c1, (c2, forfait), c3 = _FISCAL_AUTO[cv]
    # centimes par km : millimes d'euro / 10 ; forfait en euros -> centimes x 100
    t1 = Fraction(c1, 10)
    t3 = Fraction(c3, 10)
    # Tranche 2 : cout moyen = c2 + forfait / d, decroissant en d, d dans ]5 000 ; 20 000].
    t2_haut = Fraction(c2, 10) + Fraction(forfait * 100, 5000)    # borne superieure (non atteinte)
    t2_bas = Fraction(c2, 10) + Fraction(forfait * 100, 20000)
    lectures = [t1, t2_haut, t2_bas, t3]
    if electrique:
        lectures = [x * Fraction(6, 5) for x in lectures]
    provisoire = d.year >= PREMIERE_ANNEE_FISCALE_OUVERTE
    return (min(lectures), max(lectures)), _SRC_FISCAL, provisoire
