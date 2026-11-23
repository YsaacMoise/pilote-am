"""T-082 : jours de conges payes pris dont le droit est a confirmer sans lecture chiffree (decision du DG du
22/11/2026). Textes : CCN IDCC 3239 art. 48.1.1.1, 48.1.1.2, 48.1.1.3, 48.1.3.3, 102.2 ; Code du travail L3141-3,
L3141-4, L3141-5-1, L3141-7, L3141-8 (copies citees dans regles/regles-v0.md, regles/t020-comparatifs.md,
regles/t021-convention.md). Contrat de la fiche DDETS 31 « 46 semaines » (Mme Bertrand) : debut le 01/09/2021,
lundi-vendredi, 9 mois civils avec accueil, 30 semaines entieres d'accueil, 155 jours prevus du 01/09/2021 au
31/05/2022 (comptes sur le calendrier de la fiche), deux enfants a charge, AM de plus de 21 ans.
Attendus chiffres a la main depuis les textes, jamais depuis le moteur A."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


BERTRAND = dict(mois=9, semaines="30", jours=155, jours_par_semaine=5)


class BorneHaute(unittest.TestCase):
    """2,5 jours par mois ou periode equivalente (48.1.1.2, L3141-3, L3141-4), arrondi sur le total (L3141-7)."""

    def test_bertrand_methodes(self):
        r = m.borne_haute_droits_cp("incomplete", nombre_enfants_a_charge=2, **BERTRAND)
        # 9 x 2,5 = 22,5 -> 23 ; 30 / 4 x 2,5 = 18,75 -> 19 ; 155 x 2,5 / 20 = 19,375 -> 20.
        self.assertEqual(R(r, "resultats_par_methode"), {"mois": 23, "semaines": 19, "jours": 20})
        self.assertEqual(R(r, "borne_haute_hors_enfants"), 23)
        # 48.1.3.3, L3141-8 : 2 jours par enfant, total limite a 30 : 23 + 4 = 27.
        self.assertEqual(R(r, "jours_enfants"), 4)
        self.assertEqual(R(r, "borne_haute"), 27)

    def test_borne_au_moins_chaque_lecture_du_temoin(self):
        # Sans maladie, acquisition_cp donne des lectures (SUS-11) ; la borne est la plus haute.
        a = m.acquisition_cp("incomplete", **BERTRAND)
        self.assertEqual(a["statut"], "non_gere")
        self.assertEqual(a["code"], "SUS-11")
        lect = a["details"]["resultats_par_methode"]
        b = m.borne_haute_droits_cp("incomplete", **BERTRAND)
        self.assertEqual(R(b, "borne_haute"), max(lect.values()))

    def test_maladie_sans_lecture_chiffree(self):
        # Arret du 13 au 15/10/2021 (3 jours, moins d'un mois civil) : acquisition_cp ne chiffre aucune lecture.
        a = m.acquisition_cp("incomplete", mois=9, semaines="30", jours=152, jours_par_semaine=5,
                             mois_arret_maladie=0, semaines_arret_maladie="3/7", date_fin_periode=date(2022, 5, 31))
        self.assertEqual(a["statut"], "non_gere")
        self.assertIn(a["code"], m.CODES_DROIT_A_CONFIRMER)
        self.assertNotIn("resultats_par_methode", a.get("details") or {})

    def test_maladie_ne_depasse_pas_le_travail(self):
        # Un jour d'arret ouvre 0 (CCN 49) ou 2 jours par mois (L3141-5-1), jamais plus de 2,5 : compter l'arret
        # comme du travail donne la borne. Avec l'arret retire (152 jours), chaque methode est plus basse ou egale.
        haut = R(m.borne_haute_droits_cp("incomplete", **BERTRAND), "resultats_par_methode")
        bas = R(m.borne_haute_droits_cp("incomplete", mois=9, semaines="30", jours=152, jours_par_semaine=5),
                "resultats_par_methode")
        for k in haut:
            self.assertLessEqual(bas[k], haut[k])

    def test_plafond_30(self):
        r = m.borne_haute_droits_cp("complete", mois=12, semaines="52", nombre_enfants_a_charge=2)
        self.assertEqual(R(r, "borne_haute_hors_enfants"), 30)  # L3141-3 : 30 jours ouvrables au plus
        self.assertEqual(R(r, "jours_enfants"), 0)  # AM de 21 ans ou plus : total limite a 30
        self.assertEqual(R(r, "borne_haute"), 30)

    def test_am_de_moins_de_21_ans(self):
        # L3141-8 : moins de 21 ans, 2 jours par enfant, 1 seul si le conge ne depasse pas 6 jours.
        r = m.borne_haute_droits_cp("incomplete", mois=2, semaines="8", age_am_au_30_avril=20,
                                    nombre_enfants_a_charge=2)
        self.assertEqual(R(r, "borne_haute_hors_enfants"), 5)
        self.assertEqual(R(r, "borne_haute"), 7)

    def test_periode_avant_31_mai(self):
        r = m.borne_haute_droits_cp("incomplete", nombre_enfants_a_charge=2, periode_atteint_31_mai=False, **BERTRAND)
        self.assertEqual(R(r, "borne_haute"), 23)  # jours pour enfants acquis au 31 mai (R-CP-03)

    def test_refus(self):
        self.assertEqual(m.borne_haute_droits_cp("incomplete", accident_travail=True, **BERTRAND)["code"], "EXCLU-AT")
        self.assertEqual(m.borne_haute_droits_cp("incomplete", report=True, **BERTRAND)["code"], "CP-REPORT")
        r = m.borne_haute_droits_cp("incomplete", types_periode_acquisition=["incomplete", "complete"], **BERTRAND)
        self.assertEqual(r["code"], "T082-BORNE-AVENANT")
        self.assertEqual(m.borne_haute_droits_cp("incomplete", mois=None, semaines="3")["statut"], "erreur_saisie")


# Rangs des jours prevus (lundi-vendredi) en conge du 01/06/2022 : decompte R-CP-09, jours ouvrables (lundi au
# samedi), lundi de Pentecote 06/06/2022 ferie chome non decompte (CCN 47.2, 48.1.1.3).
RANGS_1_17_JUIN = [1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14]            # 01-03, 07-10, 13-17 juin
RANGS_20_30_JUIN = [16, 17, 18, 19, 20, 22, 23, 24, 25]                # 20-24, 27-30 juin


class Decompte(unittest.TestCase):
    """Les rangs ci-dessus, recomptes par decompte_jours_cp (R-CP-09)."""

    def test_rangs(self):
        lmv = [0, 1, 2, 3, 4]
        self.assertEqual(R(m.decompte_jours_cp(date(2022, 6, 1), date(2022, 6, 18), lmv), "jours_decomptes"), 14)
        self.assertEqual(R(m.decompte_jours_cp(date(2022, 6, 1), date(2022, 6, 7), lmv), "jours_decomptes"), 4)
        self.assertEqual(R(m.decompte_jours_cp(date(2022, 6, 1), date(2022, 7, 1), lmv), "jours_decomptes"), 25)


class StatutJours(unittest.TestCase):

    def test_maladie_court(self):
        r = m.statut_jours_cp_pris(RANGS_1_17_JUIN, borne_haute=27)
        self.assertEqual(R(r, "jours_droit_a_confirmer"), 12)
        self.assertEqual(set(R(r, "statuts")), {"paye_droit_a_confirmer"})

    def test_maladie_long(self):
        # 25 jours decomptes au plus, sous la borne de 27 : les 21 jours prevus portent la mention.
        r = m.statut_jours_cp_pris(RANGS_1_17_JUIN + RANGS_20_30_JUIN, borne_haute=27)
        self.assertEqual(R(r, "jours_droit_a_confirmer"), 21)

    def test_au_dela_de_la_borne(self):
        r = m.statut_jours_cp_pris([26, 27, 28, 29, 30], borne_haute=27)
        self.assertEqual(R(r, "statuts"), ["paye_droit_a_confirmer"] * 2 + ["a_confirmer"] * 3)
        self.assertEqual(R(r, "jours_droit_a_confirmer"), 2)

    def test_temoin_lectures_chiffrees(self):
        # T-030 inchangee : aucune mention. Lectures 19, 20, 23 (+ 4 jours pour enfants).
        r = m.statut_jours_cp_pris(RANGS_1_17_JUIN + RANGS_20_30_JUIN, lectures=[23, 24, 27])
        self.assertEqual(R(r, "jours_droit_a_confirmer"), 0)
        st = R(r, "statuts")
        self.assertEqual(st[:-2], ["paye"] * 19)
        self.assertEqual(st[-2:], ["a_confirmer", "a_confirmer"])  # rangs 24 et 25

    def test_droit_certain(self):
        r = m.statut_jours_cp_pris([20, 21], droit=20)
        self.assertEqual(R(r, "statuts"), ["paye", "au_dela_des_droits"])  # CCN 102.2
        self.assertEqual(R(r, "jours_droit_a_confirmer"), 0)

    def test_rang_non_etabli(self):
        self.assertEqual(m.statut_jours_cp_pris([1, None], borne_haute=27)["code"], "T082-JOUR-NON-ETABLI")
        r = m.statut_jours_cp_pris([1, None], droit=20)
        self.assertEqual(R(r, "statuts"), ["paye", None])
        self.assertEqual(R(r, "jours_droit_a_confirmer"), 0)

    def test_saisie(self):
        self.assertEqual(m.statut_jours_cp_pris([1], droit=2, borne_haute=3)["statut"], "erreur_saisie")
        self.assertEqual(m.statut_jours_cp_pris([1])["statut"], "erreur_saisie")
        self.assertEqual(m.statut_jours_cp_pris([1], lectures=[])["statut"], "erreur_saisie")


if __name__ == "__main__":
    unittest.main()
