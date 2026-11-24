"""T-050b (MB6) : assiette du 1/80 (A-45) et regularisation dans le dixieme de fin (A-50).
Analyse juridique : regles/t050-trois-regles.md, points 2 et 3 (CCN IDCC 3239 art. 121.1,
123.1, 123.2, 124, 48.1.1.5, 48.1.1.1 ; CASF L423-6). Montants attendus : fiches DDETS 31
du 19/01/2023 (Mme Durand 52 semaines, Mme Bertrand 46 semaines), cas C-FIN-02, C-FIN-04,
C-FIN-05 de tests/cas-officiels-v0.md."""

import os
import sys
import unittest
from datetime import date
from fractions import Fraction

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


class A45AssietteRupture(unittest.TestCase):
    """CCN art. 121.1 : 1/80 des salaires bruts, hors indemnites non soumises a cotisations."""

    def test_c_fin_02_durand(self):
        # 742,86 + 12 x 866,66 = 11 142,78 EUR de salaires ; + 120 EUR et 400 EUR d'ICCP = 11 662,78 EUR.
        r = m.indemnite_rupture("normal", "employeur", date(2021, 10, 1), date(2022, 9, 30), 1114278,
                                iccp_centimes=12000 + 40000)
        self.assertEqual(R(r, "assiette_centimes"), 1166278)
        self.assertEqual(R(r, "indemnite_centimes"), 14578)  # fiche : 145,78 EUR

    def test_c_fin_05_bertrand(self):
        # 600 + 514,29 + 6 600 = 7 714,29 EUR de salaires ; regularisation 285,71 ; CP payes en aout 400 ;
        # ICCP 400 (1re periode) + 348,57 (2e periode) = 9 148,57 EUR.
        r = m.indemnite_rupture("normal", "employeur", date(2021, 9, 1), date(2022, 9, 30), 771429,
                                iccp_centimes=40000 + 34857, icp_centimes=40000, regularisation_centimes=28571)
        self.assertEqual(R(r, "assiette_centimes"), 914857)
        # 9 148,57 / 80 = 114,357... : 114,36 EUR au centime le plus proche (ARR-01).
        # La fiche ecrit 114,35 EUR (troncature, SUS-01) : ecart d'arrondi seulement.
        self.assertEqual(R(r, "indemnite_centimes"), 11436)

    def test_sans_somme_annexe_inchange(self):
        r = m.indemnite_rupture("normal", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000)
        self.assertEqual(R(r, "indemnite_centimes"), 10000)

    def test_preavis_reste_refuse(self):
        r = m.indemnite_rupture("normal", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000,
                                iccp_centimes=40000, indemnite_preavis_centimes=50000)
        self.assertEqual(r["statut"], "non_gere")
        self.assertEqual(r["code"], "A-45")

    def test_regularisation_negative_refusee(self):
        r = m.indemnite_rupture("normal", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000,
                                regularisation_centimes=-1000)
        self.assertEqual(r["code"], "A-45")

    def test_somme_a_confirmer_refusee(self):
        r = m.indemnite_rupture("normal", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000,
                                iccp_centimes=40000, sommes_a_confirmer=["regularisation"])
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")

    def test_non_due_avant_assiette(self):
        r = m.indemnite_rupture("normal", "am", date(2025, 1, 5), date(2026, 6, 20), 800000, iccp_centimes=1)
        self.assertEqual(R(r, "indemnite_centimes"), 0)


class A50RegularisationDixieme(unittest.TestCase):
    """C-FIN-04, Mme Bertrand, 2e periode : 8 jours, 40 h + 2 x 8 h = 56 h de maintien a 5 EUR = 280 EUR ;
    salaires 600 x 4 = 2 400 EUR ; CP payes en aout 400 EUR ; regularisation 285,71 EUR."""

    def periode(self, **k):
        p = {"jours_acquis": 8, "jours_payes": 0, "salaires_bruts_periode_centimes": 240000,
             "icp_versee_pendant_periode_centimes": 40000, "icp_annee_precedente_centimes": 40000,
             "heures_conge_minutes": 56 * 60}
        p.update(k)
        return p

    def test_regularisation_dans_la_base(self):
        # Base du moteur (sans ICCP precedente, M-5) : 3 085,71 EUR -> 308,57 EUR (analyse T-050, point 3).
        r = m.iccp("incomplete", "normal", [self.periode(regularisation_due_centimes=28571)], 1000, 500)
        self.assertEqual(R(r, "iccp_centimes"), 30857)

    def test_sans_regularisation(self):
        r = m.iccp("incomplete", "normal", [self.periode()], 1000, 500)
        self.assertEqual(R(r, "iccp_centimes"), 28000)  # 2 800 EUR / 10 = maintien 280 EUR

    def test_fiche_bertrand_348_57(self):
        # Avec l'ICCP precedente (400 EUR), la fiche retient 3 485,71 EUR -> 348,57 EUR. Cette inclusion
        # reste ouverte (SUS-04) : B refuse A-50, et ses deux variantes contiennent toutes deux la
        # regularisation (308,57 et 348,57 ; plus jamais 280,00 ni 320,00).
        r = m.iccp("incomplete", "normal",
                   [self.periode(regularisation_due_centimes=28571,
                                 sommes_assiette_ambigues={"iccp_periode_precedente": 40000})], 1000, 500)
        self.assertEqual(r["code"], "A-50")
        dix = {Fraction(x) for x in r["details"]["dixieme_exact_centimes"]}
        self.assertEqual(dix, {Fraction(308571, 10), Fraction(348571, 10)})
        self.assertEqual(round(Fraction(348571, 10)), 34857)

    def test_solde_employeur_ne_se_retire_pas(self):
        r = m.iccp("incomplete", "normal", [self.periode(regularisation_due_centimes=-5000)], 1000, 500)
        self.assertEqual(R(r, "iccp_centimes"), 28000)

    def test_regularisation_a_confirmer(self):
        r = m.iccp("incomplete", "normal", [self.periode(regularisation_a_confirmer=True)], 1000, 500)
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")

    def test_regularisation_seulement_derniere_periode(self):
        p1 = self.periode(regularisation_due_centimes=100)
        r = m.iccp("incomplete", "normal", [p1, self.periode()], 1000, 500)
        self.assertEqual(r["statut"], "erreur_saisie")

    def test_plus_d_ambiguite_regularisation(self):
        r = m.iccp("incomplete", "normal", [self.periode(sommes_assiette_ambigues={"regularisation": 28571})],
                   1000, 500)
        self.assertEqual(r["statut"], "erreur_saisie")


if __name__ == "__main__":
    unittest.main()
