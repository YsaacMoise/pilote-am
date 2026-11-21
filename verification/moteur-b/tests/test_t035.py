"""Tests T-035a : embauche en cours de mois, deces de l'enfant, entretien sous le minimum.

Attendus tires des sources seules (citees dans moteur/B/T-035-MB3.md) :
- Fiches DREETS Occitanie du 19/01/2023 (52 s et 46 s ou moins) : « Embauche et fin
  de contrat en cours de mois » sont des absences non remunerees a deduire selon
  l'art. 111 de la CCN.
- Urssaf, « gerer les absences » (17/09/2026), exemple 46 semaines :
  « 370 EUR - [(370 EUR x 8 jours) / 16 jours] = 185 EUR ».
- CCN art. 119.4.2 et 121.1 ; service-public F16842 (verifie le 13/06/2025).
- CCN art. 114.1 ; Urssaf « Remunerer » (01/06/2026) : 3,83 EUR (01/01 au 31/05/2026),
  3,92 EUR (au 1er juin 2026) par jour de 9 heures.
"""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

JOUR_9H = {"duree_minutes": 540, "travail_effectif": True}


class EmbaucheEnCoursDeMois(unittest.TestCase):
    def test_qualification_deductible(self):
        for t in ("complete", "incomplete"):
            r = m.qualifier_absence("embauche_en_cours_de_mois", t)
            self.assertEqual(r["statut"], "ok", r)
            self.assertTrue(r["resultat"]["deductible"])
            self.assertIn("R-EMB-01", r["regles"])

    def test_formule_art_111_exemple_urssaf_46_semaines(self):
        # Meme formule que pour toute absence non remuneree (fiches DREETS, § 3).
        r = m.deduction_absence("incomplete", 37000, 8, 16)
        self.assertEqual(r["resultat"]["deduction_centimes"], 18500)
        self.assertEqual(r["resultat"]["salaire_du_centimes"], 18500)


class DecesEnfant(unittest.TestCase):
    def test_du_avant_9_mois(self):
        # CCN 119.4.2 + F16842 : due quelle que soit l'anciennete ; montant = 1/80 (121.1).
        r = m.indemnite_rupture("deces_enfant", "employeur", date(2026, 1, 5), date(2026, 6, 20), 400000)
        self.assertEqual(r["statut"], "ok", r)
        self.assertEqual(r["resultat"]["indemnite_centimes"], 5000)
        self.assertIn("R-FIN-07", r["regles"])

    def test_retrait_avant_9_mois_reste_non_du(self):
        # CCN 121.1 : retrait de l'enfant, moins de 9 mois : rien.
        r = m.indemnite_rupture("normal", "employeur", date(2026, 1, 5), date(2026, 6, 20), 400000)
        self.assertEqual(r["resultat"]["indemnite_centimes"], 0)

    def test_deces_apres_9_mois_meme_formule(self):
        r = m.indemnite_rupture("deces_enfant", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000)
        self.assertEqual(r["resultat"]["indemnite_centimes"], 10000)


class EntretienSousMinimum(unittest.TestCase):
    def test_9h_juin_2026_paye_392(self):
        r = m.indemnite_entretien_mois([JOUR_9H, JOUR_9H], "300/9", date(2026, 9, 15))
        self.assertIn(r["statut"], ("ok", "provisoire"), r)
        self.assertEqual(r["resultat"]["indemnite_centimes"], 2 * 392)
        self.assertEqual(r["resultat"]["jours_sous_minimum"], [1, 2])
        self.assertEqual(r["resultat"]["ecart_minimum"], "184")
        self.assertTrue(r.get("notes"))

    def test_9h_mars_2026_paye_383(self):
        r = m.indemnite_entretien_mois([JOUR_9H], "300/9", date(2026, 3, 10))
        self.assertEqual(r["resultat"]["indemnite_centimes"], 383)

    def test_9h_conforme_sans_signal(self):
        r = m.indemnite_entretien_mois([JOUR_9H], "400/9", date(2026, 9, 15))
        self.assertEqual(r["resultat"]["indemnite_centimes"], 400)
        self.assertNotIn("jours_sous_minimum", r["resultat"])
        self.assertNotIn("notes", r)

    def test_autre_duree_paye_au_minimum(self):
        # T-040b : A-35 leve. 8 h au 15/09/2026 : 391,5 x 8 / 9 = 348 centimes exacts,
        # trois lectures a 348 : paye 348, ecart signale.
        r = m.indemnite_entretien_mois([{"duree_minutes": 480, "travail_effectif": True}], 30, date(2026, 9, 15))
        self.assertEqual(r["resultat"]["indemnite_centimes"], 348)
        self.assertEqual(r["resultat"]["jours_sous_minimum"], [1])


if __name__ == "__main__":
    unittest.main()
