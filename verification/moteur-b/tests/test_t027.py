"""Tests T-027 : kilometres, evenements familiaux, preavis.

Attendus tires des textes seuls (cites dans moteur/B/T-027.md) :
- CCN art. 57 et 113 ; arrete du 03/07/2006 art. 1er (bareme de l'administration) ;
  arrete du 29/05/2026 (majoration du 01/06 au 31/12/2026) ; CGI ann. IV art. 6 B.
- CCN 48.1.3.1.1 a 48.1.3.1.3 ; C. trav. L3142-4 (versions 2021, 2023, 2026).
- CCN art. 120 ; CASF L423-26.
Les montants attendus sont des produits « km x taux » ecrits par le texte, pas un
resultat d'un moteur.
"""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402


class Base(unittest.TestCase):
    def ok(self, s):
        self.assertIn(s["statut"], ("ok", "provisoire"), s)
        return s["resultat"]

    def refus(self, s, code):
        self.assertEqual(s["statut"], "non_gere", s)
        self.assertEqual(s["code"], code, s)


class Kilometres(Base):
    D = date(2026, 9, 7)  # bareme majore (arrete du 29/05/2026), 5 CV et moins : 0,33 / 0,41 / 0,24

    def test_taux_dans_les_bornes(self):
        # 41 c >= 0,41 (toutes tranches) et <= 0,357 + 1395/20000 = 0,42675 (plafond le plus bas, 5 CV)
        r = self.ok(m.indemnite_kilometrique(100, 41, self.D, 5))
        self.assertEqual(r["indemnite_centimes"], 4100)

    def test_sous_plancher(self):
        self.refus(m.indemnite_kilometrique(100, 23, self.D, 5), "KM-SOUS-PLANCHER")

    def test_tranche_plancher(self):
        self.refus(m.indemnite_kilometrique(100, 35, self.D, 5), "A-38")

    def test_sur_plafond(self):
        # 5 CV : plafond le plus haut 0,636 (jusqu'a 5 000 km)
        self.refus(m.indemnite_kilometrique(100, 64, self.D, 5), "KM-SUR-PLAFOND")

    def test_electrique_majoration_20(self):
        # 0,636 x 1,2 = 0,7632 : 64 c n'est plus au-dessus de tous les plafonds
        self.refus(m.indemnite_kilometrique(100, 64, self.D, 5, electrique=True), "A-38")
        self.refus(m.indemnite_kilometrique(100, 77, self.D, 5, electrique=True), "KM-SUR-PLAFOND")

    def test_motorisation_inconnue(self):
        # 64 c : au-dessus de 0,636 (thermique), sous 0,7632 (electrique)
        self.refus(m.indemnite_kilometrique(100, 64, self.D, 5, electrique=None), "KM-ELECTRIQUE-INCONNU")
        self.refus(m.indemnite_kilometrique(100, 77, self.D, 5, electrique=None), "KM-SUR-PLAFOND")
        # 41 c : conforme dans les deux cas
        self.assertEqual(self.ok(m.indemnite_kilometrique(100, 41, self.D, 5, electrique=None))["indemnite_centimes"], 4100)

    def test_6_7cv_toujours_selon_tranche(self):
        # plancher 6-7 CV majore 0,53 > plafond le plus bas 6 CV 0,374 + 1457/20000 = 0,44685
        self.refus(m.indemnite_kilometrique(100, 53, self.D, 6), "A-38")

    def test_un_seul_employeur_pas_de_partage(self):
        r = self.ok(m.indemnite_kilometrique(100, 41, self.D, 5, employeurs_demandeurs=1,
                                             enfants_de_cet_employeur=1, enfants_transportes=3))
        self.assertEqual(r["indemnite_centimes"], 4100)

    def test_partage_deux_employeurs(self):
        r = self.ok(m.indemnite_kilometrique(100, 41, self.D, 5, employeurs_demandeurs=2,
                                             enfants_de_cet_employeur=1, enfants_transportes=2))
        self.assertEqual(r["indemnite_centimes"], 2050)

    def test_partage_non_entier(self):
        # T-040d : 100 x 41 x 1/3 = 1 366,67 centimes -> 1 367 (ARR-01, plus proche).
        self.assertEqual(self.ok(m.indemnite_kilometrique(100, 41, self.D, 5, employeurs_demandeurs=2,
                                                          enfants_de_cet_employeur=1, enfants_transportes=3))
                         ["indemnite_centimes"], 1367)

    def test_partage_avec_enfants_am(self):
        self.refus(m.indemnite_kilometrique(100, 41, self.D, 5, enfants_transportes=2, trajet_pour_enfants_am=True),
                   "KM-PARTAGE-AM")

    def test_vehicule_employeur(self):
        self.assertEqual(self.ok(m.indemnite_kilometrique(100, 41, self.D, 5, vehicule_de_l_employeur=True))
                         ["indemnite_centimes"], 0)

    def test_bareme_de_base_2025(self):
        # arrete du 03/07/2006 : 0,32 / 0,40 / 0,23 ; 40 c conforme
        s = m.indemnite_kilometrique(10, 40, date(2025, 3, 3), 5)
        self.assertEqual(s["statut"], "ok", s)
        self.assertEqual(s["resultat"]["indemnite_centimes"], 400)
        # 41 c le 01/06/2026 contre 40 c le 31/05/2026 : majoration au jour du trajet
        self.refus(m.indemnite_kilometrique(10, 40, date(2026, 6, 1), 5), "A-38")

    def test_annee_fiscale_ouverte_provisoire(self):
        self.assertEqual(m.indemnite_kilometrique(10, 41, self.D, 5)["statut"], "provisoire")

    def test_hors_ccn(self):
        self.refus(m.indemnite_kilometrique(10, 40, date(2021, 12, 1), 5), "HORS-CCN")

    def test_mois(self):
        tr = [{"date": date(2026, 9, 7), "km": 10}, {"date": date(2026, 9, 8), "km": 12},
              {"date": date(2026, 9, 9), "km": 10, "employeurs_demandeurs": 2, "enfants_transportes": 2}]
        r = self.ok(m.indemnite_kilometrique_mois(tr, 41, 5))
        self.assertEqual(r["indemnite_centimes"], 10 * 41 + 12 * 41 + 10 * 41 // 2)

    def test_mois_arrondi(self):
        # T-040d : arrondi jour par jour (decision ARR-01 etendue aux km) : 512,5 -> 513 ; 20,5 -> 21.
        tr = [{"date": date(2026, 9, 8), "km": "12.5"}]
        self.assertEqual(self.ok(m.indemnite_kilometrique_mois(tr, 41, 5))["indemnite_centimes"], 513)
        tr.append({"date": date(2026, 9, 9), "km": "0.5"})
        self.assertEqual(self.ok(m.indemnite_kilometrique_mois(tr, 41, 5))["indemnite_centimes"], 534)


class Evenements(Base):
    def duree(self, ev, d, **kw):
        return self.ok(m.conge_evenement_familial(ev, d, **kw))["jours_ouvrables_remuneres"]

    def test_durees_communes(self):
        d = date(2026, 9, 10)
        for ev, n in (("mariage_pacs", 4), ("mariage_pacs_enfant", 1), ("naissance", 3), ("adoption", 3),
                      ("deces_proche", 3), ("deces_descendant", 1), ("deces_ascendant", 1),
                      ("deces_enfant", 12), ("deces_enfant_majore", 14)):
            self.assertEqual(self.duree(ev, d), n, ev)

    def test_handicap_versions(self):
        self.assertEqual(self.duree("handicap_enfant", date(2023, 7, 20)), 2)
        self.assertEqual(self.duree("handicap_enfant", date(2023, 7, 21)), 5)
        self.assertEqual(self.duree("handicap_enfant", date(2026, 6, 13)), 5)
        self.assertEqual(self.duree("handicap_enfant", date(2026, 6, 14)), 10)
        self.assertEqual(self.duree("handicap_enfant", date(2023, 1, 10), pathologie_ou_cancer=True), 2)

    def test_deces_enfant_versions(self):
        self.assertEqual(self.duree("deces_enfant", date(2023, 7, 20)), 5)
        self.assertEqual(self.duree("deces_enfant", date(2023, 7, 21)), 12)
        self.refus(m.conge_evenement_familial("deces_enfant_majore", date(2023, 7, 20)), "EVT-OUVRES-2021")
        self.assertEqual(self.duree("deces_enfant_majore", date(2024, 1, 10)), 14)

    def test_deuil(self):
        # T-103 (C9) : CCN 48.1.3.1.2 : « congé complémentaire de deuil de 8 jours ouvrables » ; 48.1.3.1.3 : salaire
        # maintenu « sous déduction des indemnités journalières » (montant demandé : conge_deuil). Ancien refus M-06.
        self.assertEqual(self.duree("deuil_complementaire", date(2026, 9, 10)), 8)

    def test_600_km(self):
        r = self.ok(m.conge_evenement_familial("naissance", date(2026, 9, 10), deplacement_plus_600km=True))
        self.assertEqual(r["jours_ouvrables_non_remuneres"], 1)

    def test_hors_ccn(self):
        self.refus(m.conge_evenement_familial("naissance", date(2021, 12, 20)), "HORS-CCN")

    def test_jours(self):
        r = self.ok(m.jours_conge_evenement("naissance", date(2026, 9, 10), date(2026, 9, 10), date(2026, 9, 14)))
        self.assertEqual(r["jours"], {"2026-09-10": "remunere", "2026-09-11": "remunere", "2026-09-12": "remunere",
                                      "2026-09-13": "non_ouvrable", "2026-09-14": "hors_droit"})
        r = self.ok(m.jours_conge_evenement("naissance", date(2026, 9, 10), date(2026, 9, 10), date(2026, 9, 14),
                                            deplacement_plus_600km=True))
        self.assertEqual(r["jours"]["2026-09-14"], "non_remunere")

    def test_ferie(self):
        # T-103 (C7) : CCN 48, liminaire : jours ouvrables « a l'exception [...] des jours feries chomes » ; L3142-4 :
        # jours ouvrables. Le 11/11 ne compte pas : mariage (4 jours) du 09/11 au 13/11. Ancien refus EVT-FERIE.
        r = self.ok(m.jours_conge_evenement("mariage_pacs", date(2026, 11, 9), date(2026, 11, 9), date(2026, 11, 13)))
        self.assertEqual(r["jours"], {"2026-11-09": "remunere", "2026-11-10": "remunere", "2026-11-11": "ferie",
                                      "2026-11-12": "remunere", "2026-11-13": "remunere"})


class Preavis(Base):
    def test_demission_moins_de_3_mois(self):
        r = self.ok(m.duree_preavis("am", date(2026, 3, 2), date(2026, 4, 15), date(2026, 4, 16)))
        self.assertEqual(r["preavis"], {"jours": 8})

    def test_demission_3_mois_a_1_an(self):
        # T-103 (F2) : CASF L423-26 : un mois « a moins que l'employeur n'accepte d'abreger cette duree » ;
        # CCN 120 : 15 jours calendaires ; C. trav. L2251-1 (par CASF L423-2, 6°) : plus favorable permis.
        r = self.ok(m.duree_preavis("am", date(2026, 3, 2), date(2026, 7, 15), date(2026, 7, 16)))
        self.assertEqual(r["preavis"], {"jours": 15})
        # F1 (corrige) : presentation le 16/07 = 1er jour ; 15 jours : 30/07 (fiche F2883).
        self.assertEqual(r["date_fin_preavis"], date(2026, 7, 30))

    def test_demission_un_an(self):
        r = self.ok(m.duree_preavis("am", date(2025, 1, 5), date(2026, 6, 5), date(2026, 6, 6)))
        self.assertEqual(r["preavis"], {"mois": 1})

    def test_anciennete_a_l_envoi(self):
        # envoi avant 3 mois, presentation apres : CCN 120, anciennete au jour de l'envoi
        r = self.ok(m.duree_preavis("employeur", date(2026, 1, 10), date(2026, 4, 5), date(2026, 4, 15)))
        self.assertEqual(r["preavis"], {"jours": 8})


if __name__ == "__main__":
    unittest.main()
