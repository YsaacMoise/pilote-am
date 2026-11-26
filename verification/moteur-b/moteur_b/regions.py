"""T-077 (MB7) : region du contrat (Alsace-Moselle, Mayotte).

Specification : regles/t077-decisions.md (R0 a R4), textes et sources dans
regles/t077-alsace-moselle.md et regles/t077-mayotte.md (depot calculateur-arvela).
Le code du moteur A n'a pas ete lu.

Regions (R0) : « metropole » (valeur par defaut), « alsace_moselle » (57, 67, 68),
« mayotte » (976). Critere : lieu ou l'AM accueille l'enfant (CSS L325-1 II 1°).
Les autres departements d'outre-mer restent hors perimetre du moteur B (aucune
regle de feries locaux relue pour eux).

Points a confirmer (question DDETS) : le moteur ne choisit jamais. Il refuse avec
un code A77-xxx et donne les deux lectures dans details (cle « lectures »).
"""

from datetime import date, timedelta
from fractions import Fraction

from .commun import NonGere, ErreurSaisie, DATE_DERNIERE_VERIFICATION, api, resultat_ok, entier
from .calendrier import paques

REGIONS = ("metropole", "alsace_moselle", "mayotte")


def region_valide(region):
    """None ou absent : metropole. Valeurs : metropole, alsace_moselle, mayotte."""
    if region is None:
        return "metropole"
    if region not in REGIONS:
        raise ErreurSaisie("region : « metropole », « alsace_moselle » ou « mayotte ».")
    return region


def region_du_departement(departement):
    """R0 : 57, 67, 68 -> alsace_moselle ; 976 -> mayotte ; autre departement
    a deux chiffres (ou 2A, 2B) -> metropole ; autre outre-mer -> None (hors B)."""
    dep = str(departement).strip().upper()
    if dep in ("57", "67", "68"):
        return "alsace_moselle"
    if dep == "976":
        return "mayotte"
    if len(dep) == 3 and dep.isdigit():
        return None
    return "metropole"


# ------------------------------------------------------------------ R3 : feries locaux

def feries_locaux(annee, region):
    """Feries propres a la region, objets de la question DDETS (R3) : {date: nom}.
    Alsace-Moselle : C. trav. L3134-13, 2° et 12° (Vendredi saint, second jour de
    Noel) ; Mayotte : C. trav. L3422-2, 1° (27 avril). Metropole : aucun.
    Le Vendredi saint vaut pour toute AM d'Alsace-Moselle (R3 ne retient pas la
    sous-lecture « commune ayant un temple protestant »)."""
    region_valide(region)
    # T-103 (R1, R4) : plus aucun ferie « a confirmer ». Alsace-Moselle : Vendredi saint et 26 decembre ne sont pas
    # feries pour l'AM (L3134-1, al. 2) : jours ordinaires. Mayotte : le 27 avril est un ferie legal (L3422-2),
    # dans calendrier.jours_feries(annee, "mayotte"). Les refus A77-FERIE-* ne sont donc plus emis.
    return {}


def feries_locaux_entre(a, b, region):
    out = {}
    for y in range(a.year - 1, b.year + 2):
        out.update(feries_locaux(y, region))
    return out


def est_ferie_local(d, region):
    return d in feries_locaux(d.year, region)


MESSAGE_FERIE_LOCAL = ("Paye si c'est un jour ferie (lecture A, CCN art. 47.2, sauf absence non autorisee de l'AM "
                       "le jour prevu avant ou apres) ; sinon paye seulement si ce sont les parents qui n'ont pas "
                       "confie l'enfant (lecture B, CCN art. 105 al. 1), retenu si l'AM a ferme.")
MESSAGE_MAINTIEN = ("Lecture A (C. trav. L1226-23) : les parents doivent ce montant moins les indemnites journalieres "
                    "de la securite sociale (releve de la CPAM). Lecture B (CCN annexe 3 art. 3.1, CASF L423-2) : "
                    "rien (retenue).")


# ------------------------------------------------------------------ R1 : part du net dans le brut

# (region, debut, fin, part en pour-dix-mille, source)
PART_NET_BRUT = [
    ("metropole", None, None, 7810, "Estimation de l'app, inchangee (t077-decisions R1)"),
    ("alsace_moselle", None, date(2022, 3, 31), 7660,
     "7 810 - 150 : cotisation du regime local 1,50 % jusqu'a mars 2022 (regime-local.fr, article du 21/12/2021 ; "
     "CSS L242-13 ; t077-alsace-moselle point 1.2 ; t077-decisions R1, lecture « periodes d'emploi »)"),
    ("alsace_moselle", date(2022, 4, 1), None, 7680,
     "7 810 - 130 : cotisation du regime local 1,30 % a partir d'avril 2022 (CA du 16/12/2021 ; Urssaf, taux "
     "salariaux de l'AM au 01/01/2026 ; t077-alsace-moselle point 1.2 ; t077-decisions R1)"),
    ("mayotte", None, None, 8820,
     "100 % - 11,80 % : somme des taux salariaux Urssaf de l'AM a Mayotte au 01/01/2026 (0,75 + 5,54 + 4,47 + "
     "1,04) ; une seule part pour toutes les periodes, estimation (t077-mayotte point 4.a ; t077-decisions R1)"),
]


def part_net_brut(region, d):
    """Part du net dans le brut (pour-dix-mille) pour le mois de salaire d (R1)."""
    region = region_valide(region)
    if not isinstance(d, date):
        raise ErreurSaisie("date du mois de salaire attendue (datetime.date).")
    m = date(d.year, d.month, 1)
    for r, debut, fin, part, src in PART_NET_BRUT:
        if r == region and (debut is None or m >= debut) and (fin is None or m <= fin):
            return part, src
    raise ErreurSaisie("part net/brut introuvable.")  # pragma: no cover


# ------------------------------------------------------------------ T-115 (R3) : net -> brut, F1 et F2
# Source : regles/t115-net-brut.md (depot calculateur-arvela), rapport du juriste du 26/11/2026.
# Le code du moteur A n'a pas ete lu.

DEBUT_T115 = date(2024, 1, 1)  # § 2.5 et A5 : taux 2026 retenus par concordance des nets publies en 2024 et 2025
FIN_TAUX_CONNUS = date(2026, 12, 31)  # § 2.1 : taux « au 1er janvier 2026 » ; apres 2026 : resultat provisoire

# § 2.1 (tableau Urssaf « Taux salariaux applicables aux assistants maternels agrees », au 01/01/2026) et § 5.2.
# (libelle, taux en fraction, assiette en fraction du brut). Une ligne = un arrondi au centime (§ 5.2, 5.4).
ASSIETTE_CSG = Fraction(9825, 10000)  # § 2.3 : 98,25 % du brut
LIGNES_SALARIALES = [
    ("vieillesse plafonnee", Fraction(690, 10000), Fraction(1)),
    ("vieillesse deplafonnee", Fraction(40, 10000), Fraction(1)),
    ("Ircem retraite complementaire T1", Fraction(315, 10000), Fraction(1)),
    ("CEG T1", Fraction(86, 10000), Fraction(1)),
    ("prevoyance", Fraction(104, 10000), Fraction(1)),               # § 2.2 : CCN annexe 3, annexe B
    ("CSG non imposable", Fraction(680, 10000), ASSIETTE_CSG),
    ("CSG imposable et CRDS", Fraction(290, 10000), ASSIETTE_CSG),  # § 5.2 : UNE seule ligne a 2,90 %
]
# § 2.1 (derniere ligne) et § 0 : regime local d'Alsace-Moselle, sur le brut total, 1,50 % avant avril 2022.
DEBUT_REGIME_LOCAL_130 = date(2022, 4, 1)

_SRC_F1 = ("T-115 F1 (regles/t115-net-brut.md § 5.2, 5.4) : arrondi au centime le plus proche, demi vers le haut, "
           "de net / part nette ; part nette = 1 - {taux} % (taux salariaux Urssaf au 01/01/2026, § 2.1 ; "
           "memes taux en 2024 et 2025 par concordance des nets publies, § 2.5 et A5) ; formule lue dans les "
           "17 sorties du convertisseur officiel Urssaf (§ 3.3).")


def lignes_salariales(region, d):
    """Lignes du § 2.1 pour la region et le mois d : liste de (libelle, taux, assiette)."""
    lignes = list(LIGNES_SALARIALES)
    if region == "alsace_moselle":
        t = Fraction(130, 10000) if d >= DEBUT_REGIME_LOCAL_130 else Fraction(150, 10000)
        lignes.append(("regime local Alsace-Moselle", t, Fraction(1)))
    return lignes


def taux_salarial_global(region, d):
    """Somme des taux du § 2.1 (calcul de controle du rapport : 21,88025 % ; 23,18025 % en Alsace-Moselle)."""
    return sum((t * a for _, t, a in lignes_salariales(region, d)), Fraction(0))


def part_nette_t115(region, d):
    """Part nette exacte p = 1 - taux global (§ 5.2) : 0,7811975 ; Alsace-Moselle 0,7681975."""
    return 1 - taux_salarial_global(region, d)


def _arrondi_centime(x):
    """Centime le plus proche, demi vers le haut (§ 5.4 ; montants positifs)."""
    y = Fraction(x) + Fraction(1, 2)
    return y.numerator // y.denominator


def _texte_exact(f):
    """Fraction en ecriture decimale exacte (la fraction est decimale ici)."""
    f = Fraction(f)
    if f.denominator == 1:
        return str(f.numerator)
    k = 0
    while (f * 10 ** k).denominator != 1:
        k += 1
        if k > 12:
            return f"{f.numerator}/{f.denominator}"
    n = f * 10 ** k
    s = str(abs(n.numerator)).rjust(k + 1, "0")
    return ("-" if f < 0 else "") + s[:-k] + "." + s[-k:].rstrip("0")


def _date_t115(d):
    if not isinstance(d, date):
        raise ErreurSaisie("date du mois de salaire attendue (datetime.date).")
    return date(d.year, d.month, 1)


def _perimetre_t115(region, d):
    """F2 et net ligne par ligne : refus avant le 01/01/2024 (A5 : taux de 2022 et 2023 non relus) et a Mayotte
    (A4 : aucun brut sur au centime)."""
    if region == "mayotte":
        raise NonGere("T115-MAYOTTE", ["T115-F2"], precision=f"Date {d.isoformat()}.")
    if d < DEBUT_T115:
        raise NonGere("T115-AVANT-2024", ["T115-F2"], precision=f"Date {d.isoformat()}.")


@api("T077-R1", "T115-F1")
def brut_depuis_net(net_centimes, d, region="metropole"):
    """Brut depuis le net (mois de salaire d).
    - A partir du 01/01/2024, metropole et Alsace-Moselle : F1 du rapport T-115 (§ 5.2, 5.4), brut = arrondi au
      centime le plus proche (demi vers le haut) de net / p, p = 1 - 21,88025 % (Alsace-Moselle 1 - 23,18025 %),
      une seule division exacte, aucun arrondi intermediaire. C'est la sortie du convertisseur officiel (§ 3.3) et,
      tres probablement, le brut du bulletin Pajemploi (§ 3.5, A1, non prouve).
    - Avant le 01/01/2024, et a Mayotte (A4) : estimation T-077 R1 inchangee (part en pour-dix-mille, meme arrondi).
    Sortie : brut_estime_centimes, part_net_pour_dix_mille (entier ; chaine exacte pour F1), source, estimation.
    Au-dela du plafond mensuel (4 005 EUR brut en 2026, § 4.3, 5.4, A6) : note « a verifier sur le bulletin »."""
    n = entier(net_centimes, "net_centimes", -10 ** 12)
    region = region_valide(region)
    m = _date_t115(d)
    if region == "mayotte" or m < DEBUT_T115:
        part, src = part_net_brut(region, d)
        x = Fraction(n * 10000, part) + Fraction(1, 2)
        brut = x.numerator // x.denominator
        return resultat_ok(["T077-R1"], {"brut_estime_centimes": brut, "part_net_pour_dix_mille": part,
                                         "source": src, "estimation": True})
    p = part_nette_t115(region, m)
    taux = taux_salarial_global(region, m)
    brut = _arrondi_centime(Fraction(n) / p)
    notes = []
    if m.year == 2026 and brut > 400500:
        notes.append("Brut au-dela du plafond mensuel de la securite sociale (4 005 EUR en 2026) : ni F1 ni F2 ne "
                     "valent, a verifier sur le bulletin (t115-net-brut.md § 4.3, 5.4, A6).")
    res = {"brut_estime_centimes": brut, "part_net_pour_dix_mille": _texte_exact(p * 10000),
           "part_nette": _texte_exact(p), "taux_salarial_pour_cent": _texte_exact(taux * 100),
           "source": _SRC_F1.format(taux=_texte_exact(taux * 100).replace(".", ",")), "estimation": True,
           "methode": "F1"}
    return resultat_ok(["T115-F1"], res, provisoire=m > FIN_TAUX_CONNUS, notes=notes or None)


def _net_ligne_par_ligne(brut, region, d):
    cotis = [(lib, _arrondi_centime(brut * t * a)) for lib, t, a in lignes_salariales(region, d)]
    return brut - sum(c for _, c in cotis), cotis


@api("T115-F2")
def net_ligne_par_ligne(brut_centimes, d, region="metropole"):
    """Net d'un brut, chaque cotisation du § 2.1 arrondie au centime le plus proche (demi vers le haut), puis
    retiree du brut (t115-net-brut.md § 3.3 fin, § 5.2, 5.4). Lignes : 6,90 ; 0,40 ; 3,15 ; 0,86 ; 1,04 % du
    brut ; 6,80 % et 2,90 % (une ligne) de 98,25 % du brut ; Alsace-Moselle 1,30 % du brut (1,50 % avant avril
    2022). Plafond de la securite sociale non applique (montant horaire, § 4.3). Refus avant 2024 et a Mayotte.
    Sortie : net_centimes, cotisations (libelle -> centimes)."""
    b = entier(brut_centimes, "brut_centimes")
    region = region_valide(region)
    m = _date_t115(d)
    _perimetre_t115(region, m)
    net, cotis = _net_ligne_par_ligne(b, region, m)
    return resultat_ok(net_ligne_par_ligne.regles, {"net_centimes": net, "cotisations": dict(cotis)},
                       provisoire=m > FIN_TAUX_CONNUS)


@api("T115-F2")
def brut_horaire_depuis_net(net_centimes, d, region="metropole"):
    """Brut HORAIRE depuis le net horaire : F2 du rapport T-115 (§ 5.2, 5.3 point 1, 5.4). Le brut b, au centime,
    tel que net_ligne_par_ligne(b) = net ; s'il y en a plusieurs, le plus proche de net / p ; s'il n'y en a aucun,
    F1. Egalite de distance (jamais observee, § 5.2) : le plus grand, comme l'arrondi demi vers le haut de F1.
    Recherche : chaque ligne s'ecarte de moins d'un demi-centime de sa valeur exacte, donc
    |net_ligne_par_ligne(b) - b x p| <= 8 x 1/2 = 4 centimes, et |b - net/p| <= 4 / 0,76 < 6 : on essaie
    net/p +- 8 centimes. Refus avant le 01/01/2024 (A5) et a Mayotte (A4), sans estimation.
    Sortie : brut_horaire_centimes, methode (F2 ou F1), antecedents (tous les b trouves), brut_f1_centimes."""
    n = entier(net_centimes, "net_centimes")
    region = region_valide(region)
    m = _date_t115(d)
    _perimetre_t115(region, m)
    p = part_nette_t115(region, m)
    c = Fraction(n) / p
    bas = c.numerator // c.denominator
    antecedents = [b for b in range(max(0, bas - 8), bas + 10) if _net_ligne_par_ligne(b, region, m)[0] == n]
    f1 = _arrondi_centime(c)
    if antecedents:
        brut = min(antecedents, key=lambda b: (abs(b - c), -b))
        methode = "F2"
    else:
        brut, methode = f1, "F1"
    return resultat_ok(brut_horaire_depuis_net.regles,
                       {"brut_horaire_centimes": brut, "methode": methode, "antecedents": antecedents,
                        "brut_f1_centimes": f1, "part_nette": _texte_exact(p),
                        "source": "T-115 F2 (regles/t115-net-brut.md § 5.2, 5.3, 5.4) : brut inverse du net ligne par "
                                  "ligne (taux Urssaf au 01/01/2026, § 2.1) ; deduit des sorties officielles, non "
                                  "publie (A2)."},
                       provisoire=m > FIN_TAUX_CONNUS)


# ------------------------------------------------------------------ R2 : repere net du minimum

_SRC_URSSAF = ("Urssaf, « Remunerer un salarie a domicile ou un assistant maternel », tableau « Salaire horaire "
               "minimum pour l'emploi d'un assistant maternel », mis a jour le 01/06/2026 "
               "(t077-alsace-moselle 1.5 ; t077-mayotte point 3 ; t077-decisions R2)")
REPERE_NET = [
    (date(2025, 1, 1), date(2025, 3, 31), {"metropole": 274, "alsace_moselle": 269, "mayotte": 308}),
    (date(2025, 4, 1), date(2026, 5, 31), {"metropole": 286, "alsace_moselle": 281, "mayotte": 321}),
    (date(2026, 6, 1), None, {"metropole": 328, "alsace_moselle": 323, "mayotte": 370}),
]


@api("T077-R2")
def repere_net_minimum(d, region="metropole"):
    """Repere net Urssaf du minimum horaire de l'AM (R2), valeur publiee (pas une
    conversion). Avant le 01/01/2025 : aucun repere (refus REPERE-NET-ABSENT).
    Sortie : repere_net_centimes."""
    region = region_valide(region)
    if not isinstance(d, date):
        raise ErreurSaisie("date attendue.")
    for debut, fin, v in REPERE_NET:
        if d >= debut and (fin is None or d <= fin):
            return resultat_ok(repere_net_minimum.regles, {"repere_net_centimes": v[region], "source": _SRC_URSSAF},
                               provisoire=d > DATE_DERNIERE_VERIFICATION)
    raise NonGere("REPERE-NET-ABSENT", ["T077-R2"], precision=f"Date {d.isoformat()}.")


# R2 : SMIC horaire brut de Mayotte (C. trav. L3423-1 a L3423-4), en centimes. Memes textes de
# relevement que la metropole (2° de l'article du SMIC), relus par le juriste (t077-mayotte point 2).
SMIC_MAYOTTE = [
    (date(2022, 1, 1), date(2022, 4, 30), 798, "Decret n° 2021-1741 du 22/12/2021, art. 1er, 2°"),
    (date(2022, 5, 1), date(2022, 7, 31), 819, "Arrete du 19/04/2022"),
    (date(2022, 8, 1), date(2022, 12, 31), 835, "Arrete du 29/07/2022"),
    (date(2023, 1, 1), date(2023, 4, 30), 851, "Decret n° 2022-1608 du 22/12/2022"),
    (date(2023, 5, 1), date(2023, 12, 31), 870, "Arrete du 26/04/2023"),
    (date(2024, 1, 1), date(2024, 10, 31), 880, "Decret n° 2023-1216 du 20/12/2023"),
    (date(2024, 11, 1), date(2025, 12, 31), 898, "Decret n° 2024-951 du 23/10/2024"),
    (date(2026, 1, 1), date(2026, 5, 31), 933, "Decret n° 2025-1228 du 17/12/2025"),
    (date(2026, 6, 1), None, 956, "Arrete du 22/05/2026, JORF du 24/05/2026"),
]
