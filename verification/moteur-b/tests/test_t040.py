"""T-040 (MB5) : levee des refus A-31, A-19, A-20 et BAREME-ABSENT (2022 a 2025).
Sources : voir moteur/B/T-040-MB5.md. Les valeurs attendues sont celles des textes
(baremes) ou des formules ecrites (CCN art. 111), pas des calculs de reference."""

import os
import sys
import unittest
from datetime import date
from fractions import Fraction

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402
from moteur_b import baremes as b  # noqa: E402
from moteur_b.commun import NonGere  # noqa: E402


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


class A31Pentecote(unittest.TestCase):
    """CCN art. 47.2 et 101 ; C. trav. L3133-1, 6°."""

    def test_ferie_chome_maintenu(self):
        r = m.ferie_chome(date(2026, 5, 25), {0, 1, 2, 3, 4})
        self.assertTrue(R(r, "jour_habituellement_travaille"))
        self.assertTrue(R(r, "remuneration_maintenue"))

    def test_ferie_chome_condition_presence(self):
        r = m.ferie_chome(date(2026, 5, 25), {0, 1, 2, 3, 4}, presence_veille="absence_am")
        self.assertFalse(R(r, "remuneration_maintenue"))

    def test_ferie_hors_jour_travaille(self):
        r = m.ferie_chome(date(2026, 5, 25), {1, 2, 3})
        self.assertFalse(R(r, "jour_habituellement_travaille"))

    def test_decompte_cp_pentecote_non_decompte(self):
        # Du lundi 25/05/2026 (Pentecote) au lundi 01/06 : mardi a samedi decomptes.
        r = m.decompte_jours_cp(date(2026, 5, 25), date(2026, 6, 1), {0, 1, 2, 3, 4})
        self.assertEqual(R(r, "jours_decomptes"), 5)
        self.assertEqual(R(r, "premier_jour_decompte"), "2026-05-26")

    def test_decompte_cp_pentecote_travaillee(self):
        r = m.decompte_jours_cp(date(2026, 5, 25), date(2026, 6, 1), {0, 1, 2, 3, 4},
                                feries_travailles={date(2026, 5, 25)})
        self.assertEqual(R(r, "jours_decomptes"), 6)


class A19NonAccueil(unittest.TestCase):
    """CCN art. 111, dernier alinea."""

    def test_deduction_avec_semaine_non_accueil(self):
        r = m.deduction_absence("incomplete", 60000, 1, 20, semaines_non_accueil_dans_mois=1)
        self.assertEqual(R(r, "deduction_centimes"), 3000)
        self.assertEqual(R(r, "salaire_du_centimes"), 57000)

    def test_prevu_compte_la_semaine_de_non_accueil(self):
        planning = {0: 540, 1: 540, 2: 240, 3: 540, 4: 540}
        avec = m.prevu_du_mois(2023, 5, planning, "incomplete", contient_semaine_non_accueil=True)
        sans = m.prevu_du_mois(2023, 5, planning, "incomplete")
        self.assertEqual(R(avec, "prevu_jours"), R(sans, "prevu_jours"))


class A20MoisEntier(unittest.TestCase):
    """CCN art. 111 : deduction = salaire mensualise."""

    def test_complete(self):
        r = m.deduction_absence("complete", 78000, 9600, 9600)
        self.assertEqual(R(r, "deduction_centimes"), 78000)
        self.assertEqual(R(r, "salaire_du_centimes"), 0)
        self.assertIn("L133-5-8", r["resultat"]["note"])

    def test_incomplete(self):
        r = m.deduction_absence("incomplete", 60000, 20, 20)
        self.assertEqual(R(r, "salaire_du_centimes"), 0)


class Baremes2022a2025(unittest.TestCase):
    """Valeurs relues dans chaque texte (JORF et avenants a l'annexe 5)."""

    SMIC = {date(2022, 1, 1): 1057, date(2022, 4, 30): 1057, date(2022, 5, 1): 1085,
            date(2022, 8, 1): 1107, date(2023, 1, 1): 1127, date(2023, 5, 1): 1152,
            date(2024, 1, 1): 1165, date(2024, 10, 31): 1165, date(2024, 11, 1): 1188,
            date(2025, 12, 31): 1188, date(2026, 1, 1): 1202}
    MG = {date(2022, 1, 1): 376, date(2022, 5, 1): 386, date(2022, 8, 1): 394,
          date(2023, 1, 1): 401, date(2023, 5, 1): 410, date(2024, 1, 1): 415,
          date(2024, 11, 1): 422, date(2025, 6, 15): 422, date(2026, 1, 1): 425}
    CONV = {date(2022, 1, 1): (297, 306), date(2022, 7, 1): (306, 318), date(2022, 9, 1): (317, 330),
            date(2022, 12, 1): (320, 333), date(2023, 4, 1): (326, 339), date(2023, 5, 1): (336, 349),
            date(2023, 9, 1): (343, 357), date(2024, 2, 1): (345, 359), date(2024, 5, 1): (350, 364),
            date(2025, 3, 31): (350, 364), date(2025, 4, 1): (364, 379)}

    def test_smic(self):
        for d, v in self.SMIC.items():
            self.assertEqual(b.smic(d)[0], v, d)

    def test_mg(self):
        for d, v in self.MG.items():
            self.assertEqual(b.minimum_garanti(d)[0], v, d)

    def test_minimum_conventionnel(self):
        for d, (v, vt) in self.CONV.items():
            self.assertEqual(b.minimum_conventionnel(d)[0], v, d)
            self.assertEqual(b.minimum_conventionnel(d, titre_am_ap=True)[0], vt, d)

    def test_avant_ccn(self):
        for f in (b.smic, b.minimum_garanti, b.minimum_conventionnel):
            with self.assertRaises(NonGere) as c:
                f(date(2021, 12, 31))
            self.assertEqual(c.exception.code, "BAREME-ABSENT")

    def test_chaque_valeur_porte_sa_source(self):
        for t in (b.SMIC, b.MG, b.MINIMUM_CONVENTIONNEL, b.MINIMUM_CONVENTIONNEL_TITRE):
            for ligne in t:
                self.assertIn("legifrance.gouv.fr", ligne[3])

    def test_minimum_horaire_fevrier_2024(self):
        # C-NET-05 : avenant n° 7 ; 0,281 x 11,65 = 3,27365 EUR < 3,45 EUR.
        self.assertEqual(R(m.minimum_horaire_brut(date(2024, 2, 1)), "minimum_centimes"), 345)

    def test_minimum_legal_depasse_en_janvier_2022(self):
        # 0,281 x 10,57 = 2,97017 EUR > 2,97 EUR : T-040d, centime le plus proche = 2,97 EUR,
        # valeur exacte gardee dans details.
        r = m.minimum_horaire_brut(date(2022, 1, 1))
        self.assertEqual(R(r, "minimum_centimes"), 297)
        self.assertEqual(R(r, "origine"), "legal")
        a = r["details"]["arrondis_arr01"][0]
        self.assertEqual(a["valeur_exacte_centimes"], "297017/1000")
        self.assertIn("decision ARR-01", a["mention"])


ARR01 = "arrondi au centime le plus proche, decision ARR-01 du DG du 18/11/2026 dans l'attente de la DDETS"


class T040bEntretienProportionnel(unittest.TestCase):
    """A-35 leve (T-040b) : max(2,65 EUR ; 90 % du MG x duree / 9 h).
    A-36 leve (T-040c) : centime le plus proche, decision ARR-01 du DG."""

    def minimum(self, d, dur):
        r = m.minimum_entretien_journalier(d, dur)
        self.assertIn(ARR01, R(r, "details")["arrondi"])
        return R(r, "minimum_centimes"), R(r, "details")

    def test_minimum_6h_plancher(self):
        self.assertEqual(self.minimum(date(2026, 6, 1), 360)[0], 265)

    def test_minimum_8h_2026(self):
        self.assertEqual(self.minimum(date(2026, 6, 1), 480)[0], 348)

    def test_minimum_11h_2026(self):
        self.assertEqual(self.minimum(date(2026, 6, 1), 660)[0], 479)

    def test_minimum_10h_2024(self):
        v, det = self.minimum(date(2024, 2, 1), 600)
        self.assertEqual(v, 415)
        self.assertEqual(det["autres_lectures_centimes"]["simulateur_service_public"], 416)

    def test_9h45_2026(self):
        v, det = self.minimum(date(2026, 9, 1), 585)
        self.assertEqual(v, 424)
        self.assertTrue(det["arrondi"].endswith("le minimum exact est 4,24125 EUR"))
        self.assertEqual(det["minimum_exact_centimes"], "3393/8")

    def test_9h_2022_plus_proche(self):
        # 90 % x 3,76 = 3,384 EUR -> 3,38 EUR (C-IND-04) ; Urssaf affiche 3,39 EUR (contradiction listee).
        v, det = self.minimum(date(2022, 1, 3), 540)
        self.assertEqual(v, 338)
        self.assertTrue(det["arrondi"].endswith("3,384 EUR"))

    def test_9h_2023_plus_proche(self):
        # 90 % x 4,01 = 3,609 EUR -> 3,61 EUR ; Urssaf affiche 3,60 EUR (contradiction listee).
        self.assertEqual(self.minimum(date(2023, 1, 2), 540)[0], 361)

    def test_9h_2026_inchange(self):
        self.assertEqual(self.minimum(date(2026, 6, 1), 540)[0], 392)
        self.assertEqual(self.minimum(date(2026, 3, 1), 540)[0], 383)

    def test_mois_9h45_sous_minimum_paye_au_plus_proche(self):
        r = m.indemnite_entretien_mois([{"duree_minutes": 585, "travail_effectif": True}], f"{400 * 60}/585", date(2026, 9, 1))
        self.assertEqual(R(r, "indemnite_centimes"), 424)
        self.assertEqual(R(r, "jours_sous_minimum"), [1])
        self.assertEqual(R(r, "ecart_minimum"), "24")
        self.assertIn(ARR01, R(r, "details")[1]["arrondi"])

    def test_mois_contrat_entre_arrondi_et_exact(self):
        # 4,2410 EUR : sous le minimum exact (4,24125) mais au-dessus de 4,24 : le contrat est paye, ecart signale.
        r = m.indemnite_entretien_mois([{"duree_minutes": 585, "travail_effectif": True}],
                                       f"{Fraction(4241, 10) * 60}/585", date(2026, 9, 1))
        # Le contrat (424,1 centimes) est garde, car plus haut que 424 ; total arrondi au plus proche (T-040d).
        self.assertEqual(R(r, "indemnite_centimes"), 424)
        self.assertEqual(R(r, "jours_sous_minimum"), [1])

    def test_mois_9h_2022(self):
        r = m.indemnite_entretien_mois([{"duree_minutes": 540, "travail_effectif": True}], "300/9", date(2022, 1, 3))
        self.assertEqual(R(r, "indemnite_centimes"), 338)

    def test_verifier_journalier(self):
        self.assertTrue(R(m.verifier_entretien_journalier(450, date(2026, 9, 1), 585), "conforme"))
        self.assertFalse(R(m.verifier_entretien_journalier(424, date(2026, 9, 1), 585), "conforme"))


class T040dArrondiArr01(unittest.TestCase):
    """ARR-01 leve : centime le plus proche, valeur exacte et mention dans details."""

    def test_mensualisation(self):
        # 52 x 40 h x 5 EUR / 12 = 86 666,67 centimes -> 86 667.
        r = m.mensualisation(52, 2400, 500)
        self.assertEqual(R(r, "salaire_mensualise_centimes"), 86667)
        a = r["details"]["arrondis_arr01"]
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["valeur_exacte_centimes"], "260000/3")
        self.assertEqual(a[0]["arrondi_centimes"], 86667)
        self.assertIn("dans l'attente de la DDETS", a[0]["mention"])

    def test_entier_sans_trace(self):
        self.assertNotIn("details", m.mensualisation(52, 2400, 300))

    def test_deduction(self):
        # C-ABS-05 : 780 EUR x 40 / 168 = 185,714... EUR -> 185,71 EUR.
        r = m.deduction_absence("complete", 78000, 40, 168)
        self.assertEqual(R(r, "deduction_centimes"), 18571)
        self.assertEqual(R(r, "salaire_du_centimes"), 59429)

    def test_demi_centime(self):
        from moteur_b.commun import arrondi_arr01
        self.assertEqual(arrondi_arr01(Fraction(783, 2)), 392)
        self.assertEqual(arrondi_arr01(Fraction(-783, 2)), -392)
        self.assertEqual(arrondi_arr01(Fraction(1692, 5)), 338)

    def test_refus_autre_code_garde(self):
        # Un autre motif de refus reste prioritaire (ici A-21 : fraction de jour en annee incomplete).
        self.assertEqual(m.deduction_absence("incomplete", 60000, "1/2", 20)["code"], "A-21")


class T040eEntretienJourEtDuree(unittest.TestCase):
    """Arrondi jour par jour (ARR-01) ; duree de travail (art. 99) ou d'accueil : refus si les montants different."""
    D = date(2026, 9, 15)

    def test_arrondi_jour_par_jour(self):
        # 50,05 c/h x 8 h = 400,4 c par jour : 400 + 400 = 800 (et non 801 sur le total de 800,8).
        jours = [{"duree_minutes": 480, "travail_effectif": True}] * 2
        r = m.indemnite_entretien_mois(jours, "1001/20", self.D)
        self.assertEqual(R(r, "indemnite_centimes"), 800)
        self.assertIn("chaque jour arrondi", R(r, "arrondi_jour_par_jour"))
        a = r["details"]["arrondis_arr01"]
        self.assertEqual([x["valeur_exacte_centimes"] for x in a], ["2002/5", "2002/5"])

    def test_duree_accueil_differente_montants_differents(self):
        # T-103 (M1, A1) : ancien refus ENTRETIEN-DUREE-ACCUEIL-OU-TRAVAIL leve. CCN 114.1
        # (KALIARTI000043942300) : « versee en cas de travail effectif, par heure de travail » ;
        # CCN 99 (KALIARTI000043942263) definit le temps de travail. Seule la duree de travail compte.
        # 0,60 EUR/h ; 5 h de travail (art. 99) contre 3 h d'accueil : 3,00 EUR.
        j = [{"duree_minutes": 300, "duree_accueil_minutes": 180, "travail_effectif": True}]
        self.assertEqual(R(m.indemnite_entretien_mois(j, 60, self.D), "indemnite_centimes"), 300)

    def test_duree_accueil_differente_meme_montant(self):
        # 0,50 EUR/h : 5 h donne 2,50 EUR et 3 h 1,50 EUR, tous deux releves au plancher de 2,65 EUR.
        j = [{"duree_minutes": 300, "duree_accueil_minutes": 180, "travail_effectif": True}]
        self.assertEqual(R(m.indemnite_entretien_mois(j, 50, self.D), "indemnite_centimes"), 265)

    def test_duree_accueil_egale(self):
        j = [{"duree_minutes": 300, "duree_accueil_minutes": 300, "travail_effectif": True}]
        self.assertEqual(R(m.indemnite_entretien_mois(j, 60, self.D), "indemnite_centimes"), 300)


if __name__ == "__main__":
    unittest.main()
