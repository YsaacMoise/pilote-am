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
                                minutes_1er_mai_chome=0, date_paie=None):
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
    return resultat_ok(heures_en_plus_semaine_t103.regles, {
        "minutes_comptees": texte_fraction(eff),
        "minutes_complementaires": texte_fraction(hc), "minutes_majorees": texte_fraction(hm),
        "montant_complementaires_centimes": vers_centimes(mhc, "heures complementaires", ["R-HC-02"]),
        "montant_majorees_centimes": vers_centimes(mhm, "heures majorees", ["R-HC-03"])})


def calcul_h9(reference_minutes, minutes_effectuees, minutes_conges_payes, minutes_1er_mai_chome,
              minutes_payees_non_travaillees, minutes_retenues, minutes_en_plus_des_jours,
              absences_payees_dans_base=False):
    """Verification independante du 25/11/2026 (B-3, B-4 ; H9 et H2 de T-103), qualification corrigee par la
    session T-109 (comparateur, section 2.1 ; regle de verif-2, commit c57a9fb, partie B-3). Minutes exactes.
    E = heures effectuees ; CP = conges payes de la semaine ; M = 1er mai chome ; P = autres absences payees
    (enfant absent, ferie chome, evenement familial) ; R = heures prevues retenues (art. 111) ;
    X = minutes faites au-dela des heures prevues des jours travailles.
    - Heures complementaires (CCN 96.4) : heures « de travail effectuees » au-dela de la duree du contrat et jusqu'a
      45 h : seuil sur E + CP + M (CP : Cass. soc. 10/09/2025, n° 23-14.455 ; 1er mai : decision D1). L'absence
      payee P n'est pas du travail effectue (Cass. soc. 04/04/2012, n° 10-10.701 : pas de travail effectif sans
      texte) : elle ne compte pas pour ce seuil. CSS L241-17, I, 7° : reduction sur les HC « accomplies au sens de
      la convention collective ».
    - Heures majorees (CCN 96.4, 110.1) : au-dela de 45 h de E + CP + M.
    - Heures normales payees en plus : les heures X situees sous la duree du contrat, dans la limite des heures
      prevues non travaillees de la semaine (P + R). Elles sont payees au taux du contrat, sans majoration :
      l'absence payee n'est pas compensee par des heures faites en plus (CCN 105 ; CCN 47.2 ; guide DREETS
      Bourgogne-Franche-Comte de juin 2026, p. 43 : eviter « une compensation avec des heures reellement
      travaillees mais non remunerees ») ; la retenue ne vise que les heures « non travaillees » (CCN 111).
      hn = min(P + R ; X ; reference - (E + CP + M - X)).
    - Planning variable, lecture L2 (absences_payees_dans_base) : la paie prevue de la semaine est maintenue, HC
      prevues au-dela de la base comprises (CCN 105, 47.2 ; verif-2, B-3 en lecture L2) : P compte pour le seuil de
      la base, pas pour celui des 45 h ; hn = min(R ; X ; reference - (E + CP + M + P - X)).
    Exemple (comparateur 2.1) : contrat 40 h, lundi absent paye (8 h), 11 h du mardi au vendredi : E = 44, X = 12,
    P = 8 : hc = 4, hn = 8.
    Renvoie (hn, hc, hm) en minutes."""
    E, CP, M, P, R = minutes_effectuees, minutes_conges_payes, minutes_1er_mai_chome, minutes_payees_non_travaillees, \
        minutes_retenues
    c = E + CP + M
    hm = max(Fraction(0), c - SEUIL_45H)
    hc = max(Fraction(0), c - reference_minutes - hm)
    X = minutes_en_plus_des_jours
    if absences_payees_dans_base:
        hc = max(Fraction(0), c + P - reference_minutes - hm)
        hn = max(Fraction(0), min(R, X, reference_minutes - (c + P - X)))
        return hn, hc, hm
    hn = max(Fraction(0), min(P + R, X, reference_minutes - (c - X)))
    return hn, hc, hm


@api("R-HC-01", "R-HC-02", "R-HC-03", "T103-H1", "T103-H6", "VERIF1-B3", "VERIF1-B4")
def heures_en_plus_semaine_h9(heures_contrat_semaine_minutes, minutes_effectuees, taux_horaire_centimes,
                              majoration_hm_pourcent, majoration_hc_pourcent=0, minutes_conges_payes=0,
                              minutes_1er_mai_chome=0, minutes_payees_non_travaillees=0, minutes_retenues=0,
                              minutes_en_plus_des_jours=0, date_paie=None):
    """Heures normales (compensation d'une retenue), complementaires et majorees d'une semaine a planning fixe
    (voir calcul_h9). Remplace heures_en_plus_semaine_t103 (verification independante du 25/11/2026).
    Refus garde : A-13 (contrat au-dela de 45 h)."""
    verifier_date_ccn(date_paie, ["R-HC-02"])
    ref = positif(heures_contrat_semaine_minutes, "heures_contrat_semaine_minutes")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    maj_hc = positif(majoration_hc_pourcent, "majoration_hc_pourcent")
    maj_hm = positif(majoration_hm_pourcent, "majoration_hm_pourcent")
    if ref > SEUIL_45H:
        raise NonGere("A-13", ["R-HC-02"])
    if maj_hm < MAJORATION_MINIMALE_HM:
        raise ErreurSaisie("Taux de majoration des heures majorees inferieur a 10 % (CCN art. 110.1).", ["R-HC-03"])
    hn, hc, hm = calcul_h9(ref, positif(minutes_effectuees, "minutes_effectuees"),
                           positif(minutes_conges_payes, "minutes_conges_payes"),
                           positif(minutes_1er_mai_chome, "minutes_1er_mai_chome"),
                           positif(minutes_payees_non_travaillees, "minutes_payees_non_travaillees"),
                           positif(minutes_retenues, "minutes_retenues"),
                           positif(minutes_en_plus_des_jours, "minutes_en_plus_des_jours"))
    return resultat_ok(heures_en_plus_semaine_h9.regles, {
        "minutes_normales": texte_fraction(hn), "minutes_complementaires": texte_fraction(hc),
        "minutes_majorees": texte_fraction(hm),
        "montant_normales_centimes": vers_centimes(hn / 60 * t, "heures normales", ["VERIF1-B4"]),
        "montant_complementaires_centimes": vers_centimes(hc / 60 * t * (1 + maj_hc / 100), "heures complementaires",
                                                          ["R-HC-02"]),
        "montant_majorees_centimes": vers_centimes(hm / 60 * t * (1 + maj_hm / 100), "heures majorees", ["R-HC-03"])})


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
