"""T-077 (MB7) : region du contrat, Alsace-Moselle et Mayotte.
Specification : regles/t077-decisions.md (R1 a R4) ; textes : regles/t077-alsace-moselle.md, t077-mayotte.md.
Chaque attendu est chiffre a la main depuis ces textes (calcul ecrit en commentaire)."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

LUN_VEN = {0, 1, 2, 3, 4}
MAR_VEN = {1, 2, 3, 4}
LUN_JEU = {0, 1, 2, 3}


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


class Base(unittest.TestCase):
    def refus(self, s, code):
        self.assertEqual(s["statut"], "non_gere", s)
        self.assertEqual(s["code"], code, s)
        return s.get("details", {})


class R0Perimetre(Base):
    """R0 : 57, 67, 68 -> Alsace-Moselle ; 976 -> Mayotte ; autres outre-mer hors B."""

    def test_regions(self):
        self.assertEqual(R(m.verifier_perimetre("57"), "region"), "alsace_moselle")
        self.assertEqual(R(m.verifier_perimetre("68"), "region"), "alsace_moselle")
        self.assertEqual(R(m.verifier_perimetre("976"), "region"), "mayotte")
        self.assertEqual(R(m.verifier_perimetre("75"), "region"), "metropole")
        self.refus(m.verifier_perimetre("971"), "EXCLU-HORS-METROPOLE")

    def test_region_inconnue(self):
        self.assertEqual(m.brut_depuis_net(100, date(2026, 1, 1), "reunion")["statut"], "erreur_saisie")


class R1PartNetBrut(Base):
    """R1 : brut = arrondi(net x 10 000 / part), demi vers le haut."""

    def test_metropole(self):
        # 391 / 0,7810 = 500,64 -> 501 (cas C-NET-04 : 3,91 EUR net pour 5 EUR brut).
        self.assertEqual(R(m.brut_depuis_net(391, date(2023, 1, 1)), "brut_estime_centimes"), 501)

    def test_alsace_moselle_avant_et_apres_avril_2022(self):
        # Mars 2022 : 1,50 % -> part 7 660 ; 391 / 0,7660 = 510,44 -> 510.
        s = m.brut_depuis_net(391, date(2022, 3, 31), "alsace_moselle")
        self.assertEqual(R(s, "part_net_pour_dix_mille"), 7660)
        self.assertEqual(R(s, "brut_estime_centimes"), 510)
        # Avril 2022 : 1,30 % -> part 7 680 ; 391 / 0,7680 = 509,11 -> 509.
        s = m.brut_depuis_net(391, date(2022, 4, 1), "alsace_moselle")
        self.assertEqual(R(s, "part_net_pour_dix_mille"), 7680)
        self.assertEqual(R(s, "brut_estime_centimes"), 509)
        # 2026 : 10,00 EUR / 0,7680 = 13,0208 -> 13,02 EUR.
        self.assertEqual(R(m.brut_depuis_net(1000, date(2026, 1, 15), "alsace_moselle"), "brut_estime_centimes"), 1302)

    def test_mayotte(self):
        # 11,80 % de cotisations salariales -> part 8 820 ; 3,28 / 0,8820 = 3,7188 -> 3,72 ; 10 / 0,882 = 11,338 -> 11,34.
        self.assertEqual(R(m.brut_depuis_net(328, date(2026, 6, 15), "mayotte"), "brut_estime_centimes"), 372)
        self.assertEqual(R(m.brut_depuis_net(1000, date(2022, 2, 1), "mayotte"), "brut_estime_centimes"), 1134)

    def test_concorde_avec_le_repere_urssaf_de_mayotte(self):
        # Controle t077-mayotte 4.a : 4,20 EUR x 88,20 % = 3,7044 -> 3,70 EUR publie ; en sens inverse 3,70 / 0,882 = 4,195 -> 4,20.
        self.assertEqual(R(m.brut_depuis_net(370, date(2026, 6, 15), "mayotte"), "brut_estime_centimes"), 420)


class R2Minimum(Base):
    """R2 : repere net Urssaf par region ; minimum legal a Mayotte avec le SMIC de Mayotte."""

    def test_repere_net(self):
        attendus = {date(2025, 1, 15): (274, 269, 308), date(2025, 4, 1): (286, 281, 321),
                    date(2026, 5, 31): (286, 281, 321), date(2026, 6, 15): (328, 323, 370)}
        for d, (me, am, my) in attendus.items():
            self.assertEqual(R(m.repere_net_minimum(d), "repere_net_centimes"), me)
            self.assertEqual(R(m.repere_net_minimum(d, "alsace_moselle"), "repere_net_centimes"), am)
            self.assertEqual(R(m.repere_net_minimum(d, "mayotte"), "repere_net_centimes"), my)

    def test_repere_net_absent_avant_2025(self):
        self.refus(m.repere_net_minimum(date(2024, 12, 31), "mayotte"), "REPERE-NET-ABSENT")

    def test_minimum_mayotte_smic_local(self):
        # 01/01/2022 : 0,281 x 7,98 = 2,24238 EUR < grille 2,97 EUR -> 2,97 EUR, origine conventionnelle.
        s = m.minimum_horaire_brut(date(2022, 1, 1), region="mayotte")
        self.assertEqual(R(s, "minimum_centimes"), 297)
        self.assertEqual(R(s, "origine"), "conventionnel")
        self.assertEqual(R(s, "minimum_legal_exact_centimes"), "112119/500")
        # Metropole : 0,281 x 10,57 = 2,97017 EUR > 2,97 EUR -> minimum legal.
        self.assertEqual(R(m.minimum_horaire_brut(date(2022, 1, 1)), "origine"), "legal")

    def test_taux_297_conforme_a_mayotte_seulement(self):
        # 2,97 EUR >= 2,97 EUR (grille) et >= 2,2424 EUR (Mayotte) ; 2,97 EUR < 2,97017 EUR (metropole).
        self.assertTrue(R(m.verifier_taux_horaire(297, date(2022, 1, 1), region="mayotte"), "conforme"))
        self.assertFalse(R(m.verifier_taux_horaire(297, date(2022, 1, 1)), "conforme"))

    def test_minimum_2026(self):
        # 01/06/2026 : grille 4,20 EUR ; 0,281 x 9,56 = 2,686 EUR.
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 6, 15), region="mayotte"), "minimum_centimes"), 420)
        self.assertEqual(R(m.minimum_horaire_brut(date(2026, 6, 15), region="alsace_moselle"), "minimum_centimes"), 420)

    def test_a52_a_mayotte(self):
        # C. trav. L3423-1 : le SMIC de Mayotte est releve a la meme date que celui de la metropole.
        self.refus(m.minimum_horaire_brut(date(2026, 12, 1), region="mayotte"), "A-52")

    def test_titre_mayotte(self):
        self.refus(m.minimum_horaire_brut(date(2026, 6, 15), titre_am_ap=True, region="mayotte"), "A77-TITRE-MAYOTTE")


class R3FeriesLocaux(Base):
    """R3 : 26/12 et Vendredi saint (Alsace-Moselle), 27/04 (Mayotte) : deux lectures."""

    def test_liste(self):
        self.assertEqual(set(m.feries_locaux(2026, "alsace_moselle")), {date(2026, 4, 3), date(2026, 12, 26)})
        self.assertEqual(set(m.feries_locaux(2025, "alsace_moselle")), {date(2025, 4, 18), date(2025, 12, 26)})
        self.assertEqual(set(m.feries_locaux(2026, "mayotte")), {date(2026, 4, 27)})
        self.assertEqual(m.feries_locaux(2026, "metropole"), {})

    def test_jour_prevu_non_travaille_a_confirmer(self):
        det = self.refus(m.ferie_chome(date(2026, 4, 3), MAR_VEN, region="alsace_moselle"), "A77-FERIE-LOCAL")
        # Lecture A : jours de condition jeudi 02/04 et mardi 07/04 (lundi non prevu).
        self.assertIn("2026-04-02", det["lectures"]["A"])
        self.assertIn("2026-04-07", det["lectures"]["A"])
        self.refus(m.ferie_chome(date(2026, 4, 27), LUN_VEN, region="mayotte"), "A77-FERIE-LOCAL")
        # Lecture A, 26/12/2025 (vendredi) : le jour voisin 25/12 est ferie -> A-32 dans cette lecture.
        det = self.refus(m.ferie_chome(date(2025, 12, 26), LUN_VEN, region="alsace_moselle"), "A77-FERIE-LOCAL")
        self.assertTrue(det["lectures"]["A"].startswith("A-32"))

    def test_jour_non_prevu_sans_effet(self):
        # 26/12/2026 est un samedi ; 27/04/2025 un dimanche : sans effet dans les deux lectures.
        self.assertFalse(R(m.ferie_chome(date(2026, 12, 26), LUN_VEN, region="alsace_moselle"),
                           "jour_habituellement_travaille"))
        self.assertFalse(R(m.ferie_chome(date(2025, 4, 27), LUN_VEN, region="mayotte"), "jour_habituellement_travaille"))

    def test_pas_un_ferie_en_metropole(self):
        self.assertEqual(m.ferie_chome(date(2026, 4, 3), LUN_VEN)["statut"], "erreur_saisie")

    def test_ferie_national_voisin(self):
        # Lundi de Paques 06/04/2026 : jour de travail precedent vendredi 03/04 = Vendredi saint.
        det = self.refus(m.ferie_chome(date(2026, 4, 6), LUN_VEN, region="alsace_moselle"), "A77-FERIE-VOISIN")
        self.assertEqual(det["jours_condition"], ["2026-04-03", "2026-04-07"])
        self.assertTrue(R(m.ferie_chome(date(2026, 4, 6), LUN_VEN), "remuneration_maintenue"))
        # Lundi a jeudi : le 26/12/2025 (vendredi) n'est pas prevu ; 25/12 jeudi, voisins 24/12 et 29/12.
        s = m.ferie_chome(date(2025, 12, 25), LUN_JEU, region="alsace_moselle")
        self.assertEqual(R(s, "jours_condition"), ["2025-12-24", "2025-12-29"])
        self.assertTrue(R(s, "remuneration_maintenue"))
        s = m.ferie_chome(date(2025, 12, 25), LUN_JEU, presence_veille="absence_am", region="alsace_moselle")
        self.assertFalse(R(s, "remuneration_maintenue"))
        # Mayotte : le Vendredi saint est un jour ordinaire, le lundi de Paques se traite comme en metropole.
        self.assertTrue(R(m.ferie_chome(date(2026, 4, 6), LUN_VEN, region="mayotte"), "remuneration_maintenue"))

    def test_ferie_local_travaille(self):
        # 8 h a 5,00 EUR : 480 x 500 x 10 / 100 / 60 = 400 centimes (4,00 EUR) en lecture A ; 0 en lecture B.
        det = self.refus(m.ferie_local_travaille(date(2026, 4, 27), "mayotte", 480, 500), "A77-FERIE-LOCAL-TRAVAILLE")
        self.assertEqual(det["lectures"], {"A": 400, "B": 0})
        # 7 h 30 a 4,37 EUR : 450 x 437 / 600 = 327,75 -> 328 centimes (ARR-01).
        det = self.refus(m.ferie_local_travaille(date(2025, 12, 26), "alsace_moselle", 450, 437),
                         "A77-FERIE-LOCAL-TRAVAILLE")
        self.assertEqual(det["lectures"]["A"], 328)

    def test_decompte_cp(self):
        # Du lundi 22/12/2025 a la reprise du lundi 05/01/2026 : ouvrables 22, 23, 24, 26, 27, 29, 30, 31/12, 02, 03/01
        # (25/12 et 01/01 feries) = 10 jours ; sans le 26/12 (lecture A) = 9.
        det = self.refus(m.decompte_jours_cp(date(2025, 12, 22), date(2026, 1, 5), LUN_VEN, region="alsace_moselle"),
                         "A77-DECOMPTE-CP")
        self.assertEqual(det["lectures"], {"A": 9, "B": 10})
        self.assertEqual(R(m.decompte_jours_cp(date(2025, 12, 22), date(2026, 1, 5), LUN_VEN), "jours_decomptes"), 10)
        # Mayotte, du 20/04 au 04/05/2026 : 20-25, 27-30/04, 02/05 = 11 jours ; sans le 27/04 = 10.
        det = self.refus(m.decompte_jours_cp(date(2026, 4, 20), date(2026, 5, 4), LUN_VEN, region="mayotte"),
                         "A77-DECOMPTE-CP")
        self.assertEqual(det["lectures"], {"A": 10, "B": 11})
        # 26/12/2026 est un samedi, jour ouvrable : il change aussi le decompte (21/12/2026 -> 04/01/2027 : 10 ou 9).
        det = self.refus(m.decompte_jours_cp(date(2026, 12, 21), date(2027, 1, 4), LUN_VEN, region="alsace_moselle"),
                         "A77-DECOMPTE-CP")
        self.assertEqual(det["lectures"], {"A": 9, "B": 10})

    def test_decompte_sans_ferie_local(self):
        # Semaine du 07/09/2026 : 6 jours ouvrables, rien a confirmer.
        self.assertEqual(R(m.decompte_jours_cp(date(2026, 9, 7), date(2026, 9, 14), LUN_VEN, region="alsace_moselle"),
                           "jours_decomptes"), 6)


class R4MaintienDroitLocal(Base):
    """R4 : maladie de l'AM ou enfant de l'AM malade en Alsace-Moselle : maintien (L1226-23) ou retenue."""

    def test_alsace_moselle_a_confirmer(self):
        for t in ("am_maladie", "am_enfant_malade"):
            for an in ("complete", "incomplete"):
                det = self.refus(m.qualifier_absence(t, an, "alsace_moselle"), "A77-MAINTIEN-LOCAL")
                self.assertIn("A", det["lectures"])

    def test_mayotte_et_metropole_retenue(self):
        for reg in ("mayotte", "metropole"):
            self.assertTrue(R(m.qualifier_absence("am_maladie", "complete", reg), "deductible"))
            self.assertTrue(R(m.qualifier_absence("am_enfant_malade", "incomplete", reg), "deductible"))

    def test_autres_absences_inchangees(self):
        self.assertTrue(R(m.qualifier_absence("am_convenance_personnelle", "complete", "alsace_moselle"), "deductible"))
        self.assertFalse(R(m.qualifier_absence("enfant_non_prevue", "complete", "alsace_moselle"), "deductible"))

    def test_montant_a_confirmer(self):
        # Montant a confirmer = salaire des jours selon l'art. 111. 52 semaines x 40 h x 5,00 EUR / 12 = 866,67 EUR ;
        # 2 jours de 8 h en septembre 2026 (22 jours prevus x 480 min = 10 560 min) :
        # 86 667 x 960 / 10 560 = 7 878,8 -> 78,79 EUR.
        self.assertEqual(R(m.mensualisation(52, 2400, 500), "salaire_mensualise_centimes"), 86667)
        self.assertEqual(R(m.prevu_du_mois(2026, 9, {i: 480 for i in range(5)}, "complete"), "prevu_minutes"), 10560)
        self.assertEqual(R(m.deduction_absence("complete", 86667, 960, 10560), "deduction_centimes"), 7879)


if __name__ == "__main__":
    unittest.main()
