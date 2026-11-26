"""T-109 (troisieme controle qualite de la n° 67) : « sept jours ouvres » (C. trav. L3142-4, 4°, deces d'un enfant de moins
de 25 ans, evenement du 01/07/2020 au 31/12/2021), comptes pour chaque contrat. Attendus faits a la main."""
import unittest
from datetime import date

import moteur_b as m


class SeptJoursOuvres(unittest.TestCase):
    def statuts(self, jours_travail):
        r = m.jours_conge_evenement("deces_enfant_majore", date(2021, 12, 31), date(2021, 12, 31), date(2022, 1, 24),
                                    jours_travail=jours_travail)
        return r["resultat"]["jours"]

    def test_lundi_au_vendredi(self):
        # 31/12 (1), 01/01 ferie, 03 au 07/01 (2 a 6), 10/01 (7) : payes ; 11/01 : hors droit.
        j = self.statuts([0, 1, 2, 3, 4])
        self.assertEqual(j["2022-01-01"], "ferie")
        self.assertEqual(j["2022-01-10"], "remunere")
        self.assertEqual(j["2022-01-11"], "hors_droit")
        self.assertEqual(j["2022-01-08"], "non_ouvrable")
        self.assertEqual(sum(1 for v in j.values() if v == "remunere"), 7)

    def test_lundi_mardi(self):
        # 03, 04, 10, 11, 17, 18 et 24/01 (7e) : tous payes.
        j = self.statuts([0, 1])
        self.assertEqual(j["2022-01-24"], "remunere")
        self.assertEqual(sum(1 for v in j.values() if v == "remunere"), 7)
        self.assertNotIn("hors_droit", j.values())

    def test_sans_planning(self):
        r = m.jours_conge_evenement("deces_enfant_majore", date(2021, 12, 31), date(2021, 12, 31), date(2022, 1, 24))
        self.assertEqual(r["statut"], "non_gere")


if __name__ == "__main__":
    unittest.main()
