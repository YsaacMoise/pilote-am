"""Tests T-039 : absence de l'enfant dite « sans solde ».

Attendus tires des sources seules (citees dans moteur/B/T-039-MB4.md) :
- CCN IDCC 3239, socle AM, art. 105 al. 1 : « les temps d'absence non prevus sont
  remuneres » ; al. 2 et 3 : seule exception, l'absence justifiee par certificat
  medical ou bulletin d'hospitalisation, dans la limite de 5 jours (courtes
  absences) ou de 14 jours calendaires consecutifs.
- CASF L423-20 al. 1 : maintien de la remuneration, sauf absence du seul fait de
  l'AM ou maladie de l'enfant attestee par certificat medical.
- Service-public F12812 (verifie le 17/06/2026), « Autre cas » : « Les jours
  d'accueil prevus au contrat, mais non effectues du fait de l'absence de
  l'enfant, sont remuneres ».
- CASF L423-18 al. 2 et CCN art. 114.1 (R-ABS-10) : pas d'indemnite d'entretien
  sans travail effectif.
"""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402


class AbsenceEnfantSansSolde(unittest.TestCase):
    def test_remuneree_dans_les_deux_types_d_annee(self):
        for t in ("complete", "incomplete"):
            r = m.qualifier_absence("enfant_sans_solde", t)
            self.assertEqual(r["statut"], "ok", r)
            self.assertFalse(r["resultat"]["deductible"])
            self.assertIn("R-ABS-01", r["regles"])
            self.assertIn("105", r["resultat"]["note"])

    def test_meme_traitement_qu_une_absence_non_prevue(self):
        for t in ("complete", "incomplete"):
            a = m.qualifier_absence("enfant_sans_solde", t)["resultat"]["deductible"]
            b = m.qualifier_absence("enfant_non_prevue", t)["resultat"]["deductible"]
            self.assertEqual(a, b)

    def test_salaire_du_mois_egal_au_mensualise(self):
        # Aucune deduction : le salaire du mois est le salaire mensualise entier.
        mens = m.mensualisation(52, 2400, 450)["resultat"]["salaire_mensualise_centimes"]
        r = m.salaire_du_mois(mens, (), 0)
        self.assertEqual(r["resultat"]["salaire_brut_mois_centimes"], mens)

    def test_pas_d_entretien_les_jours_d_absence(self):
        # 2 jours d'absence de l'enfant (sans travail effectif) sur 3 : seul le jour
        # travaille ouvre droit a l'entretien (R-ABS-10).
        jours = [{"duree_minutes": 540, "travail_effectif": True},
                 {"duree_minutes": 540, "travail_effectif": False},
                 {"duree_minutes": 540, "travail_effectif": False}]
        seul = [{"duree_minutes": 540, "travail_effectif": True}]
        a = m.indemnite_entretien_mois(jours, 50, date(2026, 9, 8))
        b = m.indemnite_entretien_mois(seul, 50, date(2026, 9, 8))
        self.assertEqual(a["resultat"]["indemnite_centimes"], b["resultat"]["indemnite_centimes"])

    def test_maladie_justifiee_reste_non_remuneree_dans_la_limite(self):
        # Art. 105 al. 3 : l'exception de la maladie justifiee demeure.
        r = m.absence_enfant_malade(2, 2, 2, justificatif=True)
        self.assertEqual(r["resultat"]["jours_deductibles"], 2)


if __name__ == "__main__":
    unittest.main()
