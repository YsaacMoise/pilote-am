"""T-113 : decompte journalier des conges acquis pour tout horaire de 1 a 6 jours par semaine. DDETS 31, fiche 2/5 du
05/11/2024 : « 4 jours de travail par semaine x 4 semaines 16 jours » (12 sur 3 jours) ; F18260 : 20 sur 5 jours, 24 sur 6.
Attendus faits a la main (calculateur-arvela, regles/t113-quatre-jours.md)."""
import unittest
from datetime import date, timedelta

import moteur_b as m


def jours(du, au):
    return [du + timedelta(days=i) for i in range((au - du).days + 1)]


ABSENCE = jours(date(2025, 10, 1), date(2025, 12, 15))


class JournalierToutHoraire(unittest.TestCase):
    def acquis(self, jts, na=ABSENCE, debut=date(2025, 6, 2)):
        r = m.acquisition_cp_periode("complete", debut, date(2026, 5, 31), jours_non_assimiles=na, jours_travail_semaine=jts)
        return r["resultat"]

    def test_quatre_jours(self):
        # Lundi, mardi, jeudi, vendredi : 208 - 43 = 165 jours ; 165 / 16 x 2,5 = 825/32 = 25,78 -> 26.
        r = self.acquis([0, 1, 3, 4])
        self.assertEqual(r["decompte"]["methodes"]["journalier"], "825/32")
        self.assertEqual(r["decompte"]["methodes"]["hebdomadaire"], "25")
        self.assertEqual(r["jours_acquis"], 26)

    def test_trois_jours(self):
        # Lundi, mardi, jeudi : 156 - 32 = 124 jours ; 124 / 12 x 2,5 = 155/6 = 25,83 -> 26.
        r = self.acquis([0, 1, 3])
        self.assertEqual(r["decompte"]["methodes"]["journalier"], "155/6")
        self.assertEqual(r["jours_acquis"], 26)

    def test_cinq_jours_inchange(self):
        # 260 - 54 = 206 jours ; 206 / 20 x 2,5 = 103/4 = 25,75 -> 26 (T-109).
        r = self.acquis([0, 1, 2, 3, 4])
        self.assertEqual(r["decompte"]["methodes"]["journalier"], "103/4")
        self.assertEqual(r["jours_acquis"], 26)

    def test_un_jour(self):
        # Lundi seul : 52 - 11 = 41 jours ; 41 / 4 x 2,5 = 25,625 -> 26.
        r = self.acquis([0])
        self.assertEqual(r["decompte"]["methodes"]["journalier"], "205/8")
        self.assertEqual(r["jours_acquis"], 26)

    def test_semaine_sans_jour_de_travail(self):
        # Sans solde du lundi au vendredi, 8 semaines, week-ends hors absence : semaines entieres 44 / 4 x 2,5 = 27,5 ;
        # 4 jours : 176 / 16 x 2,5 = 27,5 -> 28.
        na = [d for l in range(8) for d in jours(date(2026, 1, 5) + timedelta(weeks=l), date(2026, 1, 9) + timedelta(weeks=l))]
        r = self.acquis([0, 1, 3, 4], na)
        self.assertEqual(r["decompte"]["methodes"]["hebdomadaire"], "55/2")
        self.assertEqual(r["decompte"]["methodes"]["journalier"], "55/2")
        self.assertEqual(r["jours_acquis"], 28)


if __name__ == "__main__":
    unittest.main()
