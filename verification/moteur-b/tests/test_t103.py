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


class F1F8DatesDuPreavis(unittest.TestCase):
    """F1 corrige : jour de presentation = 1er jour (CCN 64.1, 120 ; CASF L423-24 ; fiche officielle F2883)."""

    def test_exemple_officiel_f2883(self):
        # « Le preavis s'effectue du 8 juillet au 7 aout 2026 inclus ».
        r = m.date_fin_preavis(date(2026, 7, 8), {"mois": 1})
        self.assertEqual((R(r, "premier_jour"), R(r, "date_fin")), (date(2026, 7, 8), date(2026, 8, 7)))

    def test_jours(self):
        # Presentee le 15/10, 15 jours : du 15/10 au 29/10 ; 8 jours : du 15/10 au 22/10.
        self.assertEqual(R(m.date_fin_preavis(date(2026, 10, 15), {"jours": 15}), "date_fin"), date(2026, 10, 29))
        self.assertEqual(R(m.date_fin_preavis(date(2026, 10, 15), {"jours": 8}), "date_fin"), date(2026, 10, 22))

    def test_mois_apres_le_28(self):
        self.assertEqual(m.date_fin_preavis(date(2026, 1, 31), {"mois": 1})["code"], "DATE-MOIS")
        self.assertEqual(R(m.date_fin_preavis(date(2026, 12, 28), {"mois": 1}), "date_fin"), date(2027, 1, 27))

    def test_pas_de_report(self):
        # Samedi 14/11/2026, 8 jours : samedi 21/11/2026 ; aucun report au jour ouvrable suivant.
        self.assertEqual(R(m.date_fin_preavis(date(2026, 11, 14), {"jours": 8}), "date_fin"), date(2026, 11, 21))

    def test_duree_preavis_donne_la_date(self):
        r = m.duree_preavis("employeur", date(2025, 9, 1), date(2026, 10, 14), date(2026, 10, 15))
        self.assertEqual(R(r, "date_fin_preavis"), date(2026, 11, 14))

    def test_deces(self):
        # F8 (CCN 119.4.2) : deces le 15/09 ; le 15/09 est paye en salaire ; 15 jours : du 16/09 au 30/09 ;
        # un mois : du 16/09 au 15/10.
        r = m.periode_indemnite_deces(date(2026, 9, 15), {"jours": 15})
        self.assertEqual((R(r, "premier_jour"), R(r, "dernier_jour")), (date(2026, 9, 16), date(2026, 9, 30)))
        self.assertEqual(R(m.periode_indemnite_deces(date(2026, 9, 15), {"mois": 1}), "dernier_jour"),
                         date(2026, 10, 15))


class F2F3F4Rupture(unittest.TestCase):

    def test_f2_demission_quinze_jours(self):
        r = m.duree_preavis("am", date(2026, 3, 2), date(2026, 10, 14), date(2026, 10, 15))
        self.assertEqual(R(r, "preavis"), {"jours": 15})

    def test_f3_neuf_mois_a_la_fin(self):
        # Debut 05/01/2026 ; lettre 28/09 (moins de 9 mois) ; fin 13/10 (plus de 9 mois) : due. 8 000 / 80 = 100 EUR.
        r = m.indemnite_rupture("normal", "employeur", date(2026, 1, 5), date(2026, 9, 28), 800000,
                                date_fin_contrat=date(2026, 10, 13))
        self.assertEqual(R(r, "indemnite_centimes"), 10000)
        # Fin avant les 9 mois : non due.
        r = m.indemnite_rupture("normal", "employeur", date(2026, 1, 5), date(2026, 9, 15), 800000,
                                date_fin_contrat=date(2026, 9, 30))
        self.assertEqual(R(r, "indemnite_centimes"), 0)

    def test_f4_preavis_dans_l_assiette(self):
        # (8 000 + 400 ICCP + 728 ICP) / 80 = 114,10 EUR.
        r = m.indemnite_rupture("normal", "employeur", date(2025, 1, 5), date(2026, 6, 20), 800000,
                                iccp_centimes=40000, indemnite_preavis_centimes=72800)
        self.assertEqual(R(r, "indemnite_centimes"), 11410)

    def test_f4_bulletins_mois_non_couvert(self):
        # Total 10 000 EUR jusqu'en janvier ; fin le 26/02 ; salaire de fevrier 700 EUR ; ICP 300 EUR ajoutee.
        v = {"date_fin": date(2026, 2, 26), "salaires_mois_centimes": {"2026-02": 70000}, "iccp_centimes": 0,
             "regularisation_centimes": 0, "indemnite_preavis_centimes": 30000}
        r = m.indemnite_rupture_bulletins("normal", "employeur", date(2025, 1, 5), date(2026, 2, 1), [v],
                                          total_bulletins_centimes=1000000, total_jusqua="2026-01")
        self.assertEqual(R(r, "assiette_centimes"), 1100000)


class F5F6F7PreavisDispenseEtDixieme(unittest.TestCase):

    def test_f5_proportion_art111(self):
        # 728 EUR ; prevu du mois 10 560 min ; dispense 2 400 min : 728 x 2 400 / 10 560 = 165,4545... -> 165,45 EUR.
        mo = {"salaire_mensualise_centimes": 72800, "prevu_mois": 10560, "mixte": True, "prevu_dispense": 2400,
              "minutes_dispense": 2400}
        self.assertEqual(R(m.indemnite_preavis_dispense("complete", [mo], 420), "indemnite_centimes"), 16545)

    def test_f6_lecture_a(self):
        # (9 000 + 960) min = 166 h x 5 EUR = 830 EUR dus - 600 EUR verses = 230 EUR.
        aucune = {c: {"minutes": 0, "incluses": False}
                  for c in ("feries_chomes_payes", "absences_remunerees", "heures_complementaires")}
        r = m.regularisation_finale_preavis_dispense([], 60000, 500, 9000, 960, 10000, aucune)
        self.assertEqual(R(r, "versement_centimes"), 23000)

    def test_f7_iccp_precedente_dans_la_base(self):
        # Periode 1 : 6 jours ; maintien 6 / 6 x 40 h x 4,61 = 184,40 EUR > dixieme 160 EUR : 184,40 EUR.
        # Periode 2 : base 1 800 + 184,40 = 1 984,40 EUR ; dixieme 198,44 EUR > 184,40 : 198,44 EUR. Total 382,84 EUR.
        p = [{"jours_acquis": 6, "jours_payes": 0, "salaires_bruts_periode_centimes": 160000},
             {"jours_acquis": 6, "jours_payes": 0, "salaires_bruts_periode_centimes": 180000}]
        r = m.iccp("complete", "normal", p, 2400, 461)
        self.assertEqual(R(r, "detail_centimes"), [18440, 19844])
        self.assertEqual(R(r, "iccp_centimes"), 38284)

    def test_f7_casf_l423_6_plancher(self):
        # 12 jours ; maintien 368,80 EUR ; dixieme CCN (1 600 + 0) / 10 = 160 EUR ; CASF (1 600 + 500) / 10 = 210 EUR :
        # le plancher legal est sous le resultat de la CCN : 368,80 EUR.
        r = m.indemnite_cp(12, 2400, 461, 160000, icp_versee_pendant_periode_centimes=0,
                           icp_annee_precedente_centimes=50000)
        self.assertEqual(R(r, "indemnite_centimes"), 36880)
        # Dixieme CCN 400 EUR, CASF 500 EUR > 400 : refus A-28.
        r = m.indemnite_cp(12, 2400, 461, 400000, icp_versee_pendant_periode_centimes=0,
                           icp_annee_precedente_centimes=100000)
        self.assertEqual(r["code"], "A-28")


class F9F12CDD(unittest.TestCase):

    def test_f9_plus_haut(self):
        p = [{"salaires_bruts_periode_centimes": 160000, "jours_acquis": 6, "jours_payes": 0}]
        self.assertEqual(R(m.iccp_cdd("terme", p, 16000, 160000, 2400, 461), "iccp_centimes"), 18440)
        # Dixieme plus haut : base 3 000 + 300 = 3 300 EUR, dixieme 330 EUR > maintien 184,40 EUR.
        p = [{"salaires_bruts_periode_centimes": 300000, "jours_acquis": 6, "jours_payes": 0}]
        self.assertEqual(R(m.iccp_cdd("terme", p, 30000, 300000, 2400, 461), "iccp_centimes"), 33000)

    def test_f10_ifc_sans_iccp(self):
        self.assertEqual(R(m.indemnite_fin_cdd(300000, "terme", iccp_centimes=33000), "indemnite_centimes"), 30000)

    def test_f11_f12(self):
        self.assertEqual(R(m.salaire_mois_cdd_moins_d_un_mois(72800, 20000, 420, 600), "valeur_centimes"), 52800)
        self.assertFalse(R(m.qualifier_semaine_sans_accueil_cdd("46"), "deductible"))


def jours_lv(du, au):
    """Jours du lundi au vendredi entre du et au (faits du calendrier)."""
    out, d = [], du
    while d <= au:
        if d.weekday() < 5:
            out.append(d)
        d = date.fromordinal(d.toordinal() + 1)
    return out


class C1C5EnfantMalade(unittest.TestCase):
    """CCN 105 : 5 jours de courtes absences ; absence de 14 jours calendaires ; periode de 12 mois."""
    DEB = date(2025, 9, 1)

    def run105(self, certs, jours, **kw):
        return m.absences_enfant_malade_art105(self.DEB, [{"du": a, "au": b} for a, b in certs], jours, **kw)

    def test_c1_huit_jours_courte(self):
        # Certificat du 14 au 21/09 (8 jours) : courte ; 6 jours d'accueil : 5 retenus, le 6e paye.
        js = jours_lv(date(2026, 9, 14), date(2026, 9, 21))
        r = self.run105([(date(2026, 9, 14), date(2026, 9, 21))], js)
        self.assertEqual(R(r, "absences")[0]["classe"], "courte")
        self.assertEqual(R(r, "jours_retenus"), 5)
        self.assertEqual(R(r, "jours")["2026-09-21"], "paye")

    def test_c2_quatorze_jours_peu_d_accueil(self):
        # Certificat de 14 jours, 4 jours d'accueil : absence longue, 4 retenus.
        js = [date(2026, 9, 7), date(2026, 9, 8), date(2026, 9, 14), date(2026, 9, 15)]
        r = self.run105([(date(2026, 9, 7), date(2026, 9, 20))], js)
        self.assertEqual(R(r, "absences")[0]["classe"], "longue")
        self.assertEqual(R(r, "jours_retenus"), 4)

    def test_c2_au_dela_de_14_jours_paye(self):
        js = jours_lv(date(2026, 9, 7), date(2026, 9, 25))
        r = self.run105([(date(2026, 9, 7), date(2026, 9, 26))], js)
        self.assertEqual(R(r, "jours_retenus"), 10)
        self.assertEqual(R(r, "jours")["2026-09-21"], "paye")

    def test_c3_dates_obligatoires(self):
        r = m.absences_enfant_malade_art105(self.DEB, [{"du": None, "au": None}], [date(2026, 9, 15)])
        self.assertEqual(r["code"], "C3-DATES-CERTIFICAT")
        r = self.run105([], [date(2026, 9, 15)])
        self.assertEqual(r["code"], "C3-DATES-CERTIFICAT")

    def test_c4_chaque_jour_dans_sa_periode(self):
        # Debut 17/09/2025 : periode 1 jusqu'au 16/09/2026. 3 jours deja retenus (courtes). Certificat du 14 au
        # 18/09/2026 : 14, 15, 16/09 en periode 1 (2 retenus, 1 paye) ; 17, 18/09 en periode 2 (retenus).
        deb = date(2025, 9, 17)
        r = m.absences_enfant_malade_art105(deb, [{"du": date(2026, 9, 14), "au": date(2026, 9, 18)}],
                                            jours_lv(date(2026, 9, 14), date(2026, 9, 18)),
                                            deja_retenus={"jours": 3, "longue": False}, date_debut_suivi=date(2026, 1, 5))
        self.assertEqual(R(r, "jours"), {"2026-09-14": "retenu", "2026-09-15": "retenu", "2026-09-16": "paye",
                                         "2026-09-17": "retenu", "2026-09-18": "retenu"})

    def test_c5_origine(self):
        r = self.run105([(date(2026, 9, 8), date(2026, 9, 9))], [date(2026, 9, 8)],
                        deja_retenus={"jours": 2}, date_debut_suivi=date(2026, 9, 1))
        self.assertEqual(r["code"], "C5-ORIGINE-MANQUANTE")
        # Absence longue deja faite dans la periode : une seconde absence longue : refus A-18 (hors tableau).
        js = jours_lv(date(2026, 9, 7), date(2026, 9, 22))
        r = self.run105([(date(2026, 9, 7), date(2026, 9, 22))], js, deja_retenus={"jours": 10, "longue": True},
                        date_debut_suivi=date(2026, 9, 1))
        self.assertEqual(r["code"], "A-18")


class C6C9Evenements(unittest.TestCase):

    def test_c6_bascule_au_1er_mai_2024(self):
        # Avant le 01/05/2024 : CCN 2022 (handicap : 2 jours), loi 2023 (5 jours) : 5. Plus de refus EVT-VERSION.
        r = m.conge_evenement_familial("handicap_enfant", date(2023, 11, 15), pathologie_ou_cancer=True)
        self.assertEqual(R(r, "jours_ouvrables_remuneres"), 5)

    def test_c8_repos_hebdomadaire(self):
        # Repos le samedi (5) : jeudi 17, vendredi 18, dimanche 20, lundi 21/09 : 4 jours de mariage.
        r = m.jours_conge_evenement("mariage_pacs", date(2026, 9, 17), date(2026, 9, 17), date(2026, 9, 21),
                                    jour_repos_hebdomadaire=5, planning_contient_dimanche=True)
        self.assertEqual(R(r, "jours")["2026-09-19"], "non_ouvrable")
        self.assertEqual(R(r, "jours")["2026-09-21"], "remunere")
        r = m.jours_conge_evenement("mariage_pacs", date(2026, 9, 17), date(2026, 9, 17), date(2026, 9, 21),
                                    planning_contient_dimanche=True)
        self.assertEqual(r["code"], "C8-REPOS-HEBDO-MANQUANT")

    def test_c9_deuil(self):
        self.assertEqual(R(m.conge_deuil(date(2026, 9, 14), 15000), "deduction_ij_centimes"), 15000)
        self.assertEqual(m.conge_deuil(date(2026, 9, 14))["code"], "C9-IJ-MANQUANTES")


class C15C17DecompteCP(unittest.TestCase):

    def test_c15_arret_pendant_cp(self):
        # Du 14 au 19/09 (6 jours ouvrables), arret les 16 et 17 : 4 jours decomptes.
        r = m.decompte_jours_cp(date(2026, 9, 14), date(2026, 9, 21), [0, 1, 2, 3, 4],
                                jours_arret_maladie=[date(2026, 9, 16), date(2026, 9, 17)])
        self.assertEqual(R(r, "jours_decomptes"), 4)
        self.assertEqual(R(m.absence_retenue_du_jour(["cp", "am_malade"]), "type"), "am_malade")

    def test_c16_fin_avant_reprise(self):
        r = m.decompte_jours_cp(date(2026, 9, 14), date(2026, 9, 28), [0, 1, 2, 3, 4], date_fin_contrat=date(2026, 9, 16))
        self.assertEqual(R(r, "jours_decomptes"), 3)

    def test_c17_double_saisie(self):
        self.assertEqual(m.absence_retenue_du_jour(["cp", "sans_solde"])["code"], "C17-SAISIE-CONTRADICTOIRE")


class C10C13Conges(unittest.TestCase):
    """Cass. soc. 10/01/1980 (mois complets, semaines / 4, jours / 24) ; CCN 48.1.1.2 (prorata, entier superieur)."""

    def acq(self, *a, **kw):
        return R(m.acquisition_cp_periode(*a, **kw), "jours_acquis")

    def test_c10_periode_complete(self):
        self.assertEqual(self.acq("complete", date(2025, 6, 1), date(2026, 5, 31)), 30)

    def test_c10_embauche_en_cours_de_mois(self):
        # Du 03/09/2025 au 31/05/2026 : 8 mois, 3 semaines (8-14, 15-21, 22-28/09), 6 jours (3-6, 29-30/09) :
        # 2,5 x (8 + 3/4 + 6/24) = 22,5 -> 23.
        r = m.acquisition_cp_periode("complete", date(2025, 9, 3), date(2026, 5, 31))
        self.assertEqual(R(r, "decompte")["mois"], 8)
        self.assertEqual((R(r, "decompte")["semaines"], R(r, "decompte")["jours"]), (3, 6))
        self.assertEqual(R(r, "jours_acquis"), 23)
        # Du 17/09/2025 : 8 mois, 1 semaine, 6 jours : 2,5 x 8,5 = 21,25 -> 22.
        self.assertEqual(self.acq("complete", date(2025, 9, 17), date(2026, 5, 31)), 22)

    def test_c10_absence(self):
        # 3 jours sans solde en fevrier 2026 (cas de l'arret de 1980) : 11 mois, 2 semaines, 9 jours :
        # 2,5 x (11 + 1/2 + 9/24) = 29,6875 -> 30.
        na = [date(2026, 2, 9), date(2026, 2, 10), date(2026, 2, 11)]
        self.assertEqual(self.acq("complete", date(2025, 6, 1), date(2026, 5, 31), jours_non_assimiles=na), 30)
        # Deux semaines sans solde (9 au 20/02) : 11 mois, 1 semaine (23/02-01/03 hors fevrier : non), ...
        na2 = [date(2026, 2, 9) + __import__("datetime").timedelta(days=i) for i in range(12)]
        r = m.acquisition_cp_periode("complete", date(2025, 6, 1), date(2026, 5, 31), jours_non_assimiles=na2)
        self.assertEqual(R(r, "decompte")["mois"], 11)
        # Verification 2 (B-1) : service-public F18260, decompte le plus favorable en cas d'absence : hebdomadaire,
        # 50 semaines entieres / 4 x 2,5 = 31,25, plafond 30 (le decompte de 1980 donnait 29).
        self.assertEqual(R(r, "decompte")["decomptes_f18260"]["hebdomadaire"], "125/4")
        self.assertEqual(R(r, "jours_acquis"), 30)

    def test_c11_semaines_sans_accueil(self):
        lundis = [date(2025, 8, 4), date(2025, 8, 11), date(2025, 8, 18), date(2025, 8, 25), date(2025, 12, 22),
                  date(2025, 12, 29)]
        r = m.acquisition_cp_periode("incomplete", date(2025, 6, 1), date(2026, 5, 31), semaines_sans_accueil=lundis)
        self.assertEqual(r["code"], "C11-SEMAINES-CP-AM")
        # Toutes ces semaines sont des CP de l'AM (assimilees, L3141-5 1°) : 30 jours, si les droits anterieurs les
        # couvrent (verification 2, B-2 : CCN 102.1.2.2 et 102.2). Droits anterieurs inconnus : refus.
        r = m.acquisition_cp_periode("incomplete", date(2025, 6, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                     semaines_cp_am=lundis)
        self.assertEqual(r["code"], "C11-DROITS-ANTERIEURS")
        self.assertEqual(self.acq("incomplete", date(2025, 6, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                  semaines_cp_am=lundis, droits_anterieurs_jours=30), 30)
        # Premiere annee (aucun droit anterieur) : les semaines de conges ne sont pas des conges payes.
        self.assertEqual(self.acq("incomplete", date(2025, 6, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                  semaines_cp_am=lundis, droits_anterieurs_jours=0),
                         self.acq("incomplete", date(2025, 6, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                  semaines_cp_am=[]))
        # Aucune : aout, decembre et janvier (semaine du 29/12 au 04/01) ne sont pas des mois complets : 9 mois ;
        # semaines : 1-21/12 (3), 5-25/01 (3) ; jours : 1er et 2 aout, 26-31/01 (6) : 2,5 x (9 + 6/4 + 8/24)
        # = 27,08... -> 28.
        r = m.acquisition_cp_periode("incomplete", date(2025, 6, 1), date(2026, 5, 31), semaines_sans_accueil=lundis,
                                     semaines_cp_am=[])
        self.assertEqual((R(r, "decompte")["mois"], R(r, "decompte")["semaines"], R(r, "decompte")["jours"]), (9, 6, 8))
        # Verification 2 (B-1) : decompte hebdomadaire plus favorable : 46 semaines entieres / 4 x 2,5 = 28,75 -> 29.
        self.assertEqual(R(r, "jours_acquis"), 29)

    def test_c12_maintien_46_semaines(self):
        # 23 jours, 40 h, 4,20 EUR : 23 / 6 x 40 x 4,20 = 644 EUR (plus de refus A-26 en 46 semaines).
        r = m.indemnite_cp(23, 2400, 420, 500000, type_annee="incomplete")
        self.assertEqual(R(r, "indemnite_centimes"), 64400)
        # 52 semaines : meme formule (verification 2, B-7 ; Cass. soc. 09/05/2019, n° 17-26.232).
        self.assertEqual(R(m.indemnite_cp(23, 2400, 420, 500000, type_annee="complete"), "maintien_centimes"), 64400)


class H1H6Heures(unittest.TestCase):
    """CCN 96.4 « heures de travail effectuees » ; Cass. soc. 10/09/2025, n° 23-14.455 (H1)."""

    def test_h1_conges_payes_comptes(self):
        # Contrat 40 h ; 2 jours de CP (16 h) ; 30 h faites : 46 h comptees : 5 HC x 4,20 = 21 EUR ; 1 HM x 4,62.
        r = m.heures_en_plus_semaine_t103(2400, 1800, 420, 10, minutes_conges_payes=960)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 2100)
        self.assertEqual(R(r, "montant_majorees_centimes"), 462)

    def test_h2_h3_h6_jours_non_effectues(self):
        # 44 h faites, le reste de la semaine non effectue (absence payee, ferie, retenue) : 4 HC.
        r = m.heures_en_plus_semaine_t103(2400, 2640, 420, 10)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 1680)
        # 1er mai chome compte (decision D1) : 36 h faites + 8 h = 44 h : 4 HC.
        r = m.heures_en_plus_semaine_t103(2400, 2160, 420, 10, minutes_1er_mai_chome=480)
        self.assertEqual(R(r, "montant_complementaires_centimes"), 1680)

    def test_h4_semaine_coupee(self):
        # Embauche un mercredi : base de la semaine 24 h ; 33 h faites : 9 HC x 4,20 = 37,80 EUR.
        self.assertEqual(R(m.heures_en_plus_semaine_t103(1440, 1980, 420, 10), "montant_complementaires_centimes"), 3780)

    def test_a13_garde(self):
        self.assertEqual(m.heures_en_plus_semaine_t103(2760, 2800, 420, 10)["code"], "A-13")


class R1R6Regions(unittest.TestCase):

    def test_r1_vendredi_saint_ordinaire(self):
        self.assertNotIn(date(2026, 4, 3), m.jours_feries_region(2026, "alsace_moselle"))

    def test_r4_27_avril_mayotte(self):
        self.assertIn(date(2026, 4, 27), m.jours_feries_region(2026, "mayotte"))
        self.assertNotIn(date(2026, 4, 27), m.jours_feries_region(2026, "metropole"))


class D3Minimum(unittest.TestCase):

    def test_centime_superieur(self):
        # 0,281 x 10,85 EUR (mai 2022) = 3,04885 EUR : 3,05 EUR ; 0,281 x 10,57 = 2,97017 : 2,98 EUR.
        self.assertEqual(R(m.minimum_horaire_brut(date(2022, 5, 1)), "minimum_centimes"), 305)
        self.assertEqual(R(m.minimum_horaire_brut(date(2022, 1, 1)), "minimum_centimes"), 298)


if __name__ == "__main__":
    unittest.main()
