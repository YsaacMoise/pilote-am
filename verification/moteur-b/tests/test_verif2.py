"""Verification 2 (25/11/2026) : corrections B-1 a B-6 a partir des textes (rapport rapports/verif-2.md du depot
calculateur-arvela). Attendus faits a la main."""
import os, sys, unittest
from datetime import date
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import moteur_b as m


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


class H9(unittest.TestCase):
    """CCN 96.4, 98.1.1, 105, 111 ; heures en plus d'une semaine avec un jour non travaille."""

    def test_absence_payee(self):
        # Contrat 40 h (8 h par jour), 4,20 EUR. Lundi absence payee de l'enfant ; mardi a vendredi 11 h : 44 h.
        # 12 h faites au-dela du prevu. HC = 44 - 40 = 4 h (travail effectif, CCN 96.4) ; 8 h normales (dans la
        # limite des 8 h prevues non travaillees) : 8 x 4,20 = 33,60 EUR ; HC 16,80 EUR.
        r = m.heures_en_plus_semaine_t103(2400, 2640, 420, 10, minutes_prevues_non_travaillees=480,
                                          minutes_en_plus_du_prevu=720)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 1680)
        self.assertEqual(R(r, "montant_normales_en_plus_centimes"), 3360)

    def test_absence_retenue_courte(self):
        # Lundi AM malade (8 h retenues, art. 111) ; mardi 11 h, mercredi a vendredi 8 h : 35 h faites. 3 h en plus
        # du prevu, sous la duree du contrat : 3 h normales, aucune HC.
        r = m.heures_en_plus_semaine_t103(2400, 2100, 420, 10, minutes_prevues_non_travaillees=480,
                                          minutes_en_plus_du_prevu=180)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 0)
        self.assertEqual(R(r, "montant_normales_en_plus_centimes"), 1260)

    def test_sans_absence(self):
        r = m.heures_en_plus_semaine_t103(2400, 2640, 420, 10, minutes_en_plus_du_prevu=240)
        self.assertEqual(R(r, "montant_normales_en_plus_centimes"), 0)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 1680)


class F13Deces(unittest.TestCase):
    def test_indemnite_deces_dans_assiette(self):
        # CCN 121.1 et 64.2 : 1/80 de (10 000 EUR de salaires + 500 EUR d'indemnite egale au preavis) = 131,25 EUR.
        r = m.indemnite_rupture("deces_enfant", "employeur", date(2024, 1, 8), date(2026, 3, 2), 1000000,
                                indemnite_preavis_centimes=50000, date_fin_contrat=date(2026, 3, 2))
        self.assertEqual(R(r, "indemnite_centimes"), 13125)


if __name__ == "__main__":
    unittest.main()
