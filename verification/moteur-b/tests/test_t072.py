"""T-072 : bulletins saisis dans l'assiette du 1/80 (T-054) et conges apres un avenant qui
change le type d'annee (T-052). Textes : CCN IDCC 3239 art. 121.1, 124, 123, 67, 64.1, 120,
102.1.2.1, 102.1.2.2, 48.1.1.5, 109.1 (copies citees dans regles/t021-convention.md et
regles/t050-trois-regles.md). Les attendus viennent des entrees (total saisi / 80) et des
textes, jamais du moteur A."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

DEBUT = date(2025, 4, 1)
ENVOI = date(2026, 2, 12)  # plus de 9 mois d'accueil


def V(fin, sal=None, iccp=None, reg=0, pre=0):
    return {"date_fin": fin, "salaires_mois_centimes": sal or {}, "iccp_centimes": iccp,
            "regularisation_centimes": reg, "indemnite_preavis_centimes": pre}


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


class DatesFinPreavis(unittest.TestCase):
    """T-103 (F1, corrige apres la porte-verite) : une seule date. Le jour de la premiere presentation est le 1er
    jour du preavis (CCN 64.1 et 120, CASF L423-24 ; fiche officielle F2883 : presentee le 8 juillet, preavis « du 8
    juillet au 7 aout 2026 inclus »)."""

    def test_quinze_jours(self):
        r = m.dates_fin_preavis_possibles(date(2026, 1, 17), {"jours": 15})
        self.assertEqual(R(r, "dates"), [date(2026, 1, 31)])

    def test_fiche_branche_dans_les_lectures(self):
        # Fiche anciennete (valeur indicative) : remise le 16/04/2021, fin le 30/04/2021 : meme lecture que F1.
        r = m.dates_fin_preavis_possibles(date(2021, 4, 16), {"jours": 15})
        self.assertEqual(R(r, "dates"), [date(2021, 4, 30)])

    def test_un_mois(self):
        r = m.dates_fin_preavis_possibles(date(2026, 3, 15), {"mois": 1})
        self.assertEqual(R(r, "dates"), [date(2026, 4, 14)])

    def test_un_mois_fin_de_mois_refuse(self):
        # Depart apres le 28 : la veille d'un quantieme absent n'est ecrite nulle part : refus DATE-MOIS garde.
        r = m.dates_fin_preavis_possibles(date(2026, 1, 31), {"mois": 1})
        self.assertEqual(r["code"], "DATE-MOIS")


class BulletinsDansAssiette(unittest.TestCase):
    """CCN 121.1 : salaires bruts « percus » ; le montant des bulletins fait foi."""

    def test_dernier_mois_couvert_deux_dates_dans_le_mois(self):
        # Total de 10 000 EUR jusqu'en fevrier, fin le 26 ou le 27/02 : assiette = total, 1/80 = 125 EUR.
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI,
                                          [V(date(2026, 2, 26)), V(date(2026, 2, 27))],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02")
        self.assertEqual(R(r, "assiette_centimes"), 1000000)
        self.assertEqual(R(r, "indemnite_centimes"), 12500)

    def test_iccp_inconnue_sans_effet_si_dernier_bulletin_couvert(self):
        # L'ICCP est payee sur le dernier bulletin (art. 67, 123) : deja dans le total.
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI, [V(date(2026, 2, 26), iccp=None)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02")
        self.assertEqual(R(r, "indemnite_centimes"), 12500)

    def test_lendemain_dans_le_mois_suivant_a_confirmer(self):
        # Fin le 31/01 ou le 01/02 : dans la 2e lecture, le dernier bulletin (fevrier, ICCP) n'est pas saisi.
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, date(2026, 1, 17),
                                          [V(date(2026, 1, 31)), V(date(2026, 2, 1), sal={"2026-02": 0})],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-01")
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")
        self.assertIn("iccp", r["details"]["sommes_a_confirmer"]["2026-02-01"])

    def test_lendemain_dans_le_mois_suivant_sommes_connues_differentes(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, date(2026, 1, 17),
                                          [V(date(2026, 1, 31)), V(date(2026, 2, 1), sal={"2026-02": 0}, iccp=5000)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-01")
        self.assertEqual(r["code"], "FIN-DATE-A-CONFIRMER")

    def test_mois_non_couvert_ajoute(self):
        # Total jusqu'en janvier ; fevrier 546,00 EUR et ICCP 80,00 EUR ajoutes : 10 626 EUR, 1/80 = 132,825 -> 132,83.
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI,
                                          [V(date(2026, 2, 26), sal={"2026-02": 54600}, iccp=8000)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-01")
        self.assertEqual(R(r, "assiette_centimes"), 1062600)
        self.assertEqual(R(r, "indemnite_centimes"), 13283)

    def test_mois_non_couvert_iccp_inconnue(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI,
                                          [V(date(2026, 2, 26), sal={"2026-02": 54600})],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-01")
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")

    def test_salaire_mois_non_couvert_inconnu(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI,
                                          [V(date(2026, 2, 26), sal={"2026-02": None}, iccp=8000)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-01")
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")

    def test_bruts_lus_par_mois(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI,
                                          [V(date(2026, 2, 26), sal={"2026-02": 54600}, iccp=8000)],
                                          total_bulletins_centimes=900000, total_jusqua="2025-12",
                                          bruts_lus_centimes={"2026-01": 100000})
        self.assertEqual(R(r, "assiette_centimes"), 1062600)

    def test_brut_lu_dans_le_total_refuse(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI, [V(date(2026, 2, 26))],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02",
                                          bruts_lus_centimes={"2026-01": 100000})
        self.assertEqual(r["statut"], "erreur_saisie")

    def test_regularisation_inconnue_meme_couverte(self):
        # Le signe de la regularisation (art. 124, credit et debit) n'est pas connu.
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI, [V(date(2026, 2, 26), reg=None)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02")
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")

    def test_regularisation_negative_a45(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI, [V(date(2026, 2, 26), reg=-1000)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02")
        self.assertEqual(r["code"], "A-45")

    def test_preavis_non_nul_a45(self):
        # T-103 (F4) : l'ICP entre dans l'assiette (CCN 121.1, 64.2). Dernier mois couvert par le total saisi :
        # elle y est deja (payee sur le dernier bulletin) ; rien n'est ajoute : 10 000 EUR / 80 = 125 EUR.
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI, [V(date(2026, 2, 26), pre=30000)],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02")
        self.assertEqual(R(r, "indemnite_centimes"), 12500)

    def test_demission_non_due(self):
        r = m.indemnite_rupture_bulletins("normal", "am", DEBUT, ENVOI, [V(date(2026, 2, 26))],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-02")
        self.assertEqual(R(r, "indemnite_centimes"), 0)

    def test_bulletins_apres_la_fin(self):
        r = m.indemnite_rupture_bulletins("normal", "employeur", DEBUT, ENVOI, [V(date(2026, 2, 26))],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-03")
        self.assertEqual(r["code"], "ASSIETTE-A-CONFIRMER")


class AvenantTypeAnnee(unittest.TestCase):
    """CCN 102.1.2.1, 102.1.2.2 : aucun texte pour des jours acquis sous un type et pris sous l'autre."""

    def test_meme_type(self):
        r = m.conges_apres_changement_type(["complete"], "complete")
        self.assertTrue(R(r, "meme_regime"))

    def test_incomplete_vers_complete(self):
        r = m.conges_apres_changement_type(["incomplete"], "complete")
        self.assertEqual(r["code"], "AVENANT-CP-A-CONFIRMER")

    def test_complete_vers_incomplete(self):
        r = m.conges_apres_changement_type(["complete", "incomplete"], "incomplete")
        self.assertEqual(r["code"], "AVENANT-CP-A-CONFIRMER")

    def test_avenant_au_1er(self):
        self.assertTrue(R(m.verifier_date_effet_avenant(date(2022, 6, 1)), "mois_entier"))

    def test_avenant_en_cours_de_mois(self):
        self.assertEqual(m.verifier_date_effet_avenant(date(2022, 6, 15))["code"], "AVENANT-EN-COURS-DE-MOIS")


if __name__ == "__main__":
    unittest.main()
