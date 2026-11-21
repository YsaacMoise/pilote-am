"""Tests des refus explicites du moteur B.

Ces tests ne contiennent aucun montant attendu. Ils verifient seulement que
chaque ambiguite (liste A-xx de regles-v0.md), chaque exemple suspect cite
(SUS-xx), chaque regle douteuse (contre-verification-v0.md) et chaque cas exclu
produit « non gere » avec son identifiant, et que les entrees interdites
(nombres a virgule flottante) sont rejetees. Le code attendu vient du registre
des ambiguites ou de la liste des exclusions, pas d'un calcul.
"""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

AUCUNE = {"feries_chomes_payes": {"minutes": 0, "incluses": False},
          "absences_remunerees": {"minutes": 0, "incluses": False},
          "heures_complementaires": {"minutes": 0, "incluses": False}}


class Refus(unittest.TestCase):
    def refus(self, sortie, code):
        self.assertEqual(sortie["statut"], "non_gere", sortie)
        self.assertEqual(sortie["code"], code, sortie)
        self.assertIn("quoi_faire", sortie)

    # Mensualisation
    def test_A_01(self):
        self.refus(m.mensualisation(48, 2400, 500), "A-01")

    def test_A_02(self):
        self.refus(m.mensualisation(36, 2400, 300, nature_taux="net"), "A-02")

    def test_A_04(self):
        self.refus(m.mensualisation(36, 2400, 500, horaires_variables=True), "A-04")

    def test_A_05(self):
        self.refus(m.type_annee("36"), "A-05")

    def test_A_13(self):
        self.refus(m.mensualisation(52, 2760, 500), "A-13")

    # T-040d : ARR-01 leve (centime le plus proche, decision du DG) ; tests dans test_t040.py.

    def test_HORS_CCN(self):
        self.refus(m.mensualisation(36, 2400, 500, date_paie=date(2021, 10, 1)), "HORS-CCN")

    # Heures en plus
    def test_A_09(self):
        self.refus(m.heures_en_plus_semaine(2400, 2520, 500, 15, absence_dans_semaine=True), "A-09")

    def test_A_13_heures(self):
        self.refus(m.heures_en_plus_semaine(2760, 2880, 500, 15), "A-13")

    def test_majoration_inferieure_a_10(self):
        self.assertEqual(m.heures_en_plus_semaine(2400, 2820, 500, 5)["statut"], "erreur_saisie")

    # Absences
    def test_A_08(self):
        self.refus(m.qualifier_absence("adaptation", "incomplete"), "A-08")

    def test_A_15(self):
        self.refus(m.absence_enfant_malade(3, 5, 3), "A-15")

    def test_A_16(self):
        self.refus(m.absence_enfant_malade(2, 2, 2, cumul_anterieur_12_mois_glissants=1), "A-16")

    def test_A_17(self):
        self.refus(m.absence_enfant_malade(6, 6, 6), "A-17")

    # T-040 : A-19 et A-20 leves (CCN art. 111) ; tests dans test_t040.py.

    def test_A_21(self):
        self.refus(m.deduction_absence("incomplete", 60000, "1/2", 20), "A-21")

    def test_A_25(self):
        self.refus(m.qualifier_absence("conge_complementaire_non_remunere", "complete"), "A-25")

    def test_R_ABS_06(self):
        self.refus(m.qualifier_absence("am_evenement_familial", "complete"), "R-ABS-06")

    def test_M_05(self):
        self.refus(m.qualifier_absence("am_evenement_familial_indemnise_secu", "complete"), "M-05")

    def test_M_06(self):
        self.refus(m.qualifier_absence("am_deuil_complementaire", "complete"), "M-06")

    def test_exclus_absences(self):
        self.refus(m.qualifier_absence("maternite", "complete"), "EXCLU-MATERNITE")
        self.refus(m.qualifier_absence("accident_travail", "complete"), "EXCLU-AT")

    # Jours feries
    # T-040 : A-31 leve (CCN art. 47.2, C. trav. L3133-1, 6°) ; tests dans test_t040.py.

    def test_A_32(self):
        self.refus(m.ferie_chome(date(2026, 11, 11), {0, 1, 2, 3, 4}, presence_veille="absence_enfant"), "A-32")

    def test_A_33(self):
        self.refus(m.ferie_travaille(date(2026, 7, 14)), "A-33")

    # Conges payes
    def test_A_23(self):
        self.refus(m.acquisition_cp("complete", mois=5), "A-23")

    def test_SUS_11(self):
        self.refus(m.acquisition_cp("incomplete", semaines=28), "SUS-11")

    def test_CP_ARRONDI_PARTS(self):
        self.refus(m.acquisition_cp("complete", mois=1, semaines=2, mois_arret_maladie=1, semaines_arret_maladie=1,
                                    date_fin_periode=date(2026, 5, 31)), "CP-ARRONDI-PARTS")

    def test_R_CP_02_DATE(self):
        self.refus(m.acquisition_cp("complete", mois=10, semaines=43, mois_arret_maladie=2, semaines_arret_maladie=8,
                                    date_fin_periode=date(2023, 5, 31)), "R-CP-02-DATE")

    def test_CP_REPORT(self):
        self.refus(m.acquisition_cp("complete", report=True), "CP-REPORT")

    def test_A_26(self):
        self.refus(m.indemnite_cp(13, 2400, 450, 100000), "A-26")

    def test_A_28(self):
        self.refus(m.indemnite_cp(24, 2400, 500, 780000, icp_versee_pendant_periode_centimes=0,
                                  icp_annee_precedente_centimes=40000), "A-28")

    def test_CP_SUPP(self):
        self.refus(m.indemnite_cp(24, 2400, 500, 700000, jours_supplementaires=4), "CP-SUPP")

    def test_A_29(self):
        self.refus(m.indemnite_cp_prise_partielle("complete"), "A-29")

    def test_A_30(self):
        self.refus(m.paiement_cp_annee_incomplete("fur_et_a_mesure", 60000, 60000, 8), "A-30")

    def test_R_CP_08_PRISE(self):
        self.refus(m.paiement_cp_annee_incomplete("prise_principale", 60000, 60000, 8, 8,
                                                  prise_principale_sur_deux_mois=True), "R-CP-08-PRISE")

    # Indemnites
    # T-040b : A-35 leve (tests dans test_t040.py).
    # T-040c : A-36 leve (decision ARR-01) ; tests dans test_t040.py.

    # T-027 : A-37 leve (bareme fiscal relu). Taux 35 : entre 24 et 41 (bareme majore 5 CV et moins).
    def test_A_38(self):
        self.refus(m.indemnite_kilometrique(10, 35, date(2026, 6, 1), 5), "A-38")

    def test_KM_SOUS_PLANCHER(self):
        self.refus(m.indemnite_kilometrique(10, 20, date(2026, 6, 1), 5), "KM-SOUS-PLANCHER")

    # Baremes
    def test_A_52(self):
        self.refus(m.minimum_horaire_brut(date(2026, 12, 1)), "A-52")

    def test_A_54(self):
        self.refus(m.minimum_horaire_brut(date(2026, 6, 1), titre_am_ap=True, titre_obtenu_dans_le_mois=True), "A-54")

    def test_BAREME_ABSENT(self):
        # T-040 : baremes dates depuis le 01/01/2022 ; avant, aucun bareme.
        self.refus(m.minimum_horaire_brut(date(2021, 12, 31)), "BAREME-ABSENT")

    def test_provisoire(self):
        s = m.minimum_horaire_brut(date(2026, 11, 25))
        self.assertEqual(s["statut"], "provisoire")

    # Fin de contrat
    # T-027 : A-43 leve (CCN art. 120 : anciennete a la date d'envoi).

    def test_LIMITE_ANCIENNETE(self):
        self.refus(m.duree_preavis("employeur", date(2026, 1, 10), date(2026, 4, 10), date(2026, 4, 12)),
                   "LIMITE-ANCIENNETE")

    def test_DATE_MOIS(self):
        self.refus(m.duree_preavis("employeur", date(2026, 1, 31), date(2026, 6, 5), date(2026, 6, 6)), "DATE-MOIS")

    def test_A_45(self):
        self.refus(m.indemnite_rupture("normal", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000,
                                       iccp_centimes=40000), "A-45")

    # test_A_47 retire (T-035a) : A-47 levee, voir test_t035.py.

    def test_A_48(self):
        self.refus(m.iccp("complete", "agrement", [], 2400, 500), "A-48")

    def test_A_49(self):
        self.refus(m.iccp("complete", "faute_lourde", [], 2400, 500), "A-49")

    def test_A_50(self):
        p = [{"jours_acquis": 23, "jours_payes": 18, "salaires_bruts_periode_centimes": 702000}]
        self.refus(m.iccp("complete", "normal", p, 2700, 400), "A-50")

    def test_A_06(self):
        comp = dict(AUCUNE, feries_chomes_payes={"minutes": 480, "incluses": False})
        self.refus(m.regularisation_annuelle("incomplete", 700000, 500, 1424 * 60, comp), "A-06")

    def test_exclus_fin(self):
        self.refus(m.duree_preavis("employeur", date(2025, 1, 5), date(2026, 6, 5), date(2026, 6, 6),
                                   motif="inaptitude"), "EXCLU-INAPTITUDE")
        self.refus(m.indemnite_precarite_cdd(100000, exclusion="saisonnier"), "EXCLU-SAISONNIER")

    # Perimetre et net
    def test_perimetre(self):
        self.refus(m.verifier_perimetre("67"), "EXCLU-ALSACE-MOSELLE")
        self.refus(m.verifier_perimetre("974"), "EXCLU-HORS-METROPOLE")
        self.refus(m.verifier_perimetre("76", accueil="occasionnel"), "EXCLU-OCCASIONNEL")
        self.refus(m.verifier_perimetre("76", semaines_alternees=True), "EXCLU-ALTERNEES")
        self.refus(m.verifier_perimetre("76", type_contrat="CDD", cdd_remplacement=True), "R-MENS-10")
        self.refus(m.verifier_perimetre("76", majoration_difficultes_enfant=True), "A-55")
        self.assertEqual(m.verifier_perimetre("76")["statut"], "ok")

    def test_A_34(self):
        self.refus(m.convertir_brut_net(420), "A-34")

    # Entrees interdites
    def test_float_refuse(self):
        self.assertEqual(m.mensualisation(36, 2400, 5.0)["statut"], "erreur_saisie")


if __name__ == "__main__":
    unittest.main()
