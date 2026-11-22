"""Perimetre de la version 0 et passage au net (refus)."""

from .commun import NonGere, ErreurSaisie, api, resultat_ok

_ALSACE_MOSELLE = {"57", "67", "68"}
_HORS_METROPOLE = {"971", "972", "973", "974", "975", "976", "977", "978", "986", "987", "988"}


@api("Hors perimetre (regles-v0)", "R-MENS-10", "R-SAL-07")
def verifier_perimetre(departement, accueil="regulier", semaines_alternees=False, type_contrat="CDI",
                       cdd_remplacement=False, majoration_difficultes_enfant=False):
    """Controle du perimetre v0 : France metropolitaine (Alsace-Moselle comprise depuis T-077) et Mayotte,
    accueil regulier, pas de semaines alternees. CDD de remplacement : regle
    R-MENS-10 douteuse. Majoration pour difficultes de l'enfant : A-55.
    Sortie : dans_perimetre (True) ou refus."""
    dep = str(departement).strip().upper()
    # T-077 (MB7) : Alsace-Moselle et Mayotte ouvertes (regles/t077-decisions.md, R0 a R4) ;
    # les autres outre-mer restent exclus (aucune regle de feries locaux relue pour eux).
    from .regions import region_du_departement
    region = region_du_departement(dep)
    if region is None:
        raise NonGere("EXCLU-HORS-METROPOLE")
    if accueil == "occasionnel":
        raise NonGere("EXCLU-OCCASIONNEL")
    if accueil != "regulier":
        raise ErreurSaisie("accueil : « regulier » ou « occasionnel ».")
    if semaines_alternees:
        raise NonGere("EXCLU-ALTERNEES")
    if type_contrat not in ("CDI", "CDD"):
        raise ErreurSaisie("type_contrat : « CDI » ou « CDD ».")
    if type_contrat == "CDD" and cdd_remplacement:
        raise NonGere("R-MENS-10", ["R-MENS-10"])
    if majoration_difficultes_enfant:
        raise NonGere("A-55", ["R-SAL-07"])
    return resultat_ok(verifier_perimetre.regles, {"dans_perimetre": True, "region": region})


@api("R-PAJ-04", "R-SAL-06", "M-01", "M-02")
def convertir_brut_net(montant_brut_centimes):
    """Passage du brut au net : regle R-PAJ-04 douteuse, A-34 ouverte, M-01
    (reduction sur heures en plus) non etablie. Refus dans tous les cas."""
    raise NonGere("A-34", ["R-PAJ-04", "M-01", "M-02"])
