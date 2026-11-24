"""T-076 (passage 1) : contrat a planning variable et CDD.
Attendus tires des formules de regles/t076-planning-variable.md et regles/t076-cdd.md,
choix de regles/t076-decisions-direction.md (sections 1 et 2). Exemples relevés :
E-PV-02 (Departement du Cher, 7 HC), E-PV-03 (DDETS 31 FAQ 1.25, 30 HC par semaine de
vacances), E-CDD-01 (Urssaf : 1 600 EUR brut, IFC 160 EUR), E-CDD-02 (DREETS : 45 h x 52 / 12)."""

import os
import sys
import unittest
from datetime import date, timedelta
from fractions import Fraction

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402
from moteur_b.commun import arrondi_arr01  # noqa: E402


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


def semaine(jours, minutes):
    return {j: minutes for j in jours}


A45 = semaine(range(5), 540)       # semaine A : lundi a vendredi, 9 h (45 h)
B20 = semaine(range(4), 300)       # semaine B : lundi a jeudi, 5 h (20 h)
A_15 = semaine(range(5), 180)      # periscolaire 15 h
V_45 = semaine(range(5), 540)      # vacances 45 h
ANCRE = date(2026, 8, 31)          # lundi d'une semaine A


class PVCycle(unittest.TestCase):
    """R-PV-02, P-PV-4 lecture Q1 (decisions, 1) : rang calendaire depuis l'ancre."""

    def test_rang_du_cycle(self):
        for lu, i in ((date(2026, 8, 31), 0), (date(2026, 9, 7), 1), (date(2026, 9, 14), 0),
                      (date(2026, 8, 24), 1), (date(2027, 1, 4), 0)):
            self.assertEqual(R(m.semaine_prevue(lu, cycle=[A45, B20], cycle_ancre=ANCRE), "index"), i)

    def test_cycle_de_trois(self):
        r = m.semaine_prevue(date(2026, 9, 21), cycle=[A45, B20, B20], cycle_ancre=ANCRE)
        self.assertEqual(R(r, "index"), 0)
        self.assertEqual(R(r, "minutes_semaine"), 2700)

    def test_s2_semaine_saisie_et_manquante(self):
        pl = {date(2026, 9, 7): B20}
        self.assertEqual(R(m.semaine_prevue(date(2026, 9, 7), plannings_semaines=pl), "minutes_semaine"), 1200)
        self.assertEqual(m.semaine_prevue(date(2026, 9, 14), plannings_semaines=pl)["code"], "PV-SEMAINE-SANS-PLANNING")

    def test_semaine_prevue_plus_45h_refusee(self):
        a50 = semaine(range(5), 600)
        self.assertEqual(m.semaine_prevue(date(2026, 9, 7), cycle=[a50, B20], cycle_ancre=ANCRE)["code"],
                         "PV-SEMAINE-PREVUE-PLUS-45H")
        self.assertEqual(m.mensualisation_planning_variable(52, 150, 500, cycle=[a50, B20])["code"],
                         "PV-SEMAINE-PREVUE-PLUS-45H")
        self.assertEqual(m.semaine_prevue(date(2026, 9, 7), plannings_semaines={date(2026, 9, 7): a50})["code"],
                         "PV-SEMAINE-PREVUE-PLUS-45H")
        # S2 (decisions, 1) : la semaine de 50 h ne refuse que les mois qu'elle touche ; le mensualise vient du
        # contrat (heures mensualisees), les autres semaines sont calculees.
        pl = {date(2026, 9, 7): B20, date(2026, 10, 12): a50}
        self.assertEqual(R(m.semaine_prevue(date(2026, 9, 7), plannings_semaines=pl), "minutes_semaine"), 1200)
        self.assertEqual(m.semaine_prevue(date(2026, 10, 12), plannings_semaines=pl)["code"],
                         "PV-SEMAINE-PREVUE-PLUS-45H")
        self.assertEqual(R(m.mensualisation_planning_variable(52, 130, 500), "salaire_mensualise_centimes"), 65000)


class PVMensualisation(unittest.TestCase):
    """R-PV-03 (D423-5 14° : heures mensualisees du contrat), P-PV-1 (choix L1 / L2)."""

    def test_l1_cycle_52(self):
        # (45 + 20) / 2 x 52 / 12 = 845/6 h ; x 5,00 EUR = 70 416,666... centimes -> 70 417.
        r = m.mensualisation_planning_variable(52, "845/6", 500, cycle=[A45, B20])
        self.assertEqual(R(r, "lecture"), "L1")
        self.assertEqual(R(r, "salaire_mensualise_centimes"), 70417)
        self.assertEqual(R(r, "total_prevu_mensuel_minutes"), "8450")

    def test_l1_a_une_minute_pres(self):
        # Total prevu / 12 = 8450 min ; 140,82 h = 8449,2 min : ecart < 1 min -> L1.
        self.assertEqual(R(m.mensualisation_planning_variable(52, "140.82", 500, cycle=[A45, B20]), "lecture"), "L1")
        self.assertEqual(R(m.mensualisation_planning_variable(52, "140.8", 500, cycle=[A45, B20]), "lecture"), "L2")

    def test_l2_e_pv_03(self):
        # E-PV-03 : 52 semaines sur la base de 15 h -> 15 x 52 / 12 = 65 h ; B = 65 x 12 / 52 = 15 h.
        r = m.mensualisation_planning_variable(52, 65, 400, cycle=[A_15, V_45])
        self.assertEqual(R(r, "lecture"), "L2")
        self.assertEqual(R(r, "base_hebdo_minutes"), "900")
        self.assertEqual(R(r, "salaire_mensualise_centimes"), 26000)
        # Semaine de vacances : 45 h reelles - 15 h = 30 HC.
        h = m.heures_en_plus_semaine_planning_variable("L2", 2700, 900, 2700, 400, 10)
        self.assertEqual(R(h, "minutes_complementaires"), "1800")
        self.assertEqual(R(h, "montant_complementaires_centimes"), 12000)

    def test_46_semaines(self):
        # 40 semaines, cycle 45 h / 20 h : 32,5 x 40 / 12 = 325/3 h ; contrat 100 h -> L2, B = 100 x 12 / 40 = 30 h.
        r = m.mensualisation_planning_variable(40, 100, 500, cycle=[A45, B20])
        self.assertEqual(R(r, "lecture"), "L2")
        self.assertEqual(R(r, "base_hebdo_minutes"), "1800")
        self.assertEqual(R(r, "type_annee"), "incomplete")
        self.assertEqual(m.mensualisation_planning_variable(48, 100, 500, cycle=[A45, B20])["code"], "A-01")

    def test_s2_toujours_l1(self):
        r = m.mensualisation_planning_variable(52, 130, 450)
        self.assertEqual(R(r, "lecture"), "L1")
        self.assertEqual(R(r, "salaire_mensualise_centimes"), 58500)


class PVHeures(unittest.TestCase):
    """R-PV-04 (CCN 96.4, semaine par semaine), R-PV-05 (HM au-dela de 45 h reelles)."""

    def test_e_pv_02_sept_heures(self):
        # Base 30 h ; semaines 1 a 4 : 30, 35, 28, 32 h reelles -> +5 et +2 = 7 HC (E-PV-02).
        for lecture in ("L1", "L2"):
            total = 0
            for reel in (30, 35, 28, 32):
                h = m.heures_en_plus_semaine_planning_variable(lecture, 1800, 1800, reel * 60, 1000, 10)
                total += Fraction(R(h, "minutes_complementaires"))
            self.assertEqual(total, 7 * 60, lecture)
        # Semaine 5 a cheval : payee sur fevrier (mois ou elle finit).
        r = m.mois_de_rattachement_semaine(date(2026, 1, 26))
        self.assertEqual((R(r, "annee"), R(r, "mois")), (2026, 2))

    def test_l1_reference_semaine_prevue(self):
        # Semaine B prevue 20 h, 23 h reelles : 3 HC en L1 (prevu de la semaine).
        h = m.heures_en_plus_semaine_planning_variable("L1", 1200, None, 1380, 500, 10, majoration_hc_pourcent=10)
        self.assertEqual(R(h, "minutes_complementaires"), "180")
        self.assertEqual(R(h, "montant_complementaires_centimes"), 1650)  # 3 x 5 x 1,10

    def test_semaine_courte_pas_de_deduction_ni_hc(self):
        # R-PV-06 : une semaine sous la moyenne ne donne rien (pas de HC negatives).
        h = m.heures_en_plus_semaine_planning_variable("L1", 1200, None, 1200, 500, 10)
        self.assertEqual(R(h, "montant_complementaires_centimes"), 0)

    def test_hm_au_dela_de_45h(self):
        # Semaine A 45 h prevue, 47 h reelles : 0 HC, 2 HM a +25 % : 2 x 5 x 1,25 = 12,50 EUR.
        h = m.heures_en_plus_semaine_planning_variable("L1", 2700, None, 2820, 500, 25)
        self.assertEqual(R(h, "minutes_complementaires"), "0")
        self.assertEqual(R(h, "montant_majorees_centimes"), 1250)
        # Semaine B 20 h prevue, 47 h reelles : 25 HC et 2 HM.
        h = m.heures_en_plus_semaine_planning_variable("L1", 1200, None, 2820, 500, 25)
        self.assertEqual(R(h, "minutes_complementaires"), "1500")
        self.assertEqual(R(h, "minutes_majorees"), "120")

    def test_refus(self):
        self.assertEqual(m.heures_en_plus_semaine_planning_variable("L1", 1200, None, 1380, 500, 10,
                                                                    absence_dans_semaine=True)["code"], "A-09")
        self.assertEqual(m.heures_en_plus_semaine_planning_variable("L1", 1200, None, 1380, 500, 5)["statut"],
                         "erreur_saisie")


def plannings_sept_2026():
    return {ANCRE + timedelta(weeks=i): (A45 if i % 2 == 0 else B20) for i in range(5)}


class PVAbsences(unittest.TestCase):
    """R-PV-08 (CCN 111 : contrat ou planning remis), R-PV-12 (ferie, lecture F1), R-PV-09 (CCN 48.1.1.3)."""

    def test_prevu_du_mois(self):
        # Septembre 2026 : A (mar.-ven. 4 x 9 h), B (4 x 5 h), A (5 x 9 h), B (4 x 5 h), A (lun.-mer. 3 x 9 h).
        p = plannings_sept_2026()
        self.assertEqual(R(m.prevu_du_mois_planning_variable(2026, 9, p, "complete"), "prevu_minutes"),
                         2160 + 1200 + 2700 + 1200 + 1620)
        self.assertEqual(R(m.prevu_du_mois_planning_variable(2026, 9, p, "incomplete"), "prevu_jours"), 20)
        p.pop(date(2026, 9, 21))
        self.assertEqual(m.prevu_du_mois_planning_variable(2026, 9, p, "complete")["code"], "PV-SEMAINE-SANS-PLANNING")

    def test_deduction_sur_le_planning_du_mois(self):
        # AM malade lundi et mardi d'une semaine B : 600 min sur 8 880 ; mensualise 70 417.
        ded = R(m.deduction_absence("complete", 70417, 600, 8880), "deduction_centimes")
        self.assertEqual(ded, arrondi_arr01(Fraction(70417 * 600, 8880)))

    def test_ferie_f1(self):
        # 11/11/2026 (mercredi) ; semaine A : prevu -> maintien si veille et lendemain travailles.
        prevus = {date(2026, 11, 9) + timedelta(days=i) for i in range(5)}
        r = m.ferie_chome_planning_variable(date(2026, 11, 11), prevus)
        self.assertTrue(R(r, "remuneration_maintenue"))
        self.assertEqual(R(r, "jours_condition"), ["2026-11-10", "2026-11-12"])
        r = m.ferie_chome_planning_variable(date(2026, 11, 11), prevus, presence_veille="absence_am")
        self.assertFalse(R(r, "remuneration_maintenue"))
        # Semaine B sans mercredi : ferie non prevu, sans effet (lecture F1).
        prevus_b = {date(2026, 11, 9), date(2026, 11, 10), date(2026, 11, 12)}
        self.assertFalse(R(m.ferie_chome_planning_variable(date(2026, 11, 11), prevus_b),
                           "jour_habituellement_travaille"))

    def test_decompte_cp(self):
        # Semaine B (lundi a jeudi) : conge du lundi 7 au samedi 12/09/2026, reprise lundi 14 : 6 jours ouvrables.
        prevus = {date(2026, 9, 7) + timedelta(days=i) for i in range(4)}
        r = m.decompte_jours_cp_planning_variable(date(2026, 9, 7), date(2026, 9, 14), prevus)
        self.assertEqual(R(r, "jours_decomptes"), 6)
        # Conge saisi a partir du vendredi non prevu : premier jour decompte = lundi suivant prevu.
        prevus |= {date(2026, 9, 14) + timedelta(days=i) for i in range(5)}
        r = m.decompte_jours_cp_planning_variable(date(2026, 9, 11), date(2026, 9, 21), prevus)
        self.assertEqual(R(r, "premier_jour_decompte"), "2026-09-14")
        self.assertEqual(R(r, "jours_decomptes"), 6)


class PVConges(unittest.TestCase):
    """R-PV-10, P-PV-5 : maintien C1 / C2, dixieme, part sure."""

    def test_c1_c2(self):
        # Periode : 26 A + 26 B = 101 400 min sur 52 semaines (32,5 h) ; C1 = 5 x 32,5 x 30 / 6 = 812,50 EUR.
        # Conges : 3 A + 2 B = 10 500 min = 175 h ; C2 = 875 EUR. Dixieme : 12 x 70 417 / 10 = 84 500,4 c.
        r = m.indemnite_cp_planning_variable(30, 500, 101400, 52, 10500, 12 * 70417)
        self.assertEqual(R(r, "lectures"), [84500, 87500])
        self.assertEqual(R(r, "indemnite_centimes"), 84500)
        self.assertEqual(R(r, "a_confirmer_centimes"), 3000)
        self.assertEqual(R(r, "methodes"), ["dixieme", "maintien"])
        self.assertEqual(m.complement_cp_planning_variable(r)["code"], "A-29")

    def test_maintien_egal(self):
        # C1 = C2 = 812,50 EUR > dixieme : complement nul.
        r = m.indemnite_cp_planning_variable(30, 500, 101400, 52, 9750, 700000)
        self.assertEqual(R(r, "lectures"), [81250, 81250])
        self.assertEqual(R(m.complement_cp_planning_variable(r), "complement_centimes"), 0)
        r = m.indemnite_cp_planning_variable(30, 500, 101400, 52, 10500, 700000)
        self.assertEqual(m.complement_cp_planning_variable(r)["code"], "P-PV-5")

    def test_refus(self):
        self.assertEqual(m.indemnite_cp_planning_variable(30, 500, 101400, 52, None, 700000)["code"],
                         "PV-C2-DROIT-NON-PRIS")
        self.assertEqual(m.indemnite_cp_planning_variable(30, 500, 101400, 52, 10500, 845004,
                                                          icp_versee_pendant_periode_centimes=0,
                                                          icp_annee_precedente_centimes=90000)["code"], "A-28")


class CDDMensualisation(unittest.TestCase):
    """R-CDD-04 (CCN 108.1, 109.1 par L1242-14), P1, P2."""

    def test_e_cdd_02(self):
        r = m.mensualisation_cdd(2700, 500)
        self.assertEqual(R(r, "heures_mensualisees"), "195")
        self.assertEqual(R(r, "salaire_mensualise_centimes"), 97500)

    def test_moins_d_un_mois(self):
        for deb, fin, att in ((date(2026, 9, 7), date(2026, 9, 25), True), (date(2026, 9, 1), date(2026, 9, 30), False),
                              (date(2026, 9, 15), date(2026, 10, 13), True), (date(2026, 9, 15), date(2026, 10, 14), False)):
            self.assertEqual(R(m.cdd_moins_d_un_mois(deb, fin), "moins_d_un_mois"), att)
        self.assertEqual(m.cdd_moins_d_un_mois(date(2026, 1, 30), date(2026, 2, 10))["code"], "DATE-MOIS")

    def test_p1_deux_lectures(self):
        # T-103 (F11) : lecture 1 seule (CCN 108.1 « quels que soient le nombre d'heures [...] et le nombre de
        # semaines », C. trav. L1242-14 ; DG 22/11/2026, question n° 9 close) : 600 - 300 = 300 EUR.
        r = m.salaire_mois_cdd_moins_d_un_mois(60000, 30000, 500, 72 * 60)
        self.assertEqual(R(r, "valeur_centimes"), 30000)
        self.assertEqual(R(r, "a_confirmer_centimes"), 0)

    def test_p2_qualification(self):
        # T-103 (F12) : mode 46 semaines (CCN 97.1, 109.2 par L1242-14) ; la lecture « 52 » est refusee.
        self.assertEqual(m.qualifier_semaine_sans_accueil_cdd("52")["statut"], "erreur_saisie")
        self.assertFalse(R(m.qualifier_semaine_sans_accueil_cdd("46"), "deductible"))
        r = m.deux_lectures_cdd(52000, 50000, "P2")
        self.assertEqual((R(r, "valeur_centimes"), R(r, "a_confirmer_centimes")), (50000, 2000))


class CDDFin(unittest.TestCase):
    """R-CDD-06 a R-CDD-10, P3, P4."""

    def test_e_cdd_01(self):
        # Urssaf : 800 + 800 = 1 600 EUR brut ; IFC = 160 EUR.
        brut = R(m.assiette_ifc([80000, 80000]), "brut_cdd_centimes")
        self.assertEqual(brut, 160000)
        r = m.indemnite_fin_cdd(brut, "terme")
        self.assertEqual(R(r, "indemnite_centimes"), 16000)

    def test_table_r_cdd_08(self):
        att = {"terme": 16000, "suite_cdi": 0, "refus_cdi": 0, "initiative_am": 0, "faute_grave": 0, "essai": 0,
               "commun_accord": 16000, "employeur": 16000}
        for fin, v in att.items():
            self.assertEqual(R(m.indemnite_fin_cdd(160000, fin), "indemnite_centimes"), v, fin)
            self.assertEqual(R(m.ifc_due(fin), "due"), v > 0, fin)
        for fin in ("force_majeure", "inaptitude", "jeune_vacances", "saisonnier"):
            self.assertEqual(m.indemnite_fin_cdd(160000, fin)["code"], "CDD-FIN-NON-GEREE")
        self.assertEqual(m.indemnite_fin_cdd(160000, "autre")["statut"], "erreur_saisie")

    def test_p4(self):
        # T-103 (F10) : l'ICCP n'entre pas dans la base de l'IFC (circulaire DRT n° 18/90, § 4.2.3) : 160 EUR.
        r = m.indemnite_fin_cdd(160000, "terme", iccp_centimes=17600)
        self.assertEqual(R(r, "indemnite_centimes"), 16000)
        self.assertEqual(R(r, "a_confirmer_centimes"), 0)

    def test_iccp_ifc_dans_la_base_et_plancher(self):
        # Dixieme : (1 600 + 160) / 10 = 176 EUR = plancher L1242-16. T-103 (F9) : jours inconnus : le maintien
        # a comparer n'est pas connu : refus avec le code de l'acquisition.
        p = [{"salaires_bruts_periode_centimes": 160000, "jours_acquis": None, "jours_payes": 0, "code_jours": "A-23"}]
        r = m.iccp_cdd("terme", p, 16000, 160000, 2400, 461)
        self.assertEqual(r["code"], "A-23")
        # 6 jours : maintien = 6 / 6 x 40 h x 4,61 = 184,40 EUR > 176 EUR. T-103 (F9, CCN 48.1.1.5 « le montant le
        # plus avantageux ») : 184,40 EUR.
        p[0]["jours_acquis"] = 6
        r = m.iccp_cdd("terme", p, 16000, 160000, 2400, 461)
        self.assertEqual(R(r, "iccp_centimes"), 18440)
        # IFC non due (essai) : base sans IFC (dixieme 160 EUR) ; maintien 184,40 EUR plus haut.
        r = m.iccp_cdd("essai", p, 0, 160000, 2400, 461)
        self.assertEqual(R(r, "iccp_centimes"), 18440)

    def test_iccp_suite_cdi_et_refus(self):
        p = [{"salaires_bruts_periode_centimes": 160000, "jours_acquis": 6, "jours_payes": 0}]
        self.assertEqual(R(m.iccp_cdd("suite_cdi", p, 0, 160000, 2400, 461), "iccp_centimes"), 0)
        # T-103 (F7, F9) : deux periodes. Periode 1 : max(160 ; 184,40) = 184,40 EUR. Periode 2 : base 1 600 + 184,40
        # (ICCP de la periode 1, CCN 48.1.1.5) + 160 (IFC) = 1 944,40 EUR, dixieme 194,44 EUR > 184,40.
        # Total 378,84 EUR > plancher (3 200 + 160) / 10 = 336 EUR. Ancien refus A-50 (D10) leve.
        r = m.iccp_cdd("terme", p + p, 16000, 320000, 2400, 461)
        self.assertEqual(R(r, "iccp_centimes"), 37884)
        self.assertEqual(m.iccp_cdd("terme", [dict(p[0], jours_supplementaires=2)], 16000, 160000, 2400, 461)["code"],
                         "CP-SUPP")
        q = [dict(p[0], jours_payes=6)]
        self.assertEqual(m.iccp_cdd("terme", q, 16000, 160000, 2400, 461)["code"], "CDD-PLANCHER-L1242-16")

    def test_ni_preavis_ni_rupture(self):
        r = m.preavis_et_rupture_cdd("terme")
        self.assertEqual((R(r, "preavis_centimes"), R(r, "indemnite_rupture_centimes")), (0, 0))



class T076Corrections(unittest.TestCase):
    """Decisions de la direction, section 4 (D1 a D11), et rapport T-076-verif-b (B1, B2)."""

    def test_d1_premier_mai_et_autre_ferie(self):
        # Base 15 h ; semaine A de 45 h ; un jour chome de 9 h, 36 h travaillees.
        h = m.heures_en_plus_semaine_planning_variable("L2", 2700, 900, 2160, 500, 25, minutes_1er_mai_chome=540)
        self.assertEqual(R(h, "lectures_montant_complementaires"), [15000, 15000])  # 30 HC, CCN 47.1
        h = m.heures_en_plus_semaine_planning_variable("L2", 2700, 900, 2160, 500, 25, minutes_payees_non_travaillees=540)
        self.assertEqual(R(h, "lectures_montant_complementaires"), [10500, 15000])  # 21 HC ou 30 HC (CCN 47.2)
        self.assertEqual(R(h, "montant_complementaires_centimes"), 10500)

    def test_d2_absence_retenue(self):
        r = m.heures_en_plus_semaine_planning_variable("L2", 2700, 900, 2160, 500, 25, absence_retenue=True)
        self.assertEqual(r["code"], "PV-L2-ABSENCE-HC")
        # Semaine prevue egale a la base : pas de HC prevue touchee, calcul normal.
        r = m.heures_en_plus_semaine_planning_variable("L2", 900, 900, 720, 500, 25, absence_retenue=True)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 0)

    def test_d4_semaine_incomplete(self):
        # Contrat commence un mercredi d'une semaine A : 27 h prevues et faites ; base 15 h ou 15 x 3/5 = 9 h.
        h = m.heures_en_plus_semaine_planning_variable("L2", 1620, 900, 1620, 500, 25, prorata_base=(3, 5))
        self.assertEqual(R(h, "lectures_montant_complementaires"), [6000, 9000])

    def test_b2_iccp_fin_planning_variable(self):
        # Cycle 45 h / 15 h, 130 h mensualisees a 5 EUR, 12 mois, 30 jours non pris.
        # Dixieme : 12 x 650 / 10 = 780 EUR ; C1 = 30 / 6 x 30 h x 5 EUR = 750 EUR : 780 EUR.
        p = [{"jours_acquis": 30, "jours_payes": 0, "salaires_bruts_periode_centimes": 780000,
              "heures_prevues_periode_minutes": 52 * 1800, "semaines_prevues_travaillees": 52}]
        self.assertEqual(R(m.iccp_planning_variable("complete", "normal", p, 500), "iccp_centimes"), 78000)
        p[0]["salaires_bruts_periode_centimes"] = 600000  # dixieme 600 EUR < C1 750 EUR
        self.assertEqual(R(m.iccp_planning_variable("complete", "normal", p, 500), "iccp_centimes"), 75000)
        p[0]["jours_supplementaires"] = 2
        self.assertEqual(R(m.iccp_planning_variable("complete", "normal", p, 500), "iccp_centimes"), 75000)
        p[0]["salaires_bruts_periode_centimes"] = 780000
        self.assertEqual(m.iccp_planning_variable("complete", "normal", p, 500)["code"], "CP-SUPP")

    def test_cp_supp_planning_variable(self):
        r = m.indemnite_cp_planning_variable(30, 500, 101400, 52, 10500, 12 * 70417, jours_supplementaires=2)
        self.assertEqual(r["code"], "CP-SUPP")

    def test_b1_d11_solde_fin_cdd(self):
        # CDD-SANS-ACCUEIL : lecture 46 : 434 + 1 414 = 1 848 EUR ; lecture 52 : 1 869,64 EUR ; verse 434 EUR.
        r = m.solde_fin_cdd([184800, 186964], 43400, "terme")
        self.assertEqual(R(r, "solde_centimes"), 141400)
        self.assertEqual(R(r, "a_confirmer_centimes"), 2164)
        self.assertEqual(R(m.solde_fin_cdd([184800, 186964], 43400, "suite_cdi"), "solde_centimes"), 0)  # D8

    def test_d9_dates(self):
        t = date(2026, 5, 29)
        self.assertEqual(m.controle_dates_cdd("initiative_am", t, t)["code"], "CDD-DATE-FIN")
        self.assertEqual(m.controle_dates_cdd("terme", date(2026, 6, 5), t)["code"], "CDD-DEVENU-CDI")
        self.assertTrue(R(m.controle_dates_cdd("commun_accord", date(2026, 4, 30), t), "dates_coherentes"))

    def test_d3(self):
        self.assertEqual(m.verifier_cas_cdd(True, False, True)["code"], "CDD-PASSAGE-2")
        self.assertEqual(m.verifier_cas_cdd(False, True, True)["code"], "CDD-PASSAGE-2")
        self.assertEqual(m.verifier_cas_cdd(True, False, False)["code"], "CDD-PASSAGE-2")  # D15
        self.assertTrue(R(m.verifier_cas_cdd(False, False, True), "gere"))

    def test_d16_s2_deux_references(self):
        # Planning remis 40 h, contrat 130 h sur 52 semaines : B = 130 x 12 / 52 = 30 h. 40 h faites.
        r = m.mensualisation_planning_variable(52, 130, 500)
        self.assertEqual(R(r, "base_contrat_minutes"), "1800")
        h = m.heures_en_plus_semaine_planning_variable("L1", 2400, None, 2400, 500, 25, base_contrat_minutes=1800)
        self.assertEqual(R(h, "lectures_montant_complementaires"), [0, 5000])
        self.assertEqual(R(h, "montants_par_lecture"), [0, 5000])
        # Semaine courte (15 h prevues, 17 h faites) : 2 HC en lecture 1, aucune en lecture 2 ; le mois somme
        # chaque lecture a part (jamais le minimum semaine par semaine).
        h = m.heures_en_plus_semaine_planning_variable("L1", 900, None, 1020, 500, 25, base_contrat_minutes=1800)
        self.assertEqual(R(h, "montants_par_lecture"), [1000, 0])

    def test_d19_essai(self):
        # Du 05/01 au 29/05/2026 : 145 jours, 20 semaines entieres ou 21 entamees, plafond 14 jours (<= 6 mois).
        d, t = date(2026, 1, 5), date(2026, 5, 29)
        self.assertEqual(R(m.controle_essai_cdd(d, t, date(2026, 1, 9)), "essai_max_jours"), [14, 14])
        self.assertEqual(m.controle_essai_cdd(d, t, date(2026, 1, 30))["code"], "CDD-ESSAI-DEPASSE")
        # CDD de 8 semaines et 3 jours (59 jours) : 8 ou 9 jours d'essai.
        t2 = date(2026, 3, 4)
        self.assertEqual(m.controle_essai_cdd(d, t2, date(2026, 1, 13))["code"], "CDD-ESSAI-LIMITE")


if __name__ == "__main__":
    unittest.main()
