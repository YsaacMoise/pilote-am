"""T-103 : regles du tableau valide par le DG le 24/11/2026 (calculateur-arvela,
rapports/T-103-inventaire.md). Attendus chiffres a la main depuis les textes cites
(rapport calculateur-arvela/rapports/T-103-moteur-b.md), jamais depuis l'app."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


SEPT = date(2026, 9, 15)  # MG 4,35 EUR (depuis le 01/06/2026) : 90 % = 391,5 c pour 9 h


class M1DureeArt99(unittest.TestCase):
    """CCN 114.1 « par heure de travail » ; CCN 99 : debut au plus tot de l'heure prevue et de l'arrivee,
    fin au plus tard de l'heure prevue et du depart."""

    def test_arrivee_avant(self):
        # Prevu 8 h - 16 h, arrivee 7 h, depart 16 h : 9 h de travail ; 0,50 EUR/h -> 4,50 EUR.
        j = [{"debut_prevu": 480, "fin_prevue": 960, "arrivee": 420, "depart": 960, "travail_effectif": True}]
        self.assertEqual(R(m.indemnite_entretien_mois(j, 50, SEPT), "indemnite_centimes"), 450)

    def test_arrivee_apres_depart_avant(self):
        # Prevu 8 h - 16 h, presence 10 h - 15 h : le travail reste 8 h - 16 h (art. 99) -> 4,00 EUR.
        j = [{"debut_prevu": 480, "fin_prevue": 960, "arrivee": 600, "depart": 900, "travail_effectif": True}]
        self.assertEqual(R(m.indemnite_entretien_mois(j, 50, SEPT), "indemnite_centimes"), 400)

    def test_duree_accueil_ignoree(self):
        j = [{"duree_minutes": 480, "duree_accueil_minutes": 300, "travail_effectif": True}]
        self.assertEqual(R(m.indemnite_entretien_mois(j, 50, SEPT), "indemnite_centimes"), 400)

    def test_fonction_duree(self):
        self.assertEqual(m.duree_travail_art99({"debut_prevu": 480, "fin_prevue": 960, "depart": 1110}), 630)
        self.assertEqual(m.duree_travail_art99({"debut_prevu": None, "fin_prevue": None, "arrivee": 540,
                                                "depart": 660}), 120)


class M2M3MontantParJournee(unittest.TestCase):
    """Contrat « montant fixe par journee » : du par journee de travail effectif ; minimum de 114.1 sur la duree."""

    def test_jour_long_minimum(self):
        # 3,00 EUR par jour. 8 h : minimum 391,5 x 8 / 9 = 348 c -> 3,48 EUR. 11 h : 478,5 c -> 4,79 EUR (ARR-01).
        j = [{"duree_minutes": 480, "travail_effectif": True}, {"duree_minutes": 660, "travail_effectif": True}]
        r = m.indemnite_entretien_mois(j, None, SEPT, montant_journalier_contrat_centimes=300)
        self.assertEqual(R(r, "indemnite_centimes"), 348 + 479)
        self.assertEqual(R(r, "jours_sous_minimum"), [1, 2])
        self.assertEqual(R(r, "mode_contrat"), "par_journee")

    def test_jour_court_montant_fixe(self):
        # 4,00 EUR par jour ; journee de 2 h : minimum 2,65 EUR ; le montant du contrat (4,00 EUR) est du.
        j = [{"duree_minutes": 120, "travail_effectif": True}]
        r = m.indemnite_entretien_mois(j, None, SEPT, montant_journalier_contrat_centimes=400)
        self.assertEqual(R(r, "indemnite_centimes"), 400)

    def test_hors_planning(self):
        # M3 : samedi hors planning, presence 7 h - 18 h (11 h) ; 4,00 EUR par jour < 4,785 -> 4,79 EUR.
        j = [{"debut_prevu": None, "fin_prevue": None, "arrivee": 420, "depart": 1080, "travail_effectif": True}]
        r = m.indemnite_entretien_mois(j, None, SEPT, montant_journalier_contrat_centimes=400)
        self.assertEqual(R(r, "indemnite_centimes"), 479)

    def test_jour_sans_travail(self):
        j = [{"duree_minutes": 480, "travail_effectif": False}]
        r = m.indemnite_entretien_mois(j, None, SEPT, montant_journalier_contrat_centimes=400)
        self.assertEqual(R(r, "indemnite_centimes"), 0)

    def test_deux_montants_refuses(self):
        j = [{"duree_minutes": 480, "travail_effectif": True}]
        self.assertEqual(m.indemnite_entretien_mois(j, 50, SEPT, montant_journalier_contrat_centimes=400)["statut"],
                         "erreur_saisie")
        self.assertEqual(m.indemnite_entretien_mois(j, None, SEPT)["statut"], "erreur_saisie")


if __name__ == "__main__":
    unittest.main()
