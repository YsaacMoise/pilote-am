"""Tests du moteur B sur les cas officiels.

Regle de redaction : chaque resultat attendu est recopie de
tests/cas-officiels-v0.md (cas « principale », hors « Exemples suspects » et
hors cas « historique »), avec l'identifiant du cas. Aucun resultat attendu
n'est calcule par l'auteur des tests. Les montants sont convertis en centimes
(ex. « 600 € » -> 60000) et les heures en minutes (« 40 h » -> 2400).

Un test marque @unittest.expectedFailure affirme le resultat officiel, mais le
moteur ne le donne pas (il refuse, ou trouve autre chose). Chaque cas de ce type
est documente dans ECARTS.md. Le resultat n'est jamais force.
"""

import os
import sys
import unittest
from datetime import date
from fractions import Fraction

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

xfail = unittest.expectedFailure


def R(sortie, cle):
    """Valeur d'un resultat valide ; echec explicite si le moteur refuse."""
    if sortie["statut"] not in ("ok", "provisoire"):
        raise AssertionError(f"Moteur : {sortie['statut']} {sortie.get('code', '')} {sortie.get('message', '')}")
    return sortie["resultat"][cle]


AUCUNE = {"feries_chomes_payes": {"minutes": 0, "incluses": False},
          "absences_remunerees": {"minutes": 0, "incluses": False},
          "heures_complementaires": {"minutes": 0, "incluses": False}}


# ---------------------------------------------------------------- Mensualisation
class Mensualisation(unittest.TestCase):
    def test_C_MENS_02(self):
        """C-MENS-02, R-MENS-04 : 40 h x 36 semaines / 12 = 120 h x 5 € = 600 €."""
        s = m.mensualisation(36, 2400, 500)
        self.assertEqual(R(s, "salaire_mensualise_centimes"), 60000)
        self.assertEqual(R(s, "heures_mensualisees"), "120")

    def test_C_MENS_03(self):
        """C-MENS-03, R-MENS-02/04 : 52 - (7 + 5 - 2) = 42 semaines."""
        s = m.semaines_programmees(7, 5, 2)
        self.assertEqual(R(s, "semaines_programmees"), 42)
        self.assertEqual(R(s, "type_annee"), "incomplete")

    def test_C_MENS_06(self):
        """C-MENS-06, R-MENS-03 : (4,5 € x 40 h x 52) / 12 = 780 €."""
        self.assertEqual(R(m.mensualisation(52, 2400, 450), "salaire_mensualise_centimes"), 78000)

    def test_C_MENS_07(self):
        """C-MENS-07, R-MENS-04 : 4,5 € x 40 h x 36 / 12 = 540 €."""
        self.assertEqual(R(m.mensualisation(36, 2400, 450), "salaire_mensualise_centimes"), 54000)

    def test_C_MENS_08(self):
        """C-MENS-08, R-MENS-03 : (45 h x 52 x 4 €) / 12 = 780 €."""
        self.assertEqual(R(m.mensualisation(52, 2700, 400), "salaire_mensualise_centimes"), 78000)

    def test_C_MENS_09(self):
        """C-MENS-09, R-MENS-04 : (32 x 36 x 4 €) / 12 = 384 €."""
        self.assertEqual(R(m.mensualisation(36, 1920, 400), "salaire_mensualise_centimes"), 38400)

    def test_C_MENS_10(self):
        """C-MENS-10, R-MENS-04 : (30 h x 36) / 12 = 90 heures."""
        self.assertEqual(R(m.heures_mensualisees(36, 1800), "heures_mensualisees"), "90")

    def test_C_MENS_11(self):
        """C-MENS-11, R-MENS-03 : 2,97 € x 40 h x 52 / 12 = 514,8 €."""
        self.assertEqual(R(m.mensualisation(52, 2400, 297), "salaire_mensualise_centimes"), 51480)

    @xfail
    def test_C_MENS_12_net(self):
        """C-MENS-12 : 3 € net x 40 h x 36 / 12 = 360 € net. Moteur : A-02."""
        self.assertEqual(R(m.mensualisation(36, 2400, 300, nature_taux="net"), "salaire_mensualise_centimes"), 36000)


# ---------------------------------------------------- Heures complementaires et majorees
class HeuresEnPlus(unittest.TestCase):
    def test_C_HC_03(self):
        """C-HC-03, R-HC-02, R-MENS-05 : 600 € + (2 h x 5,50 €) = 611 €."""
        h = m.heures_en_plus_semaine(2400, 2520, 500, majoration_hm_pourcent=15, majoration_hc_pourcent=10)
        self.assertEqual(R(h, "heures_complementaires"), "2")
        self.assertEqual(R(h, "montant_complementaires_centimes"), 1100)
        total = m.salaire_du_mois(60000, [R(h, "montant_complementaires_centimes"), R(h, "montant_majorees_centimes")])
        self.assertEqual(R(total, "salaire_brut_mois_centimes"), 61100)

    def test_C_HC_04(self):
        """C-HC-04, R-HC-02, R-HC-03 : 600 € + (5 h x 5,50 €) + (2 h x 5,75 €) = 639 €."""
        h = m.heures_en_plus_semaine(2400, 2820, 500, majoration_hm_pourcent=15, majoration_hc_pourcent=10)
        self.assertEqual(R(h, "heures_complementaires"), "5")
        self.assertEqual(R(h, "heures_majorees"), "2")
        total = m.salaire_du_mois(60000, [R(h, "montant_complementaires_centimes"), R(h, "montant_majorees_centimes")])
        self.assertEqual(R(total, "salaire_brut_mois_centimes"), 63900)

    @xfail
    def test_C_HC_05_net(self):
        """C-HC-05 : 416 + 13 h x 3,20 € + 5 h x 3,50 € = 475,10 € (net). Moteur : A-02."""
        base = R(m.mensualisation(52, 1920, 300, nature_taux="net"), "salaire_mensualise_centimes")
        self.assertEqual(base + 13 * 320 + 5 * 350, 47510)

    @xfail
    def test_C_HC_06_net(self):
        """C-HC-06 : 370 + 5 h x 3,20 € + 5 h x 3,50 € = 403,50 € (net). Moteur : A-02."""
        base = R(m.mensualisation(37, 2400, 300, nature_taux="net"), "salaire_mensualise_centimes")
        self.assertEqual(base + 5 * 320 + 5 * 350, 40350)


# ---------------------------------------------------------------- Absences
class Absences(unittest.TestCase):
    def test_C_ABS_02(self):
        """C-ABS-02, R-ABS-08 : 600 € x 3 j / 21 j = 85,71 € ; 514,29 €.
        Octobre 2021 contient une semaine de non-accueil (25-31 octobre, C-MENS-02).
        A-19 leve (T-040) ; ARR-01 leve (T-040d, centime le plus proche)."""
        d = m.deduction_absence("incomplete", 60000, 3, 21, semaines_non_accueil_dans_mois=1)
        self.assertEqual(R(d, "deduction_centimes"), 8571)
        self.assertEqual(R(d, "salaire_du_centimes"), 51429)

    @xfail
    def test_C_ABS_03_net(self):
        """C-ABS-03 : 416 € - [(416 € x 64 h) / 136 h] = 220,24 € (net). Moteur : A-02."""
        base = R(m.mensualisation(52, 1920, 300, nature_taux="net"), "salaire_mensualise_centimes")
        d = m.deduction_absence("complete", base, 64 * 60, 136 * 60)
        self.assertEqual(R(d, "salaire_du_centimes"), 22024)

    def test_C_ABS_05_formule(self):
        """C-ABS-05, R-ABS-07 : 780 € x 40 / 168 = 185,71 € ; 594,29 €. ARR-01 leve (T-040d)."""
        d = m.deduction_absence("complete", 78000, 2400, 168 * 60)
        self.assertEqual(R(d, "deduction_centimes"), 18571)
        self.assertEqual(R(d, "salaire_du_centimes"), 59429)

    @xfail
    def test_C_ABS_05_08_qualification(self):
        """C-ABS-05 a 08 : semaine « sans solde » faute de droits a CP, en annee
        complete : la fiche applique une retenue. Moteur : A-25 (R-CP-05)."""
        self.assertTrue(R(m.qualifier_absence("conge_complementaire_non_remunere", "complete"), "deductible"))

    def test_C_ABS_06(self):
        """C-ABS-06, R-ABS-07 : 780 x 32 / 184 = 135,65 € ; 644,35 €. ARR-01 leve (T-040d)."""
        d = m.deduction_absence("complete", 78000, 32 * 60, 184 * 60)
        self.assertEqual(R(d, "deduction_centimes"), 13565)
        self.assertEqual(R(d, "salaire_du_centimes"), 64435)

    def test_C_ABS_07(self):
        """C-ABS-07, R-ABS-07 : 780 x 40 / 176 = 177,27 € ; 602,73 €. ARR-01 leve (T-040d)."""
        d = m.deduction_absence("complete", 78000, 2400, 176 * 60)
        self.assertEqual(R(d, "deduction_centimes"), 17727)
        self.assertEqual(R(d, "salaire_du_centimes"), 60273)

    def test_C_ABS_08_formule(self):
        """C-ABS-08, R-ABS-07 : 780 x 40 / 160 = 195 € ; 585 €."""
        d = m.deduction_absence("complete", 78000, 2400, 160 * 60)
        self.assertEqual(R(d, "deduction_centimes"), 19500)
        self.assertEqual(R(d, "salaire_du_centimes"), 58500)

    def test_C_ABS_09(self):
        """C-ABS-09, R-FIN-12, R-ABS-07 : 780 € x (63/198) = 248,18 € ; 531,82 €. ARR-01 leve (T-040d)."""
        self.assertTrue(R(m.qualifier_absence("fin_contrat_en_cours_de_mois", "complete"), "deductible"))
        d = m.deduction_absence("complete", 78000, 63 * 60, 198 * 60)
        self.assertEqual(R(d, "deduction_centimes"), 24818)
        self.assertEqual(R(d, "salaire_du_centimes"), 53182)

    def test_C_ABS_10(self):
        """C-ABS-10, R-FIN-12, R-ABS-08 : 384 € x 6/18 = 128 € ; 256 €."""
        self.assertTrue(R(m.qualifier_absence("fin_contrat_en_cours_de_mois", "incomplete"), "deductible"))
        d = m.deduction_absence("incomplete", 38400, 6, 18)
        self.assertEqual(R(d, "deduction_centimes"), 12800)
        self.assertEqual(R(d, "salaire_du_centimes"), 25600)

    def test_C_ABS_11_denominateur(self):
        """C-ABS-11, R-ABS-07, R-JF-05 : mai 2023, 4 x 40 h + 2 x 9 h + 1 x 4 h = 182 heures."""
        planning = {0: 540, 1: 540, 2: 240, 3: 540, 4: 540}
        p = m.prevu_du_mois(2023, 5, planning, "complete")
        self.assertEqual(R(p, "prevu_heures"), "182")

    def test_C_ABS_12(self):
        """C-ABS-12, R-ABS-08 : mai 2023 avec une semaine de non-accueil : 23 jours. A-19 leve (T-040)."""
        planning = {0: 540, 1: 540, 2: 240, 3: 540, 4: 540}
        p = m.prevu_du_mois(2023, 5, planning, "incomplete", contient_semaine_non_accueil=True)
        self.assertEqual(R(p, "prevu_jours"), 23)


# ------------------------------------------------- Conges payes : acquisition et decompte
class CongesAcquisition(unittest.TestCase):
    def test_C_CPA_02(self):
        """C-CPA-02, R-CP-03 : 25 jours + 2 jours pour enfant a charge = 27 jours (35 ans, un enfant de 4 ans)."""
        self.assertEqual(R(m.jours_enfants_a_charge(25, 35, 1), "total"), 27)

    @xfail
    def test_C_CPA_03_acquisition(self):
        """C-CPA-03, R-CP-01 : 4 mois, 17 semaines, 88 jours ; retenu 11 jours ; solde 3 + 11 = 14. Moteur : A-23."""
        a = R(m.acquisition_cp("complete", mois=4, semaines=17, jours=88, jours_par_semaine=5), "jours_acquis")
        self.assertEqual(a, 11)
        self.assertEqual(3 + a, 14)

    def test_C_CPA_03_enfants(self):
        """C-CPA-03, R-CP-03 : pas de jours enfant a charge (periode non complete)."""
        self.assertEqual(R(m.jours_enfants_a_charge(11, 35, 1, periode_atteint_31_mai=False), "jours_supplementaires"), 0)

    @xfail
    def test_C_CPA_04_acquisition(self):
        """C-CPA-04, R-CP-01 : 46 s, 31 semaines, 155 jours : 20 jours. Moteur : SUS-11."""
        self.assertEqual(R(m.acquisition_cp("incomplete", semaines=31, jours=155, jours_par_semaine=5), "jours_acquis"), 20)

    def test_C_CPA_04_enfants(self):
        """C-CPA-04, R-CP-03 : 20 jours + 4 jours (39 ans, enfants de 9 et 6 ans) = 24 jours."""
        self.assertEqual(R(m.jours_enfants_a_charge(20, 39, 2), "total"), 24)

    @xfail
    def test_C_CPA_05(self):
        """C-CPA-05, R-CP-01 : 11 semaines (6,87 -> 7) ou 58 jours (7,25 -> 8) ; retenu 8. Moteur : SUS-11."""
        self.assertEqual(R(m.acquisition_cp("incomplete", semaines=11, jours=58, jours_par_semaine=5), "jours_acquis"), 8)

    @xfail
    def test_C_CPA_06(self):
        """C-CPA-06, R-CP-01 : 118 j / 12 j x 2,5 = 24,58 -> 25 jours. Type d'annee non precise
        (le refus est le meme pour les deux). Moteur : A-23."""
        self.assertEqual(R(m.acquisition_cp("complete", jours=118, jours_par_semaine=3), "jours_acquis"), 25)

    @xfail
    def test_C_CPA_07(self):
        """C-CPA-07, R-CP-01 : 46 s, (28 / 4) x 2,5 = 17,5 -> 18 jours. Moteur : SUS-11."""
        self.assertEqual(R(m.acquisition_cp("incomplete", semaines=28), "jours_acquis"), 18)

    def test_C_CPA_09(self):
        """C-CPA-09, R-CP-01 : periode complete : 30 jours ouvrables."""
        self.assertEqual(R(m.acquisition_cp("complete", periode_complete=True), "jours_acquis"), 30)

    @xfail
    def test_C_CPA_10(self):
        """C-CPA-10, R-CP-01 : 46 s, 40 semaines x 2,5 / 4 = 25 jours. Moteur : SUS-11."""
        self.assertEqual(R(m.acquisition_cp("incomplete", semaines=40), "jours_acquis"), 25)

    @xfail
    def test_C_CPA_13(self):
        """C-CPA-13, R-CP-02 : 32 semaines de presence (20 j) + 20 semaines de maladie (10 j) = 30. Moteur : A-23."""
        self.assertEqual(R(m.acquisition_cp("complete", semaines=32, semaines_arret_maladie=20), "jours_acquis"), 30)

    @xfail
    def test_C_CPA_14_periode_1(self):
        """C-CPA-14, R-CP-02 : 48 semaines / 4 x 2,5 = 30 jours. Moteur : A-23."""
        self.assertEqual(R(m.acquisition_cp("complete", semaines=48, semaines_arret_maladie=4), "jours_acquis"), 30)

    @xfail
    def test_C_CPA_14_periode_2(self):
        """C-CPA-14, R-CP-02 : par mois 27, par 4 semaines 29 ; la fiche retient 29. Moteur : A-23."""
        a = m.acquisition_cp("complete", mois=10, semaines=41, mois_arret_maladie=1, semaines_arret_maladie=11,
                             date_fin_periode=date(2026, 5, 31))
        self.assertEqual(R(a, "jours_acquis"), 29)

    @xfail
    def test_C_CPA_15(self):
        """C-CPA-15, R-CP-02 : 9 x 2,5 = 23 + 3 x 2 = 6 : 29 jours. Moteur : A-23."""
        a = m.acquisition_cp("complete", mois=9, mois_arret_maladie=3, date_fin_periode=date(2025, 5, 31))
        self.assertEqual(R(a, "jours_acquis"), 29)

    @xfail
    def test_C_CPA_16_premiere_periode(self):
        """C-CPA-16, R-CP-01 : janvier-mai, 2,5 j x 5 = 12,5 -> 13 jours. Moteur : A-23."""
        self.assertEqual(R(m.acquisition_cp("complete", mois=5), "jours_acquis"), 13)

    def test_C_CPA_16_periodes_completes(self):
        """C-CPA-16, R-CP-01 : 2e et 3e periodes : 30 jours ouvrables."""
        self.assertEqual(R(m.acquisition_cp("complete", periode_complete=True), "jours_acquis"), 30)

    def test_C_CPA_17(self):
        """C-CPA-17, R-CP-04 : 28 jours, 12 pris en ete, reliquat 12 -> 2 jours ; 16 jours, reliquat 4 -> 1 jour."""
        f1 = m.jours_fractionnement(28, 12)
        self.assertEqual(R(f1, "jours_hors_periode"), 12)
        self.assertEqual(R(f1, "jours_fractionnement"), 2)
        f2 = m.jours_fractionnement(16, 12)
        self.assertEqual(R(f2, "jours_hors_periode"), 4)
        self.assertEqual(R(f2, "jours_fractionnement"), 1)

    def test_C_CPA_18(self):
        """C-CPA-18, R-CP-09 : AM du lundi, mardi, jeudi, vendredi : une semaine = 6 jours ;
        avec un jeudi ferie chome : 5 jours. (Semaines choisies : 09/03/2026 et
        semaine de l'Ascension, jeudi 14/05/2026.)"""
        jt = {0, 1, 3, 4}
        self.assertEqual(R(m.decompte_jours_cp(date(2026, 3, 9), date(2026, 3, 16), jt), "jours_decomptes"), 6)
        self.assertEqual(R(m.decompte_jours_cp(date(2026, 5, 11), date(2026, 5, 18), jt), "jours_decomptes"), 5)


# ------------------------------------------------- Conges payes : indemnite
class CongesIndemnite(unittest.TestCase):
    def test_C_CPI_03(self):
        """C-CPI-03, R-CP-06, R-CP-08 : 24 jours, maintien 160 h x 5 € = 800 € (dixieme 637,70) ;
        maintien applique ; juin : 600 € + 800 € ; prise principale en aout : 600 € + 800 €."""
        i = m.indemnite_cp(24, 2400, 500, 531429, heures_conge_minutes=160 * 60, jours_supplementaires=4)
        self.assertEqual(R(i, "indemnite_centimes"), 80000)
        self.assertEqual(R(i, "methode"), "maintien")
        self.assertEqual(R(m.paiement_cp_annee_incomplete("juin", 80000, 60000, 6), "total_mois_centimes"), 140000)
        self.assertEqual(R(m.paiement_cp_annee_incomplete("prise_principale", 80000, 60000, 8, mois_prise_principale=8),
                           "total_mois_centimes"), 140000)

    @xfail
    def test_C_CPI_03_fur_et_a_mesure(self):
        """C-CPI-03, R-CP-08 : au fur et a mesure, 600 € + 400 € brut. Moteur : A-30."""
        self.assertEqual(R(m.paiement_cp_annee_incomplete("fur_et_a_mesure", 80000, 60000, 8), "total_mois_centimes"),
                         100000)

    def test_C_CPI_04(self):
        """C-CPI-04, R-CP-06, R-CP-08 : 18 jours ; dixieme 540 € ; maintien 600 € ; 600 € en juin
        ou avec le mois d'aout."""
        i = m.indemnite_cp(18, 2400, 500, 540000)
        self.assertEqual(R(i, "indemnite_centimes"), 60000)
        self.assertEqual(R(i, "dixieme_exact_centimes"), ["54000"])
        self.assertEqual(R(m.paiement_cp_annee_incomplete("juin", 60000, 60000, 6), "montant_cp_du_mois_centimes"), 60000)
        self.assertEqual(R(m.paiement_cp_annee_incomplete("prise_principale", 60000, 60000, 8, mois_prise_principale=8),
                           "montant_cp_du_mois_centimes"), 60000)

    @xfail
    def test_C_CPI_04_fur_et_a_mesure(self):
        """C-CPI-04 : au fur et a mesure, 400 € puis 200 €. Moteur : A-30."""
        self.assertEqual(R(m.paiement_cp_annee_incomplete("fur_et_a_mesure", 60000, 60000, 8),
                           "montant_cp_du_mois_centimes"), 40000)

    def test_C_CPI_06(self):
        """C-CPI-06, R-CP-06 : 600 € x 9 mois = 5400 € ; 540 € ; maintien 600 € en juin ou au conge principal."""
        i = m.indemnite_cp(18, 2400, 500, 540000)
        self.assertEqual(R(i, "indemnite_centimes"), 60000)
        self.assertEqual(R(m.paiement_cp_annee_incomplete("juin", 60000, 60000, 6), "montant_cp_du_mois_centimes"), 60000)

    @xfail
    def test_C_CPI_06_fur_et_a_mesure(self):
        """C-CPI-06 : au fur et a mesure, 400 € pour 12 jours puis 200 € pour 6 jours. Moteur : A-30."""
        self.assertEqual(R(m.indemnite_cp_prise_partielle("incomplete"), "indemnite_centimes"), 40000)

    @xfail
    def test_C_CPI_10(self):
        """C-CPI-10, R-CP-06 : dixieme 371,43 € ; maintien 13/26 x 780 € = 390 €. Moteur : A-26."""
        self.assertEqual(R(m.indemnite_cp(13, 2400, 450, 371429), "indemnite_centimes"), 39000)

    def test_C_CPI_11(self):
        """C-CPI-11, R-CP-06, R-CP-07 : dixieme 885,20 € ; maintien 30/26 x 780 € = 900 € ; aucun reliquat."""
        i = m.indemnite_cp(30, 2400, 450, 885208)
        self.assertEqual(R(i, "indemnite_centimes"), 90000)
        self.assertEqual(R(m.complement_cp_annee_complete(i), "complement_centimes"), 0)

    def test_C_CPI_12_indemnite(self):
        """C-CPI-12, R-CP-06 : 1/10 x (780 € x 12) = 936 € ; maintien 900 €."""
        i = m.indemnite_cp(30, 2400, 450, 936000)
        self.assertEqual(R(i, "indemnite_centimes"), 93600)
        self.assertEqual(R(i, "methode"), "dixieme")

    @xfail
    def test_C_CPI_12_reliquat(self):
        """C-CPI-12, R-CP-07 : reliquat 936 € - 900 € = 36 €. Moteur : A-29."""
        i = m.indemnite_cp(30, 2400, 450, 936000)
        self.assertEqual(R(m.complement_cp_annee_complete(i), "complement_centimes"), 3600)

    @xfail
    def test_C_CPI_13(self):
        """C-CPI-13, R-CP-06 : dixieme 270 € ; maintien 13/26 x 540 € = 270 € ; aout 810 €. Moteur : A-26."""
        i = m.indemnite_cp(13, 2400, 450, 270000)
        self.assertEqual(R(i, "indemnite_centimes"), 27000)

    @xfail
    def test_C_CPI_16(self):
        """C-CPI-16 : 18 jours pris en juin 2022 sur un droit annuel ; maintien 386,4 € applique.
        Moteur : A-29 (comparaison a chaque prise en annee complete)."""
        self.assertEqual(R(m.indemnite_cp_prise_partielle("complete"), "indemnite_centimes"), 38640)


# ---------------------------------------------------------------- Jours feries
class JoursFeries(unittest.TestCase):
    def test_C_JF_01(self):
        """C-JF-01, R-JF-02 : accueil lundi, mercredi, jeudi, vendredi ; ferie un mercredi
        (11/11/2026) : travail le lundi et le jeudi exige ; absence autorisee = travaillee."""
        f = m.ferie_chome(date(2026, 11, 11), {0, 2, 3, 4})
        self.assertEqual(R(f, "jours_condition"), ["2026-11-09", "2026-11-12"])
        self.assertTrue(R(f, "remuneration_maintenue"))
        f2 = m.ferie_chome(date(2026, 11, 11), {0, 2, 3, 4}, presence_veille="absence_autorisee")
        self.assertTrue(R(f2, "remuneration_maintenue"))

    def test_C_JF_02(self):
        """C-JF-02, R-JF-02 : jeudi 14 juillet (2022) : presence le mercredi 13 et le vendredi 15 ;
        salarie du jeudi : presence le jeudi 7 et le jeudi 21 juillet."""
        f = m.ferie_chome(date(2022, 7, 14), {0, 1, 2, 3, 4})
        self.assertEqual(R(f, "jours_condition"), ["2022-07-13", "2022-07-15"])
        self.assertTrue(R(f, "remuneration_maintenue"))
        g = m.ferie_chome(date(2022, 7, 14), {3})
        self.assertEqual(R(g, "jours_condition"), ["2022-07-07", "2022-07-21"])


# ---------------------------------------------------------------- Indemnites
class Indemnites(unittest.TestCase):
    def test_C_IND_01_9h(self):
        """C-IND-01, R-IND-02 : 4,35 € x 0,90 = 3,92 € pour 9 heures. Lectures concordantes (T-040b)."""
        self.assertEqual(R(m.minimum_entretien_journalier(date(2026, 6, 1), 540), "minimum_centimes"), 392)

    def test_C_IND_01_11h(self):
        """C-IND-01, R-IND-02 : 11 heures : 3,92 € + (2 x 0,435) = 4,79 €. A-35 leve (T-040b)."""
        self.assertEqual(R(m.minimum_entretien_journalier(date(2026, 6, 1), 660), "minimum_centimes"), 479)

    def test_C_IND_03(self):
        """C-IND-03, R-IND-02 : fevrier 2024, 10 h : 4,15 € ; 6 h ou moins : 2,65 €.
        BAREME-ABSENT leve (T-040), A-35 leve (T-040b), A-36 leve (T-040c, plus proche, ARR-01) : 10 h 415 ; 6 h 265."""
        self.assertEqual(R(m.minimum_entretien_journalier(date(2024, 2, 1), 600), "minimum_centimes"), 415)
        self.assertEqual(R(m.minimum_entretien_journalier(date(2024, 2, 1), 360), "minimum_centimes"), 265)

    def test_C_IND_04(self):
        """C-IND-04, R-IND-02 : janvier 2022, 9 h : 3,38 € ; moins de 9 h : 2,65 €.
        BAREME-ABSENT leve (T-040), A-36 leve (T-040c) : 3,384 EUR au plus proche = 3,38 EUR (decision ARR-01).
        Contradiction : l'Urssaf affiche 3,39 EUR au 01/01/2022 ; le cas officiel reste la reference du test."""
        self.assertEqual(R(m.minimum_entretien_journalier(date(2022, 1, 1), 540), "minimum_centimes"), 338)


# ---------------------------------------------------------------- Regularisation
class Regularisation(unittest.TestCase):
    @xfail
    def test_C_REG_01(self):
        """C-REG-01, R-MENS-06 : 7120 € - 7114,29 € = 5,71 € au profit du salarie.
        La fiche compte des « jours travailles » ; des feries chomes ont eu lieu
        (montant non donne). Moteur : A-06."""
        comp = dict(AUCUNE, feries_chomes_payes={"minutes": None, "incluses": False})
        r = m.regularisation_annuelle("incomplete", 711429, 500, 1424 * 60, comp)
        self.assertEqual(R(r, "ecart_centimes"), 571)

    def test_C_REG_02(self):
        """C-REG-02, R-FIN-11 : septembre 2022, 176 h x 5 € = 880 € - 600 € = 280 € ;
        regularisation definitive + 285,71 € (5,71 € + 280 €)."""
        r = m.regularisation_finale("incomplete", [571], 60000, 500, 176 * 60, AUCUNE)
        self.assertEqual(R(r, "solde_centimes"), 28571)
        self.assertEqual(R(r, "versement_centimes"), 28571)

    @xfail
    def test_C_REG_03_net(self):
        """C-REG-03 : 2940 € payes - 2772 € dus = + 168 € : pas de regularisation (net). Moteur : A-02."""
        comp = dict(AUCUNE, heures_complementaires={"minutes": 20 * 60, "incluses": True})
        r = m.regularisation_finale("incomplete", [], 294000, 300, 924 * 60, comp, nature_taux="net")
        self.assertEqual(R(r, "versement_centimes"), 0)

    @xfail
    def test_C_REG_04_net(self):
        """C-REG-04 : 2220 € - 2676 € = - 456 € : 456 € net dus. Moteur : A-02."""
        comp = dict(AUCUNE, heures_complementaires={"minutes": 20 * 60, "incluses": True})
        r = m.regularisation_finale("incomplete", [], 222000, 300, 892 * 60, comp, nature_taux="net")
        self.assertEqual(R(r, "versement_centimes"), 45600)

    @xfail
    def test_C_REG_05_net(self):
        """C-REG-05 : 2940 € - 2700 € = + 240 € : pas de regularisation (net). Moteur : A-02."""
        comp = dict(AUCUNE, heures_complementaires={"minutes": 20 * 60, "incluses": True})
        r = m.regularisation_finale("incomplete", [], 294000, 300, 900 * 60, comp, nature_taux="net")
        self.assertEqual(R(r, "versement_centimes"), 0)

    @xfail
    def test_C_REG_06_net(self):
        """C-REG-06 : 2220 € - 2580 € = - 360 € : 360 € net. Moteur : A-02."""
        comp = dict(AUCUNE, heures_complementaires={"minutes": 20 * 60, "incluses": True})
        r = m.regularisation_finale("incomplete", [], 222000, 300, 860 * 60, comp, nature_taux="net")
        self.assertEqual(R(r, "versement_centimes"), 36000)

    @xfail
    def test_C_REG_07(self):
        """C-REG-07, R-FIN-11 : 670 h effectuees (feries chomes et absences maintenues comprises,
        montants non donnes) contre 540 h payees : 130 x 4 € = 520 €. Moteur : A-06."""
        comp = dict(AUCUNE, feries_chomes_payes={"minutes": None, "incluses": True},
                    absences_remunerees={"minutes": None, "incluses": True})
        r = m.regularisation_finale("incomplete", [], 540 * 400, 400, 670 * 60, comp)
        self.assertEqual(R(r, "versement_centimes"), 52000)

    def test_C_REG_08(self):
        """C-REG-08, R-FIN-11 : 670 h contre 720 h : - 50 heures, l'assistant maternel ne doit rien."""
        comp = dict(AUCUNE, feries_chomes_payes={"minutes": None, "incluses": True},
                    absences_remunerees={"minutes": None, "incluses": True})
        r = m.regularisation_finale("incomplete", [], 720 * 400, 400, 670 * 60, comp)
        self.assertEqual(R(r, "versement_centimes"), 0)


# ---------------------------------------------------------------- Fin de contrat
class FinDeContrat(unittest.TestCase):
    @xfail
    def test_C_FIN_09(self):
        """C-FIN-09, R-FIN-09/10 : 1re periode 702 € - 540 € = 162 € ; 2e periode 240 €. Moteur : A-50."""
        p = [{"jours_acquis": 23, "jours_payes": 18, "salaires_bruts_periode_centimes": 9 * 78000},
             {"jours_acquis": 8, "jours_payes": 0, "salaires_bruts_periode_centimes": 3 * 78000}]
        r = m.iccp("complete", "normal", p, 2700, 400)
        self.assertEqual(R(r, "detail_centimes"), [16200, 24000])

    @xfail
    def test_C_FIN_09_seconde_periode(self):
        """C-FIN-09, R-CP-06 : 8 jours, maintien 8/26 x 780 € = 240 € ; dixieme 234 €. Moteur : A-26."""
        p = [{"jours_acquis": 8, "jours_payes": 0, "salaires_bruts_periode_centimes": 3 * 78000}]
        self.assertEqual(R(m.iccp("complete", "normal", p, 2700, 400), "iccp_centimes"), 24000)

    def test_C_FIN_11(self):
        """C-FIN-11, R-FIN-13 : 1 600 € x 10 % = 160 €."""
        self.assertEqual(R(m.indemnite_precarite_cdd(160000), "indemnite_centimes"), 16000)

    def test_C_FIN_12(self):
        """C-FIN-12, R-FIN-10 : 15 jours payes en juin : pas d'ICCP sur les jours restants."""
        self.assertEqual(R(m.jours_a_indemniser(15, 15), "jours"), 0)


# ---------------------------------------------------------------- Brut et net
class BrutNet(unittest.TestCase):
    def test_C_NET_01_brut(self):
        """C-NET-01, R-SAL-04/05 : au 1er juin 2026, 4,20 € brut ; 4,37 € avec titre."""
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 6, 1)), "minimum_centimes"), 420)
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 6, 1), titre_am_ap=True), "minimum_centimes"), 437)

    @xfail
    def test_C_NET_01_net(self):
        """C-NET-01 : 4,20 € brut -> 3,28 € net (metropole). Moteur : A-34."""
        self.assertEqual(R(m.convertir_brut_net(420), "net_centimes"), 328)

    def test_C_NET_02_brut(self):
        """C-NET-02, R-SAL-04/05 : du 1er janvier au 31 mai 2026, 3,64 € ; 3,79 € avec titre."""
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 1, 1)), "minimum_centimes"), 364)
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 5, 31), titre_am_ap=True), "minimum_centimes"), 379)

    @xfail
    def test_C_NET_02_net(self):
        """C-NET-02 : 3,64 € brut -> 2,86 € net. Moteur : A-34."""
        self.assertEqual(R(m.convertir_brut_net(364), "net_centimes"), 286)

    def test_C_NET_03_brut(self):
        """C-NET-03, R-SAL-04/05 : juin 2026 (fiche du 12/06/2026), 4,20 € ; 4,37 €."""
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 6, 12)), "minimum_centimes"), 420)
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 6, 12), titre_am_ap=True), "minimum_centimes"), 437)

    @xfail
    def test_C_NET_03_net(self):
        """C-NET-03 : 4,20 € (soit 3,28 € nets). Moteur : A-34."""
        self.assertEqual(R(m.convertir_brut_net(420), "net_centimes"), 328)

    @xfail
    def test_C_NET_04(self):
        """C-NET-04 : 5 € brut (soit 3,91 € net). Moteur : A-34."""
        self.assertEqual(R(m.convertir_brut_net(500), "net_centimes"), 391)

    def test_C_NET_05(self):
        """C-NET-05, R-SAL-04 : au 1er fevrier 2024, 3,45 € brut. BAREME-ABSENT leve (T-040, avenant n° 7)."""
        self.assertEqual(R(m.minimum_horaire_brut(date(2024, 2, 1)), "minimum_centimes"), 345)


if __name__ == "__main__":
    unittest.main()
