"""Tests T-074 : preavis dispense en tout ou partie par le particulier employeur.

Attendus tires des textes seuls (regles/t074-preavis-dispense.md, rapport du juriste) :
- CCN IDCC 3239 art. 64 (fin = « date prevue de fin du preavis »), 64.2 (ICP « jusqu'a la
  date prevue de fin », periode comptee pour les CP et l'anciennete), 66, 122 (« deduction
  d'absence prevue a l'article 111 » si le preavis finit en cours de mois), 111 (formule
  « salaire mensualise x nombre d'heures non travaillees / nombre d'heures qui auraient ete
  reellement travaillees », en jours en annee incomplete), 121.1 (1/80, 9 mois), 124, 109.2.
- Points ouverts rendus en refus : P-1 (part ICP dans un mois mixte), D-2 (regularisation),
  envoi 1 question 4 (ICP dans le 1/80, code A-45), D-1 (date des 9 mois).
Calculs a la main en commentaire. Montants en centimes.
"""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

AUCUNE = {"feries_chomes_payes": {"minutes": 0, "incluses": False},
          "absences_remunerees": {"minutes": 0, "incluses": False},
          "heures_complementaires": {"minutes": 0, "incluses": False}}


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


def mois_non_mixte(mens, prevu, non_payes=0):
    return {"salaire_mensualise_centimes": mens, "prevu_mois": prevu, "non_payes": non_payes, "mixte": False}


def mois_mixte(mens, prevu, prevu_dispense, minutes_dispense, sna=False):
    return {"salaire_mensualise_centimes": mens, "prevu_mois": prevu, "mixte": True, "prevu_dispense": prevu_dispense,
            "minutes_dispense": minutes_dispense, "semaine_sans_accueil_dans_dispense": sna}


class IndemnitePreavis(unittest.TestCase):
    """CCN 64.2, 66, 122, 111 ; regles/t074, points 1 et 11."""

    def test_mois_entier_dispense(self):
        # 40 h x 52 / 12 = 173,33 h x 4,50 EUR = 780 EUR (CCN 109.1). Mois entier dans le preavis, fin le dernier jour :
        # pas de deduction (CCN 122 non declenche) : ICP = 780 EUR.
        r = m.indemnite_preavis_dispense("complete", [mois_non_mixte(78000, 22 * 480)], 450)
        self.assertEqual(R(r, "indemnite_centimes"), 78000)

    def test_fin_en_cours_de_mois_deduction_111(self):
        # Octobre 2026, lundi-vendredi 8 h : 22 jours = 10 560 min prevues. Fin le mercredi 14/10 : 12 jours apres
        # (15, 16, 19-23, 26-30) = 5 760 min non payes. 780 - 780 x 5 760 / 10 560 = 780 x 4 800 / 10 560
        # = 354,5454... EUR, soit 354,55 EUR au centime le plus proche (ARR-01).
        r = m.indemnite_preavis_dispense("complete", [mois_non_mixte(78000, 10560, 5760)], 450)
        self.assertEqual(R(r, "indemnite_centimes"), 35455)

    def test_annee_incomplete_en_jours(self):
        # 46 semaines, deduction en jours (CCN 111) : 540 EUR x (22 - 12) / 22 = 245,4545... -> 245,45 EUR.
        r = m.indemnite_preavis_dispense("incomplete", [mois_non_mixte(54000, 22, 12)], 450)
        self.assertEqual(R(r, "indemnite_centimes"), 24545)

    def test_mois_mixte_lectures_egales(self):
        # Mois paye en partie en salaire : 780 EUR x 960 / 10 400 = 72 EUR ; 16 h x 4,50 EUR = 72 EUR. Meme part ICP.
        r = m.indemnite_preavis_dispense("complete", [mois_mixte(78000, 10400, 960, 960)], 450)
        self.assertEqual(R(r, "indemnite_centimes"), 7200)

    def test_cas_reel_novembre_p1(self):
        # Cas reel : 45 h x 52 / 12 = 195 h x 7,45 EUR = 1 452,75 EUR. Novembre 2026 : 21 jours du lundi au vendredi
        # x 9 h = 11 340 min (le 11/11, ferie chome d'un jour habituellement travaille, compte : CCN 111).
        # Jours dispenses : 27 et 30/11 = 1 080 min. Proportion : 1 452,75 x 1 080 / 11 340 = 138,357... -> 138,36 EUR.
        # Heures x taux : 18 h x 7,45 = 134,10 EUR. Lectures differentes : refus P-1 (regles/t074, point 1).
        r = m.indemnite_preavis_dispense("complete", [mois_mixte(145275, 11340, 1080, 1080)], 745)
        self.assertEqual(r["statut"], "non_gere")
        self.assertEqual(r["code"], "P-1")
        self.assertEqual(r["details"]["lectures_centimes"], [13836, 13410])

    def test_deux_mois_a_cheval(self):
        # Mois 1 mixte aux lectures egales (72 EUR), mois 2 entier dispense et fini le dernier jour (780 EUR) : 852 EUR.
        r = m.indemnite_preavis_dispense("complete", [mois_mixte(78000, 10400, 960, 960),
                                                      mois_non_mixte(78000, 10560)], 450)
        self.assertEqual(R(r, "indemnite_centimes"), 85200)
        self.assertEqual(R(r, "detail_centimes"), [7200, 78000])

    def test_semaine_sans_accueil_mois_mixte(self):
        r = m.indemnite_preavis_dispense("incomplete", [mois_mixte(54000, 22, 3, 1440, sna=True)], 450)
        self.assertEqual(r["code"], "P-1")

    def test_saisie_incoherente(self):
        r = m.indemnite_preavis_dispense("complete", [mois_non_mixte(78000, 100, 200)], 450)
        self.assertEqual(r["statut"], "erreur_saisie")


class RegularisationD2(unittest.TestCase):
    """CCN 124, 109.2 ; regles/t074, point 6 : lectures (a) et (b) (question D-2)."""

    def test_solde_employeur_dans_les_deux_lectures(self):
        # (a) (6 000 + 600) min = 110 h x 5 EUR = 550 EUR dus contre 1 000 EUR verses : rien n'est du par l'AM.
        # (b) 100 h x 5 = 500 EUR dus contre 1 000 - 100 = 900 EUR : rien non plus. Meme resultat : 0.
        r = m.regularisation_finale_preavis_dispense([], 100000, 500, 6000, 600, 10000, AUCUNE)
        self.assertEqual(R(r, "versement_centimes"), 0)

    def test_lectures_differentes_d2(self):
        # (a) (9 000 + 960) min = 166 h x 5 = 830 EUR - 600 EUR verses = 230 EUR.
        # (b) 150 h x 5 = 750 EUR - (600 - 100) EUR = 250 EUR. Differents : refus D-2.
        r = m.regularisation_finale_preavis_dispense([], 60000, 500, 9000, 960, 10000, AUCUNE)
        self.assertEqual(r["code"], "D-2")
        self.assertEqual(r["details"]["lecture_a_centimes"], 23000)
        self.assertEqual(r["details"]["lecture_b_centimes"], [25000])

    def test_lectures_egales(self):
        # ICP = 16 h x 5 EUR = 80 EUR : (a) 830 - 600 = 230 EUR ; (b) 750 - 520 = 230 EUR. Resultat 230 EUR.
        r = m.regularisation_finale_preavis_dispense([], 60000, 500, 9000, 960, 8000, AUCUNE)
        self.assertEqual(R(r, "versement_centimes"), 23000)

    def test_icp_a_deux_lectures(self):
        # ICP de 80 EUR ou 100 EUR (P-1) : (b) donne 230 ou 250 EUR : refus D-2.
        r = m.regularisation_finale_preavis_dispense([], 60000, 500, 9000, 960, [8000, 10000], AUCUNE)
        self.assertEqual(r["code"], "D-2")

    def test_refus_a06_propage(self):
        comp = dict(AUCUNE, feries_chomes_payes={"minutes": None, "incluses": False})
        r = m.regularisation_finale_preavis_dispense([], 60000, 500, 9000, 960, 8000, comp)
        self.assertEqual(r["code"], "A-06")


class RuptureD1EtA45(unittest.TestCase):
    """CCN 121.1, 60, 64.2 ; F16842 ; regles/t074, point 5."""

    def test_neuf_mois_seulement_a_la_fin_d1(self):
        # Debut 05/01/2026 : 9 mois le 05/10/2026. Lettre le 28/09 (8 mois et 23 jours), fin prevue le 12/10 : D-1.
        r = m.indemnite_rupture("normal", "employeur", date(2026, 1, 5), date(2026, 9, 28), 800000,
                                date_fin_contrat=date(2026, 10, 12))
        self.assertEqual(r["code"], "D-1")

    def test_cas_reel_moins_de_neuf_mois(self):
        # Debut 14/09/2026, lettre 23/11, fin 30/11/2026 : moins de 9 mois aux deux dates (9 mois le 14/06/2027) : 0.
        r = m.indemnite_rupture("normal", "employeur", date(2026, 9, 14), date(2026, 11, 23), 0,
                                date_fin_contrat=date(2026, 11, 30))
        self.assertEqual(R(r, "indemnite_centimes"), 0)

    def test_neuf_mois_aux_deux_dates_sans_preavis(self):
        # 8 000 EUR / 80 = 100 EUR.
        r = m.indemnite_rupture("normal", "employeur", date(2025, 12, 1), date(2026, 9, 14), 800000,
                                date_fin_contrat=date(2026, 9, 28))
        self.assertEqual(R(r, "indemnite_centimes"), 10000)

    def test_preavis_change_le_montant_a45(self):
        # Sans ICP : 8 000 / 80 = 100 EUR ; avec 200 EUR d'ICP : 8 200 / 80 = 102,50 EUR. Refus A-45 (envoi 1, Q4).
        r = m.indemnite_rupture("normal", "employeur", date(2025, 12, 1), date(2026, 9, 14), 800000,
                                indemnite_preavis_centimes=20000, date_fin_contrat=date(2026, 9, 28))
        self.assertEqual(r["code"], "A-45")
        self.assertEqual(r["details"]["sans_preavis_centimes"], 10000)
        self.assertEqual(r["details"]["avec_preavis_centimes"], 10250)

    def test_preavis_sans_effet_sur_le_montant(self):
        # 8 000,30 / 80 = 100,00375 EUR -> 100,00 EUR, comme sans l'ICP de 0,30 EUR : resultat 100 EUR.
        r = m.indemnite_rupture("normal", "employeur", date(2025, 12, 1), date(2026, 9, 14), 800000,
                                indemnite_preavis_centimes=30, date_fin_contrat=date(2026, 9, 28))
        self.assertEqual(R(r, "indemnite_centimes"), 10000)

    def test_demission_non_due(self):
        r = m.indemnite_rupture("normal", "am", date(2025, 9, 1), date(2026, 10, 1), 0,
                                date_fin_contrat=date(2026, 10, 31))
        self.assertEqual(R(r, "indemnite_centimes"), 0)

    def test_fin_au_seuil_limite(self):
        # Fin le jour des 9 mois : comptage non ecrit (LIMITE-ANCIENNETE).
        r = m.indemnite_rupture("normal", "employeur", date(2026, 1, 5), date(2026, 9, 28), 800000,
                                date_fin_contrat=date(2026, 10, 5))
        self.assertEqual(r["code"], "LIMITE-ANCIENNETE")

    def test_fin_avant_lettre_erreur(self):
        r = m.indemnite_rupture("normal", "employeur", date(2026, 1, 5), date(2026, 9, 28), 800000,
                                date_fin_contrat=date(2026, 9, 1))
        self.assertEqual(r["statut"], "erreur_saisie")


class SortieSemaineSansAccueil(unittest.TestCase):
    """CCN 111, dernier alinea : semaines de non-accueil au denominateur ; numerateur non ecrit."""

    def test_refus_a_confirmer(self):
        # Fin le 10/08/2026, semaines des 10, 17 et 24/08 sans accueil : 644 x 20/21 = 613,33 EUR si ces jours ne
        # sont pas deduits ; 644 x 6/21 = 184 EUR s'ils le sont. Aucun texte ne tranche : refus, jamais un montant.
        for t in ("incomplete",):
            r = m.qualifier_absence("hors_contrat_semaine_non_accueil", t)
            self.assertEqual(r["code"], "SORTIE-SEMAINE-SANS-ACCUEIL")


if __name__ == "__main__":
    unittest.main()
