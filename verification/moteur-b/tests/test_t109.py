"""T-109 (troisieme controle qualite de la n° 67) : « sept jours ouvres » (C. trav. L3142-4, 4°, deces d'un enfant de moins
de 25 ans, evenement du 01/07/2020 au 31/12/2021), comptes pour chaque contrat. Attendus faits a la main."""
import unittest
from datetime import date, timedelta

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



class AbsencePayeeConges(unittest.TestCase):
    """Controle n° 4 de la n° 67 : absence payee par les parents et conges acquis (CCN 48.1.1.2 ; L3141-5 ; L1225-16).
    Contrat du lundi au vendredi, du 02/06/2025 au 31/05/2026 ; absence du 01/10 au 15/12/2025 (dix semaines et six jours) :
    hors absence, 206 jours prevus du lundi au vendredi : 2,5 x 206 / 20 = 25,75 -> 26 jours si elle ne compte pas (decompte
    le plus favorable ; mensuel 24,06 et hebdomadaire 25) ; 30 si elle compte."""

    def jours(self, assimilee):
        d0, d1 = date(2025, 10, 1), date(2025, 12, 15)
        na = [] if assimilee else [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
        r = m.acquisition_cp_periode("complete", date(2025, 6, 2), date(2026, 5, 31), jours_non_assimiles=na,
                                     jours_travail_semaine=[0, 1, 2, 3, 4])
        return r["resultat"]["jours_acquis"]

    def test_regle(self):
        a = m.assimilation_cp_absence_payee
        self.assertTrue(a("examen_grossesse")["resultat"]["assimilee"])
        self.assertFalse(a("absence_payee")["resultat"]["assimilee"])
        self.assertFalse(a("absence_payee", compte_pour_conges=False)["resultat"]["assimilee"])
        self.assertTrue(a("absence_payee", compte_pour_conges=True)["resultat"]["assimilee"])
        self.assertEqual(a("autre")["statut"], "erreur_saisie")

    def test_jours(self):
        self.assertEqual(self.jours(False), 26)
        self.assertEqual(self.jours(True), 30)

    def test_pas_de_retenue(self):
        for t in ("am_absence_payee", "am_examen_grossesse"):
            self.assertFalse(m.qualifier_absence(t, "complete")["resultat"]["deductible"])


if __name__ == "__main__":
    unittest.main()
