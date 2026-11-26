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

# Entree en vigueur de la version nouvelle (avenant n° 4). T-103 (C6, A1) : avenant n° 4 du 16/10/2023, art. 4
# (KALIARTI000048805330) : « Il entre en vigueur au premier jour du mois qui suit celui au cours duquel l'avis
# d'extension le concernant est publie au Journal officiel » (arrete du 22/03/2024, JORF du 03/04/2024) : 01/05/2024.
# Avant : version de 2022 (KALIARTI000043942139), avec le minimum legal de L3142-4 a la date. La base KALI date la
# nouvelle version du 16/10/2023 (signature) : ce n'est pas la date d'entree en vigueur ecrite par l'avenant.
_BASCULE_CCN = (date(2024, 5, 1),)

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


@api("R-ABS-06", "T103-C9")
def conge_deuil(date_deces, indemnites_journalieres_centimes=None):
    """T-103 (C9, B) : conge complementaire de deuil. CCN 48.1.3.1.2
    (KALIARTI000043942140) : 8 jours ouvrables (deces d'un enfant de moins de 25
    ans ou d'une personne de moins de 25 ans a charge). CCN 48.1.3.1.3
    (KALIARTI000043942141) : « le particulier employeur maintient le salaire sous
    deduction des indemnites journalieres versees » ; « En aucun cas le salarie ne
    peut percevoir [...] une indemnisation superieure au salaire ».
    indemnites_journalieres_centimes : montant des indemnites journalieres de la
    CPAM pour le conge (donnee demandee a la saisie). Absent : refus
    C9-IJ-MANQUANTES.
    Sortie : jours_ouvrables (8), deduction_ij_centimes (a retirer du salaire du
    mois, qui ne subit pas de deduction d'absence pour ces jours)."""
    if not isinstance(date_deces, date):
        raise ErreurSaisie("date_deces : date attendue.")
    verifier_date_ccn(date_deces, ["R-ABS-06"])
    if indemnites_journalieres_centimes is None:
        raise NonGere("C9-IJ-MANQUANTES", ["R-ABS-06"], precision=(
            "Conge de deuil : salaire maintenu sous deduction des indemnites journalieres (CCN 48.1.3.1.3) ; "
            "montant des indemnites journalieres de la CPAM non saisi."))
    from .commun import entier as _entier
    ij = _entier(indemnites_journalieres_centimes, "indemnites_journalieres_centimes")
    return resultat_ok(conge_deuil.regles, {"jours_ouvrables": 8, "deduction_ij_centimes": ij,
                                            "texte": "CCN 48.1.3.1.2 et 48.1.3.1.3 (T-103, C9)"})


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
        # T-103 (C9) : duree et maintien par conge_deuil (indemnites journalieres demandees).
        return resultat_ok(conge_evenement_familial.regles, {
            "jours_ouvrables_remuneres": 8, "jours_ouvrables_non_remuneres": 0, "unite": "jours ouvrables",
            "maintien_sous_deduction_ij": True,
            "sources": ["CCN 48.1.3.1.2 et 48.1.3.1.3 (KALIARTI000043942140, KALIARTI000043942141)"]},
            notes=["Salaire maintenu sous deduction des indemnites journalieres : voir conge_deuil."])
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
                          pathologie_ou_cancer=False, jour_repos_hebdomadaire=None, planning_contient_dimanche=False,
                          jours_travail=None):
    """Statut de chaque jour d'un conge pour evenement familial pris d'un seul
    tenant, du premier au dernier jour (T-027).
    Les jours ouvrables sont comptes dans l'ordre : les premiers, jusqu'a la duree
    due, sont remuneres ; le suivant, si l'AM a demande le jour du deplacement de
    plus de 600 km, est non remunere ; au-dela, le jour n'est pas un conge pour
    evenement familial et doit etre qualifie autrement (« hors_droit »).
    T-103 (C7, A1) : CCN 48, liminaire (KALIARTI000043942118) : « les jours
    ouvrables correspondent a tous les jours de la semaine a l'exception de la
    periode de repos hebdomadaire [...] et des jours feries chomes » ; C. trav.
    L3142-4 (version du 14/06/2026) : « Les jours de conges mentionnes au present
    article sont des jours ouvrables ». Un ferie n'est pas compte (statut
    « ferie ») : le conge se prolonge d'un jour. Refus EVT-FERIE leve.
    T-103 (C8, B) : CCN 46 : le repos hebdomadaire est « prevu par le contrat de
    travail ». jour_repos_hebdomadaire (0 = lundi ... 6 = dimanche) ; par defaut
    le dimanche. Si le planning prevoit le dimanche (planning_contient_dimanche)
    et que le jour de repos n'est pas donne : refus C8-REPOS-HEBDO-MANQUANT.
    Sortie : jours = {date iso : remunere | non_remunere | hors_droit |
    non_ouvrable | ferie}."""
    if evenement == "deces_enfant_majore" and isinstance(date_evenement, date) and \
            date(2020, 7, 1) <= date_evenement <= date(2021, 12, 31):
        return _sept_jours_ouvres(premier_jour, dernier_jour, jours_travail)
    r = conge_evenement_familial.interne(evenement, date_evenement, deplacement_plus_600km, pathologie_ou_cancer)
    if not (isinstance(premier_jour, date) and isinstance(dernier_jour, date)) or dernier_jour < premier_jour:
        raise ErreurSaisie("premier_jour et dernier_jour : dates, dans l'ordre.")
    if jour_repos_hebdomadaire is None:
        if planning_contient_dimanche:
            raise NonGere("C8-REPOS-HEBDO-MANQUANT", ["R-ABS-06"], precision=(
                "Le planning prevoit le dimanche : jour de repos hebdomadaire du contrat (CCN 46) a saisir."))
        repos = 6
    else:
        repos = int(jour_repos_hebdomadaire)
        if repos not in range(7):
            raise ErreurSaisie("jour_repos_hebdomadaire : 0 (lundi) a 6 (dimanche).")
    duree = r["resultat"]["jours_ouvrables_remuneres"]
    sans_solde = r["resultat"]["jours_ouvrables_non_remuneres"]
    out = {}
    n = 0
    d = premier_jour
    while d <= dernier_jour:
        if d.weekday() == repos:
            out[d.isoformat()] = "non_ouvrable"
        elif d in jours_feries(d.year):
            out[d.isoformat()] = "ferie"
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


def _sept_jours_ouvres(premier_jour, dernier_jour, jours_travail):
    """T-109 (troisieme controle qualite de la n° 67) : deces d'un enfant de moins de 25 ans, evenement du 01/07/2020 au
    31/12/2021. C. trav. L3142-4, 4° (versions du 01/07/2020 au 20/07/2023, base LEGI de la DILA) : « sept jours ouvres
    lorsque l'enfant est age de moins de vingt-cinq ans ». Ancienne convention des assistants maternels (IDCC 2395, art. 13,
    en vigueur jusqu'au 01/01/2022) : 2 jours ouvrables pour le deces d'un enfant : la loi est plus favorable. Jours ouvres
    lus comme les jours de travail prevus au contrat (regles/t107-evenements-avant-2022.md, R-EVT-02), comptes pour chaque
    contrat : jours_travail = jours de la semaine du planning du contrat (0 = lundi). Feries : statut « ferie » (payes a
    part, CCN 47). Sans jours_travail : refus EVT-OUVRES-PLANNING."""
    if not (isinstance(premier_jour, date) and isinstance(dernier_jour, date)) or dernier_jour < premier_jour:
        raise ErreurSaisie("premier_jour et dernier_jour : dates, dans l'ordre.")
    if not jours_travail:
        raise NonGere("EVT-OUVRES-PLANNING", ["R-ABS-06"], precision="Jours de travail du contrat inconnus.")
    jt = {int(j) for j in jours_travail}
    out, n, d = {}, 0, premier_jour
    while d <= dernier_jour:
        if d in jours_feries(d.year):
            out[d.isoformat()] = "ferie"
        elif d.weekday() not in jt:
            out[d.isoformat()] = "non_ouvrable"
        else:
            n += 1
            out[d.isoformat()] = "remunere" if n <= 7 else "hors_droit"
        d += timedelta(days=1)
    return resultat_ok(jours_conge_evenement.regles, {"jours": out, "duree_jours_ouvres": 7, "unite": "jours ouvres"})
