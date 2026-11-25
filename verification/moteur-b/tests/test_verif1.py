"""Verification independante n° 1 (25/11/2026) : corrections B-1 a B-6 (rapports/verif-1.md de calculateur-arvela).
Attendus faits a la main a partir des textes cites dans moteur_b (heures.calcul_h9, conges.acquisition_cp_periode)."""
import unittest
from datetime import date, timedelta

import moteur_b as m


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


H = 60


def sem(contrat_h, eff_h, cp_h=0, mai_h=0, pay_h=0, ret_h=0, x_h=0, taux=500, maj_hc=0):
    r = m.heures_en_plus_semaine_h9(contrat_h * H, eff_h * H, taux, 10, majoration_hc_pourcent=maj_hc,
                                     minutes_conges_payes=cp_h * H, minutes_1er_mai_chome=mai_h * H,
                                     minutes_payees_non_travaillees=pay_h * H, minutes_retenues=ret_h * H,
                                     minutes_en_plus_des_jours=x_h * H)
    return (R(r, "montant_normales_centimes"), R(r, "montant_complementaires_centimes"),
            R(r, "montant_majorees_centimes"))


class H9(unittest.TestCase):
    """Tableau de rapports/T-103-H9-H2-preuves.md, refait sur B (contrat 40 h, 5,00 EUR de l'heure)."""

    def test_a_absence_payee(self):
        # Lundi enfant absent paye (8 h), mardi a vendredi 11 h : 44 h faites, 12 h en plus : 12 HC.
        self.assertEqual(sem(40, 44, pay_h=8, x_h=12), (0, 6000, 0))

    def test_a0_sans_absence(self):
        # 5 x 10 h 24 = 52 h : 5 HC + 7 HM (majoration 10 %).
        self.assertEqual(sem(40, 52, x_h=12), (0, 2500, 3850))

    def test_c_ferie_45h(self):
        # 45 h, ferie chome 9 h, 4 jours de 10 h : 4 HC, pas de HM (40 h de travail effectif).
        self.assertEqual(sem(45, 40, pay_h=9, x_h=4), (0, 2000, 0))

    def test_d_conge_paye_45h(self):
        # 45 h, lundi CP (9 h), mardi a vendredi 11 h : 44 + 9 = 53 h : 8 HM (Cass. soc. 10/09/2025).
        self.assertEqual(sem(45, 44, cp_h=9, x_h=8), (0, 0, 4400))

    def test_e_retenue_compensee(self):
        # Lundi AM malade (8 h retenues), mardi 11 h, mercredi a vendredi 8 h : 35 h, 3 h normales.
        self.assertEqual(sem(40, 35, ret_h=8, x_h=3), (1500, 0, 0))

    def test_f_retenue_puis_hc(self):
        # Lundi AM malade, mardi a vendredi 11 h : 44 h : 8 h normales puis 4 HC.
        self.assertEqual(sem(40, 44, ret_h=8, x_h=12), (4000, 2000, 0))

    def test_h_payee_et_retenue(self):
        # 45 h : lundi absent paye (9 h), mardi sans solde (9 h retenues), mercredi a vendredi 12 h : 9 h normales.
        self.assertEqual(sem(45, 36, pay_h=9, ret_h=9, x_h=9), (4500, 0, 0))

    def test_k_l_majoration_hc(self):
        # HC majorees de 25 % : absence payee + 3 h en plus : 3 HC a 6,25 ; retenue + 3 h : 3 h normales a 5,00.
        self.assertEqual(sem(40, 35, pay_h=8, x_h=3, maj_hc=25), (0, 1875, 0))
        self.assertEqual(sem(40, 35, ret_h=8, x_h=3, maj_hc=25), (1500, 0, 0))

    def test_planning_variable_l2(self):
        # Base 15 h, semaine prevue 45 h, 2 jours retenus (18 h), 27 h faites comme prevu : 12 HC, aucune heure
        # normale (rien de fait au-dela du prevu des jours travailles).
        r = m.heures_en_plus_semaine_planning_variable("L2", 2700, 900, 1620, 500, 25, minutes_retenues=1080)
        self.assertEqual((R(r, "montant_normales_centimes"), R(r, "montant_complementaires_centimes")), (0, 6000))


class C10C11(unittest.TestCase):
    def test_c10_bis_plus_favorable(self):
        na = [date(2026, 2, 9) + timedelta(days=i) for i in range(12)]
        r = m.acquisition_cp_periode("complete", date(2025, 6, 1), date(2026, 5, 31), jours_non_assimiles=na,
                                     jours_travail_semaine=[0, 1, 2, 3, 4])
        self.assertEqual(R(r, "jours_acquis"), 30)

    def test_c11_bis_premiere_annee(self):
        # Contrat du 01/09/2025 en 46 semaines ; 22/12 et 29/12 sans accueil, sans droits acquis : 37 semaines de
        # travail : 37 / 4 x 2,5 = 23,125 -> 24 (le decompte mensuel donne 22).
        lundis = [date(2025, 12, 22), date(2025, 12, 29)]
        for cpam, droits in (([], None), (lundis, 0)):
            kw = {} if droits is None else {"droits_cp_disponibles": droits}
            r = m.acquisition_cp_periode("incomplete", date(2025, 9, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                         semaines_cp_am=cpam, jours_travail_semaine=[0, 1, 2, 3, 4], **kw)
            self.assertEqual(R(r, "jours_acquis"), 24)
        # Avec 12 jours de droits : les deux semaines sont des conges payes : 39 semaines -> 25 (hebdomadaire).
        r = m.acquisition_cp_periode("incomplete", date(2025, 9, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                     semaines_cp_am=lundis, droits_cp_disponibles=12)
        self.assertEqual(R(r, "jours_acquis"), 23)  # aucune absence restante : decompte mensuel (9 mois -> 22,5)


if __name__ == "__main__":
    unittest.main()


class T104T107(unittest.TestCase):
    """Extension de B aux cas de T-104 et T-107 (verification 1). Repères de A cités dans rapports/T-104-moteur-b.md et
    T-107-moteur-b.md ; attendus refaits a la main depuis les textes."""

    def test_cpp_preavis_et_conges(self):
        # Lettre presentee le 15/10/2026, preavis d'un mois : 14/11 ; 5 jours de CP dans le preavis.
        cp = [(date(2026, 11, 2), date(2026, 11, 6))]
        f = lambda acc: R(m.date_fin_preavis_avec_conges(date(2026, 10, 15), {"mois": 1}, cp, acc), "date_fin")
        self.assertEqual(f(False), date(2026, 11, 19))
        self.assertEqual(f(True), date(2026, 11, 14))
        self.assertEqual(m.date_fin_preavis_avec_conges(date(2026, 10, 15), {"mois": 1}, cp)["code"], "CPP-ACCORD-INCONNU")
        # Guide DREETS BFC : conges du 02 au 21/08, preavis de 15 jours du 17 au 31/08 : sans accord 05/09.
        r = m.date_fin_preavis_avec_conges(date(2026, 8, 17), {"jours": 15}, [(date(2026, 8, 2), date(2026, 8, 21))], False)
        self.assertEqual(R(r, "date_fin"), date(2026, 9, 5))

    def test_dsa_grossesse(self):
        self.assertEqual(R(m.indemnite_preavis_non_fait_am(59091, False), "indemnite_demandable_centimes"), 59091)
        self.assertEqual(R(m.indemnite_preavis_non_fait_am(59091, True), "indemnite_demandable_centimes"), 0)
        self.assertFalse(R(m.indemnite_preavis_non_fait_am(59091, False), "retenue_sur_salaire_possible"))

    def test_fins_cdd(self):
        for fin, due in (("jeune_vacances", False), ("saisonnier", False), ("force_majeure", False),
                         ("inaptitude", True), ("agrement", False), ("terme", True)):
            self.assertEqual(R(m.ifc_due(fin), "due"), due, fin)
        self.assertEqual(m.ifc_due("usage")["code"], "CDD-FIN-NON-GEREE")
        # Agrement : CDD du 05/01/2026, rupture le 31/03 (moins de 3 mois) : IFC due ; le 06/04 : non due.
        self.assertTrue(R(m.ifc_due_agrement(date(2026, 1, 5), date(2026, 3, 31)), "due"))
        self.assertFalse(R(m.ifc_due_agrement(date(2026, 1, 5), date(2026, 4, 6)), "due"))
        self.assertEqual(R(m.indemnite_sinistre_cdd(86667), "indemnite_centimes"), 86667)

    def test_essai_cdd_semaines_entieres(self):
        # CDD du 05/01 au 14/02/2026 : 41 jours, 5 semaines entieres : essai de 5 jours au plus (09/01).
        self.assertTrue(R(m.controle_essai_cdd(date(2026, 1, 5), date(2026, 2, 14), date(2026, 1, 9)), "dans_essai"))
        self.assertEqual(m.controle_essai_cdd(date(2026, 1, 5), date(2026, 2, 14), date(2026, 1, 10))["code"],
                         "CDD-ESSAI-DEPASSE")

    def test_absences_protegees(self):
        for t in ("maternite", "paternite", "conge_naissance", "accident_travail", "accident_trajet"):
            self.assertTrue(R(m.qualifier_absence(t, "complete"), "deductible"), t)
        self.assertEqual(m.assimilation_cp("maternite"), "travail")
        self.assertEqual(m.assimilation_cp("accident_travail"), "travail")
        self.assertEqual(m.assimilation_cp("accident_trajet", 400), "maladie")
        self.assertEqual(m.assimilation_cp("conge_naissance"), "non")

    def test_occasionnel(self):
        # 40 h a 10,00 EUR : 400 EUR, CP 40 EUR ; 1 semaine : 1 jour (7/7 x 2,5 / 4 = 0,625 -> 1).
        self.assertEqual(R(m.salaire_accueil_occasionnel(2400, 1000), "salaire_centimes"), 40000)
        r = m.conges_accueil_occasionnel(40000, 7)
        self.assertEqual((R(r, "indemnite_centimes"), R(r, "jours")), (4000, 1))
        self.assertEqual(R(m.conges_accueil_occasionnel(45375, 14), "indemnite_centimes"), 4538)  # repere 45,38 EUR
