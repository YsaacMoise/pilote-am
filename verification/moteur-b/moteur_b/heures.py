"""Heures complementaires, heures majorees, decompte du temps, salaire du mois
(domaine 3 et R-MENS-05 de regles-v0)."""

from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, positif, entier,
    vers_centimes, texte_fraction, verifier_date_ccn,
)

SEUIL_45H = 45 * 60  # R-HC-01, R-HC-02, R-HC-03 (CCN art. 96.2, 96.4)
MAJORATION_MINIMALE_HM = Fraction(10)  # R-HC-03 (CCN art. 110.1) : au moins 10 %


@api("R-HC-04")
def temps_de_travail_jour(debut_prevu, fin_prevue, arrivee_enfant, depart_enfant):
    """R-HC-04 (CCN art. 99). Heures en minutes depuis minuit (entiers).
    Debut = min(prevu ; arrivee). Fin = max(prevue ; depart). Les heures prevues
    restent dues si l'enfant arrive plus tard ou part plus tot.
    Sortie : minutes_travaillees."""
    vals = [entier(v, n) for v, n in ((debut_prevu, "debut_prevu"), (fin_prevue, "fin_prevue"),
                                       (arrivee_enfant, "arrivee_enfant"), (depart_enfant, "depart_enfant"))]
    dp, fp, ae, de = vals
    if fp < dp or de < ae:
        raise ErreurSaisie("Horaires incoherents.")
    debut = min(dp, ae)
    fin = max(fp, de)
    return resultat_ok(temps_de_travail_jour.regles, {"minutes_travaillees": fin - debut,
                                                       "debut": debut, "fin": fin})


def _heures_semaine(heures_contrat_minutes, heures_reelles_minutes, taux_horaire_centimes,
                    majoration_hc_pourcent, majoration_hm_pourcent, absence_dans_semaine):
    regles = ["R-HC-02", "R-HC-03"]
    hc_contrat = positif(heures_contrat_minutes, "heures_contrat_minutes")
    reelles = positif(heures_reelles_minutes, "heures_reelles_minutes")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    maj_hc = positif(majoration_hc_pourcent, "majoration_hc_pourcent")
    maj_hm = positif(majoration_hm_pourcent, "majoration_hm_pourcent")
    if hc_contrat > SEUIL_45H:
        raise NonGere("A-13", regles)
    if maj_hm < MAJORATION_MINIMALE_HM:
        raise ErreurSaisie("Taux de majoration des heures majorees inferieur a 10 % (CCN art. 110.1).", ["R-HC-03"])
    if absence_dans_semaine and reelles > 0:
        # A-09 : on ne sait pas s'il faut compenser heures en plus et heures absentes.
        raise NonGere("A-09", regles + ["R-MENS-05"])
    # R-HC-02 : HC = min(reelles ; 45 h) - heures du contrat, si positif.
    hc = max(Fraction(0), min(reelles, SEUIL_45H) - hc_contrat)
    # R-HC-03 : HM = reelles - 45 h, si positif.
    hm = max(Fraction(0), reelles - SEUIL_45H)
    montant_hc = hc / 60 * t * (1 + maj_hc / 100)
    montant_hm = hm / 60 * t * (1 + maj_hm / 100)
    return hc, hm, montant_hc, montant_hm


@api("R-HC-01", "R-HC-02", "R-HC-03", "R-MENS-05")
def heures_en_plus_semaine(heures_contrat_minutes, heures_reelles_minutes, taux_horaire_centimes,
                           majoration_hm_pourcent, majoration_hc_pourcent=0,
                           absence_dans_semaine=False, date_paie=None):
    """Heures complementaires (R-HC-02) et majorees (R-HC-03) d'une semaine.
    Entrees : heures du contrat et heures reelles de la semaine (minutes),
    taux horaire brut (centimes), majoration contractuelle des heures majorees
    (pourcentage, au moins 10), majoration contractuelle des heures
    complementaires (pourcentage, 0 par defaut), absence_dans_semaine (bool).
    Sortie : minutes et montants (centimes) des heures complementaires et majorees.
    Refus : A-13 (contrat > 45 h), A-09 (semaine avec absence)."""
    verifier_date_ccn(date_paie, ["R-HC-02"])
    hc, hm, mhc, mhm = _heures_semaine(heures_contrat_minutes, heures_reelles_minutes, taux_horaire_centimes,
                                       majoration_hc_pourcent, majoration_hm_pourcent, absence_dans_semaine)
    res = {
        "minutes_complementaires": texte_fraction(hc),
        "minutes_majorees": texte_fraction(hm),
        "heures_complementaires": texte_fraction(hc / 60),
        "heures_majorees": texte_fraction(hm / 60),
        "montant_complementaires_centimes": vers_centimes(mhc, "heures complementaires", ["R-HC-02"]),
        "montant_majorees_centimes": vers_centimes(mhm, "heures majorees", ["R-HC-03"]),
    }
    return resultat_ok(heures_en_plus_semaine.regles, res)


@api("R-HC-01", "R-HC-02", "R-HC-03", "T103-H1", "T103-H6")
def heures_en_plus_semaine_t103(heures_contrat_semaine_minutes, minutes_effectuees, taux_horaire_centimes,
                                majoration_hm_pourcent, majoration_hc_pourcent=0, minutes_conges_payes=0,
                                minutes_1er_mai_chome=0, date_paie=None, minutes_prevues_non_travaillees=0,
                                minutes_en_plus_du_prevu=0):
    """T-103 (H1 a H4, H6) : heures complementaires et majorees d'une semaine, absences comprises.
    CCN 96.4 : heures « de travail effectuees » au-dela de « la duree de travail hebdomadaire prevue au contrat » et
    jusqu'a 45 h (HC), puis au-dela de 45 h (HM, CCN 110.1 ; majoration d'au moins 10 %).
    - H1 (A2) : heures prevues des jours de conge paye de la semaine comptees (minutes_conges_payes) : Cass. soc.
      10/09/2025, n° 23-14.455, publie (Charte des droits fondamentaux de l'Union, art. 31 § 2) ; seuils du
      contrat et de 45 h.
    - D1 (decision T-076 gardee par H3) : heures prevues d'un 1er mai chome comptees (minutes_1er_mai_chome).
    - H2 (revu), H3 : absence de l'enfant payee, ferie chome, evenement familial, absence retenue : non comptes
      (rien n'est « effectue ») ; l'appelant ne les met pas dans minutes_effectuees.
    - H4 : heures_contrat_semaine_minutes = heures que le contrat prevoit cette semaine-la (semaine coupee par
      l'embauche ou la fin : prorata).
    - H6 : une retenue de l'art. 111 la meme semaine se calcule a part (sur le salaire mensualise). Refus A-09 leve.
    Refus garde : A-13 (contrat au-dela de 45 h).
    Sortie : minutes et montants des HC et HM."""
    verifier_date_ccn(date_paie, ["R-HC-02"])
    cp = positif(minutes_conges_payes, "minutes_conges_payes")
    mai = positif(minutes_1er_mai_chome, "minutes_1er_mai_chome")
    eff = positif(minutes_effectuees, "minutes_effectuees") + cp + mai
    hc, hm, mhc, mhm = _heures_semaine(heures_contrat_semaine_minutes, eff, taux_horaire_centimes,
                                       majoration_hc_pourcent, majoration_hm_pourcent, False)
    # Verification 2 (25/11/2026), B-3 et B-4 (H9). Les heures faites au-dela du prevu des jours travailles
    # (minutes_en_plus_du_prevu) sont du travail et sont payees : CCN 98.1.1, al. 3 (heures « effectuees, d'un commun
    # accord [...] au-dela de celles prevues par le contrat ») ; CCN 105 (absence non prevue de l'enfant
    # « remuneree ») et 47.2 (ferie chome : « maintien de la remuneration ») : le salaire mensualise maintenu paie deja
    # l'absence, il ne peut pas payer aussi ces heures ; CCN 111 : la retenue ne vise que les heures « non
    # travaillees ». Guide DREETS Bourgogne-Franche-Comte (juin 2026, p. 43) : eviter « une compensation avec des
    # heures reellement travaillees mais non remunerees ». Qualification : seules les heures de travail effectif
    # au-dela de la duree du contrat sont des HC (CCN 96.4 ; Cass. soc. 04/04/2012, n° 10-10.701 : un jour ferie
    # chome n'est pas du travail effectif, sauf disposition contraire ; la CCN n'assimile les absences payees qu'aux
    # conges et a l'anciennete, art. 48.1.1.3 et 49). Le reste, dans la limite des heures prevues non travaillees de
    # la semaine (minutes_prevues_non_travaillees : absence payee ou retenue, ferie), est paye en heures normales au
    # taux du contrat, sans majoration.
    plus = positif(minutes_en_plus_du_prevu, "minutes_en_plus_du_prevu")
    npt = positif(minutes_prevues_non_travaillees, "minutes_prevues_non_travaillees")
    normales = min(plus, npt)
    montant_normales = normales / 60 * positif(taux_horaire_centimes, "taux_horaire_centimes")
    return resultat_ok(heures_en_plus_semaine_t103.regles, {
        "minutes_normales_en_plus": texte_fraction(normales),
        "montant_normales_en_plus_centimes": vers_centimes(montant_normales, "heures normales en plus", ["T103-H9"]),
        "minutes_comptees": texte_fraction(eff),
        "minutes_complementaires": texte_fraction(hc), "minutes_majorees": texte_fraction(hm),
        "montant_complementaires_centimes": vers_centimes(mhc, "heures complementaires", ["R-HC-02"]),
        "montant_majorees_centimes": vers_centimes(mhm, "heures majorees", ["R-HC-03"])})


@api("R-MENS-05")
def salaire_du_mois(salaire_mensualise_centimes, montants_heures_en_plus_centimes=(), deduction_absence_centimes=0):
    """R-MENS-05 : salaire du mois = mensualise + heures complementaires et
    majorees payees - deduction d'absence. Entrees en centimes entiers.
    Sortie : salaire_brut_mois_centimes."""
    base = entier(salaire_mensualise_centimes, "salaire_mensualise_centimes")
    plus = sum(entier(m, "montant_heures_en_plus") for m in montants_heures_en_plus_centimes)
    ded = entier(deduction_absence_centimes, "deduction_absence_centimes")
    if ded > base:
        raise ErreurSaisie("Deduction superieure au salaire mensualise.")
    return resultat_ok(salaire_du_mois.regles, {"salaire_brut_mois_centimes": base + plus - ded})
