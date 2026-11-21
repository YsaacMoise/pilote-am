"""Conges pour evenements familiaux (T-027, R-ABS-06 corrigee).

Textes (lus en entier le 18/11/2026, voir moteur/B/T-027.md) :
- CCN IDCC 3239, art. 48.1.3.1.1 (version en vigueur et version remplacee),
  48.1.3.1.2, 48.1.3.1.3 ;
- Code du travail L3142-1, L3142-1-1, L3142-2, L3142-4 (versions du 19/12/2021,
  du 21/07/2023 et du 14/06/2026), applicables a l'AM par CASF L423-2, 12°.
L3142-4 fixe des durees qui « ne [peuvent] etre inferieure[s] » : la duree due
est la plus favorable de la CCN et de la loi a la date de l'evenement.
Toute lecture qui change le resultat donne un refus.
"""

from datetime import date, timedelta

from .commun import NonGere, ErreurSaisie, api, resultat_ok, verifier_date_ccn
from .calendrier import jours_feries

_SRC_CCN = ("CCN IDCC 3239 art. 48.1.3.1.1, "
            "https://www.legifrance.gouv.fr/conv_coll/id/KALISCTA000043941697?idConteneur=KALICONT000044594539")
_SRC_LOI = "Code du travail L3142-4 (CASF L423-2, 12°), https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054251220"

EVENEMENTS = (
    "mariage_pacs",            # mariage ou PACS de l'AM
    "mariage_pacs_enfant",     # mariage ou PACS d'un enfant
    "naissance",               # naissance survenue au foyer
    "adoption",                # arrivee d'un enfant place en vue de son adoption
    "deces_enfant",            # deces d'un enfant de 25 ans ou plus, qui n'etait pas parent
    "deces_enfant_majore",     # enfant de moins de 25 ans, enfant lui-meme parent, ou personne de moins de 25 ans a charge
    "deces_proche",            # conjoint, partenaire de PACS, concubin, pere, mere, beau-pere, belle-mere, frere, soeur
    "handicap_enfant",         # annonce d'un handicap, d'une pathologie chronique ou d'un cancer chez un enfant
    "deces_descendant",        # petit-enfant, arriere-petit-enfant
    "deces_ascendant",         # grand-parent, arriere-grand-parent
    "deuil_complementaire",    # conge de deuil (CCN 48.1.3.1.2, C. trav. L3142-1-1)
)

# CCN 48.1.3.1.1, en jours ouvrables.
_CCN_ANCIENNE = {"mariage_pacs": 4, "mariage_pacs_enfant": 1, "naissance": 3, "adoption": 3, "deces_enfant": 5,
                 "deces_enfant_majore": 9, "deces_proche": 3, "deces_descendant": 1, "deces_ascendant": 1,
                 "handicap_enfant": 2}
_CCN_NOUVELLE = dict(_CCN_ANCIENNE, deces_enfant=12, deces_enfant_majore=14, handicap_enfant=5)
# Version remplacee (« 2 jours ouvrables pour l'annonce de la survenue d'un handicap chez un enfant ») :
# elle ne vise pas la pathologie chronique ni le cancer. Pour ces cas, seule la loi s'applique.

# Entree en vigueur de la version nouvelle (avenant n° 4) : deux lectures
# (Legifrance : 16/10/2023 ; avenant art. 4 et JORF du 03/04/2024 : 01/05/2024).
_BASCULE_CCN = (date(2023, 10, 16), date(2024, 5, 1))

# L3142-4, en jours ouvrables (dernier alinea). None : evenement non vise.
_LOI_2021 = {"mariage_pacs": 4, "mariage_pacs_enfant": 1, "naissance": 3, "adoption": 3, "deces_enfant": 5,
             "deces_enfant_majore": "7 ouvres", "deces_proche": 3, "handicap_enfant": 2,
             "deces_descendant": None, "deces_ascendant": None}
_LOI_2023 = dict(_LOI_2021, deces_enfant=12, deces_enfant_majore=14, handicap_enfant=5)
_LOI_2026 = dict(_LOI_2023, handicap_enfant=10)
# Periodes affichees par Legifrance (« du X au Y » : Y est le premier jour de la
# version suivante, qui s'applique ce jour-la).
_LOI = [
    (date(2021, 12, 19), date(2023, 7, 21), _LOI_2021, "version du 19/12/2021 au 21/07/2023 (loi n° 2021-1678)"),
    (date(2023, 7, 21), date(2026, 6, 14), _LOI_2023, "version du 21/07/2023 au 14/06/2026 (loi n° 2023-622)"),
    (date(2026, 6, 14), None, _LOI_2026, "version depuis le 14/06/2026 (loi n° 2026-492)"),
]


def _lectures_duree(evenement, d):
    """Ensemble des durees (jours ouvrables) selon les lectures de version."""
    ccn = set()
    for bascule in _BASCULE_CCN:
        ccn.add(_CCN_NOUVELLE[evenement] if d >= bascule else _CCN_ANCIENNE[evenement])
    lois = [(t, nom) for debut, fin, t, nom in _LOI if d >= debut and (fin is None or d < fin)]
    resultats = set()
    for c in ccn:
        for t, nom in lois:
            v = t[evenement]
            if isinstance(v, str):
                raise NonGere("EVT-OUVRES-2021", ["R-ABS-06"],
                              precision=f"Loi {nom} : « sept jours ouvres » ; CCN : {c} jours ouvrables.")
            resultats.add(max(c, v) if v is not None else c)
    return resultats, [nom for _, nom in lois]


@api("R-ABS-06")
def conge_evenement_familial(evenement, date_evenement, deplacement_plus_600km=False, pathologie_ou_cancer=False):
    """Duree du conge pour evenement familial (T-027).
    evenement : voir EVENEMENTS. date_evenement : date de l'evenement (le texte
    applicable est celui en vigueur ce jour-la).
    pathologie_ou_cancer : pour handicap_enfant, l'annonce porte sur une
    pathologie chronique ou un cancer (la version remplacee de la CCN ne vise que
    le handicap).
    deplacement_plus_600km : l'AM demande le jour supplementaire non remunere
    (deplacement de plus de 600 km aller-retour, CCN 48.1.3.1.1).
    Sortie : jours_ouvrables_remuneres (salaire maintenu, aucune deduction, CCN
    48.1.3.1.1 et C. trav. L3142-2), jours_ouvrables_non_remuneres (0 ou 1).
    Refus : M-06 pour le conge de deuil (indemnise par la Securite sociale) ;
    EVT-OUVRES-2021 ; EVT-VERSION si les lectures de version different."""
    if evenement not in EVENEMENTS:
        raise ErreurSaisie(f"evenement parmi {EVENEMENTS}.")
    if not isinstance(date_evenement, date):
        raise ErreurSaisie("date_evenement : un objet datetime.date est attendu.")
    verifier_date_ccn(date_evenement, ["R-ABS-06"])
    if evenement == "deuil_complementaire":
        raise NonGere("M-06", ["R-ABS-06"], precision=(
            "Conge de deuil : 8 jours ouvrables (CCN 48.1.3.1.2), indemnise par la Securite sociale "
            "(C. trav. L3142-2, CSS L331-9) ; salaire maintenu sous deduction des indemnites journalieres "
            "(CCN 48.1.3.1.3)."))
    ev = evenement
    if ev == "handicap_enfant" and pathologie_ou_cancer:
        # Version remplacee de la CCN : ne vise pas ce cas (0 jour par la CCN).
        lect = set()
        for bascule in _BASCULE_CCN:
            c = _CCN_NOUVELLE[ev] if date_evenement >= bascule else 0
            for debut, fin, t, nom in _LOI:
                if date_evenement >= debut and (fin is None or date_evenement < fin):
                    lect.add(max(c, t[ev]))
        versions = [nom for debut, fin, t, nom in _LOI if date_evenement >= debut and (fin is None or date_evenement < fin)]
    else:
        lect, versions = _lectures_duree(ev, date_evenement)
    if len(lect) != 1:
        raise NonGere("EVT-VERSION", ["R-ABS-06"], details={"durees_possibles": sorted(lect)})
    duree = lect.pop()
    return resultat_ok(conge_evenement_familial.regles, {
        "jours_ouvrables_remuneres": duree,
        "jours_ouvrables_non_remuneres": 1 if deplacement_plus_600km else 0,
        "unite": "jours ouvrables",
        "versions_loi": versions,
        "sources": [_SRC_CCN, _SRC_LOI],
    }, notes=["Le moment de la prise (« au moment de l'evenement » ou dans les jours qui l'entourent ; "
              "15 jours pour la naissance) n'est pas controle."])


def _ouvrable(d):
    """Jour ouvrable : du lundi au samedi. Les jours feries sont traites a part."""
    return d.weekday() <= 5


@api("R-ABS-06")
def jours_conge_evenement(evenement, date_evenement, premier_jour, dernier_jour, deplacement_plus_600km=False,
                          pathologie_ou_cancer=False):
    """Statut de chaque jour d'un conge pour evenement familial pris d'un seul
    tenant, du premier au dernier jour (T-027).
    Les jours ouvrables (lundi a samedi) sont comptes dans l'ordre : les premiers,
    jusqu'a la duree due, sont remuneres ; le suivant, si l'AM a demande le jour
    du deplacement de plus de 600 km, est non remunere ; au-dela, le jour n'est
    pas un conge pour evenement familial et doit etre qualifie autrement
    (« hors_droit »). Les dimanches ne sont pas comptes.
    Refus EVT-FERIE si un jour ferie tombe dans le conge : le texte ne dit pas si
    un ferie compte comme jour ouvrable pour l'AM.
    Sortie : jours = {date iso : remunere | non_remunere | hors_droit | non_ouvrable}."""
    r = conge_evenement_familial.interne(evenement, date_evenement, deplacement_plus_600km, pathologie_ou_cancer)
    if not (isinstance(premier_jour, date) and isinstance(dernier_jour, date)) or dernier_jour < premier_jour:
        raise ErreurSaisie("premier_jour et dernier_jour : dates, dans l'ordre.")
    duree = r["resultat"]["jours_ouvrables_remuneres"]
    sans_solde = r["resultat"]["jours_ouvrables_non_remuneres"]
    out = {}
    n = 0
    d = premier_jour
    while d <= dernier_jour:
        if d in jours_feries(d.year):
            raise NonGere("EVT-FERIE", ["R-ABS-06"], precision=f"Ferie le {d.isoformat()}.")
        if not _ouvrable(d):
            out[d.isoformat()] = "non_ouvrable"
        else:
            n += 1
            if n <= duree:
                out[d.isoformat()] = "remunere"
            elif n <= duree + sans_solde:
                out[d.isoformat()] = "non_remunere"
            else:
                out[d.isoformat()] = "hors_droit"
        d += timedelta(days=1)
    return resultat_ok(jours_conge_evenement.regles, {"jours": out, "duree_jours_ouvrables": duree},
                       notes=r.get("notes"))
