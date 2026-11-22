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
    region = region_valide(region)
    if region == "alsace_moselle":
        return {paques(annee) - timedelta(days=2): "Vendredi saint", date(annee, 12, 26): "26 decembre"}
    if region == "mayotte":
        return {date(annee, 4, 27): "27 avril (abolition de l'esclavage)"}
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


@api("T077-R1")
def brut_depuis_net(net_centimes, d, region="metropole"):
    """Brut ESTIME depuis le net (R1) : arrondi(net x 10 000 / part), demi-centime
    vers le haut. C'est une convention d'estimation retenue par la direction (le
    moteur B ne convertit toujours pas le brut en net, A-34) ; elle sert a
    l'assiette en brut du 1/80 (CCN art. 121.1) quand le bulletin n'est pas saisi.
    Sortie : brut_estime_centimes, part_net_pour_dix_mille, source."""
    n = entier(net_centimes, "net_centimes", -10 ** 12)
    part, src = part_net_brut(region, d)
    x = Fraction(n * 10000, part) + Fraction(1, 2)
    brut = x.numerator // x.denominator
    return resultat_ok(brut_depuis_net.regles, {"brut_estime_centimes": brut, "part_net_pour_dix_mille": part,
                                                "source": src, "estimation": True})


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
