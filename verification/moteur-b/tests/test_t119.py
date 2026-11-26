"""T-119 : conges de depart (regles/t119-conges-depart.md, depot calculateur-arvela, § 3 et § 5).

Tous les attendus sont calcules a la main depuis la regle et depuis les regles d'acquisition deja en place dans B
(T-103 C10 : decompte de 1980, 2,5 x (mois + semaines / 4 + jours / 24) ; C10 bis et T-113 : le plus favorable
entre ce decompte, 2,5 x semaines entieres / 4 et 2,5 x jours d'accueil / (4 x jours par semaine), seulement quand
la periode contient une absence ; feries chomes comptes comme jours prevus dans le decompte journalier de B).
Le calcul est ecrit en commentaire. Suivi au 1er novembre 2026 : y = 2026 (§ 1)."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

T = date(2026, 11, 1)
P5 = {0: 480, 1: 480, 2: 480, 3: 480, 4: 480}  # lundi a vendredi
P4 = {0: 480, 1: 480, 3: 480, 4: 480}  # lundi, mardi, jeudi, vendredi
P3 = {0: 480, 2: 480, 4: 480}  # lundi, mercredi, vendredi
S3M = date(2026, 8, 1)  # 3 mois avant le suivi
S14M = date(2025, 9, 1)  # 14 mois avant
S3A = date(2023, 11, 1)  # 3 ans avant


def k(debut, planning, **kw):
    return dict({"debut": debut, "type_annee": "complete", "planning": planning}, **kw)


def R(s):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"]


class Base(unittest.TestCase):
    def soldes(self, s, D, restants, centiemes, exact=None):
        r = R(s)
        self.assertEqual(r["droits_prec"], D)
        self.assertEqual(r["cp_restants"], restants)
        self.assertEqual(r["cp_en_cours_centiemes"], centiemes)
        if exact is not None:
            self.assertEqual(r["cp_en_cours"], exact)
        return r


class TroisMois(Base):
    """S = 01/08/2026 >= 01/06/2026 : D = 0 (§ 3.1). Fenetre en cours [01/08/2026, 31/10/2026]."""

    def test_5j_sans_absence(self):
        # Sans absence : decompte mensuel seul. Aout, septembre, octobre complets : 2,5 x 3 = 7,5.
        self.soldes(m.conges_de_depart(k(S3M, P5), T), 0, 0, 750, "15/2")

    def test_4j_sans_absence_pris_superieur(self):
        # P = 3 > D = 0 : cp_restants = max(0, 0 - 3) = 0 (§ 3.2). En cours : 7,5.
        self.soldes(m.conges_de_depart(k(S3M, P4), T, pris_depuis_juin=3), 0, 0, 750)

    def test_5j_absence_2(self):
        # § 3.4 : 2 jours sur les premiers jours prevus : lundi 03/08 et mardi 04/08.
        # Mensuel : sept. et oct. complets (2) ; semaines entieres d'aout hors absence : 10, 17, 24/08 (3) ;
        # jours lundi-samedi restants : 01/08, 05 au 08/08 (4), 31/08 -> 6. 2,5 x (2 + 3/4 + 6/24) = 7,5.
        # Hebdomadaire : semaines entieres dans la fenetre : 10, 17, 24, 31/08, 7, 14, 21, 28/09, 5, 12, 19/10 = 11 ;
        # 2,5 x 11 / 4 = 6,875. Journalier : lundis-vendredis : aout 21, sept. 22, oct. 22 = 65, moins 2 = 63 ;
        # 2,5 x 63 / 20 = 7,875. Le plus favorable : 7,875. § 3.4 « Plafond » : sans absence, 7,5 (mensuel) ;
        # le plus petit : 7,5 -> 750.
        r = self.soldes(m.conges_de_depart(k(S3M, P5), T, absence_cours=2), 0, 0, 750, "15/2")
        self.assertEqual(r["absences_cours"], ["2026-08-03", "2026-08-04"])

    def test_3j_absence_3(self):
        # § 3.4 : lundi 03/08, mercredi 05/08, vendredi 07/08.
        # Mensuel : 2 mois ; semaines 10, 17, 24/08 (3) ; jours : 01, 04, 06, 08/08 et 31/08 = 5 ;
        # 2,5 x (2 + 3/4 + 5/24) = 2,5 x 71/24 = 7,395... Hebdomadaire : 11 semaines -> 6,875.
        # Journalier : lundis, mercredis, vendredis : aout 13, sept. 13, oct. 13 = 39, moins 3 = 36 ;
        # 2,5 x 36 / 12 = 7,5. Le plus favorable : 7,5. Plafond : sans absence 7,5 ; le plus petit : 7,5 -> 750.
        r = self.soldes(m.conges_de_depart(k(S3M, P3), T, absence_cours=3), 0, 0, 750, "15/2")
        self.assertEqual(r["absences_cours"], ["2026-08-03", "2026-08-05", "2026-08-07"])

    def test_absence_prec_sans_periode_precedente(self):
        # § 2 : Aprec n'existe que si la fenetre y-1 existe.
        self.assertEqual(m.conges_de_depart(k(S3M, P5), T, absence_prec=1)["statut"], "erreur_saisie")


class QuatorzeMois(Base):
    """S = 01/09/2025. Periode y-1 : [01/09/2025, 31/05/2026]. En cours : [01/06/2026, 31/10/2026]."""

    def test_5j_sans_absence_pris_5(self):
        # D : 9 mois complets : 2,5 x 9 = 22,5 -> 23 (entier superieur), enfants 0. Restants : 23 - 5 = 18.
        # En cours : juin a octobre, 5 mois : 12,5 -> 1250.
        self.soldes(m.conges_de_depart(k(S14M, P5), T, pris_depuis_juin=5), 23, 18, 1250, "25/2")

    def test_4j_absence_prec_20_pris_5(self):
        # § 3.4 : 20 premiers jours prevus (lundi, mardi, jeudi, vendredi) a partir du 01/09/2025 : les 18 de
        # septembre (1, 2, 4, 5, 8, 9, 11, 12, 15, 16, 18, 19, 22, 23, 25, 26, 29, 30) puis jeudi 2 et vendredi 3/10.
        # Mensuel : novembre a mai complets (7) ; semaines entieres : 6, 13, 20/10 (3) ; jours lundi-samedi restants :
        # mercredis et samedis de sept. 3, 6, 10, 13, 17, 20, 24, 27 (8), 1er et 4/10 (2), 27 au 31/10 (5) = 15 ;
        # 2,5 x (7 + 3/4 + 15/24) = 20,9375. Hebdomadaire : 39 semaines (lundi 01/09/2025 au dimanche 31/05/2026)
        # moins 5 touchees (1, 8, 15, 22, 29/09) = 34 ; 2,5 x 34 / 4 = 21,25. Journalier : 39 x 4 = 156 jours prevus,
        # moins 20 = 136 ; 2,5 x 136 / 16 = 21,25. Le plus favorable : 21,25 -> 22. Plafond : sans absence 23 ;
        # le plus petit : D = 22. Restants : 22 - 5 = 17.
        # En cours sans absence : 12,5.
        r = self.soldes(m.conges_de_depart(k(S14M, P4), T, pris_depuis_juin=5, absence_prec=20), 22, 17, 1250)
        self.assertEqual(len(r["absences_prec"]), 20)
        self.assertEqual(r["absences_prec"][-1], "2025-10-03")

    def test_3j_absence_cours_4(self):
        # D sans absence : 23 ; P = 0 -> restants 23.
        # § 3.4 : 4 premiers jours prevus du 01/06/2026 : lundi 1, mercredi 3, vendredi 5, lundi 8/06.
        # Mensuel : juillet a octobre (4) ; semaines 15 et 22/06 (2) ; jours : 2, 4, 6/06 (3), 9 a 13/06 (5),
        # 29 et 30/06 (2) = 10 ; 2,5 x (4 + 2/4 + 10/24) = 295/24 = 12,29...
        # Hebdomadaire : 21 semaines (lundis 01/06 a 19/10) moins 2 = 19 ; 2,5 x 19 / 4 = 11,875.
        # Journalier : 21 x 3 + 3 (26, 28, 30/10) = 66, moins 4 = 62 ; 2,5 x 62 / 12 = 155/12 = 12,9166...
        # Le plus favorable : 155/12 = 12,9166... Plafond : sans absence 12,5 (5 mois) ; le plus petit : 12,5 -> 1250.
        r = self.soldes(m.conges_de_depart(k(S14M, P3), T, absence_cours=4), 23, 23, 1250, "25/2")
        self.assertEqual(r["absences_cours"], ["2026-06-01", "2026-06-03", "2026-06-05", "2026-06-08"])

    def test_5j_absence_prec_10_donne_plus(self):
        # L'absence ouvre le decompte le plus favorable, qui depasse le mensuel ; § 3.4 « Plafond » le ramene.
        # Aprec = 10 : 1 au 5/09 et 8 au 12/09/2025. Hebdomadaire : 39 - 2 = 37 semaines ; 2,5 x 37 / 4 = 23,125.
        # Journalier : 39 x 5 = 195 moins 10 = 185 ; 2,5 x 185 / 20 = 23,125. Mensuel : octobre a mai (8) ;
        # semaines 15 et 22/09 (2) ; jours 6, 13/09 et 29, 30/09 (4) ; 2,5 x (8 + 2/4 + 4/24) = 21,67.
        # 23,125 -> 24. Sans absence : 9 mois, 22,5 -> 23. Le plus petit : D = 23 (et non 24). Restants 23.
        self.soldes(m.conges_de_depart(k(S14M, P5), T, absence_prec=10), 23, 23, 1250)

    def test_suivi_au_1er_juin(self):
        # T = 01/06/2026 : y = 2026 ; D = 23 (9 mois) ; fenetre en cours vide : cp_en_cours = 0.
        self.soldes(m.conges_de_depart(k(S14M, P5), date(2026, 6, 1)), 23, 23, 0, "0")


class TroisAns(Base):
    """S = 01/11/2023. Periode y-1 complete : [01/06/2025, 31/05/2026]."""

    def test_4j_sans_absence(self):
        # D : 12 mois complets : 30 (plafond 30), enfants 0. Restants 30. En cours : 5 mois : 12,5.
        self.soldes(m.conges_de_depart(k(S3A, P4), T), 30, 30, 1250)

    def test_5j_deux_absences_pris_12(self):
        # Aprec = 5 : lundi 2 au vendredi 6/06/2025 (lundi de Pentecote 2025 : 9/06, apres).
        # Mensuel : juillet 2025 a mai 2026 (11) ; semaines 9, 16, 23/06 (3) ; jours 7/06 et 30/06 (2) ;
        # 2,5 x (11 + 3/4 + 2/24) = 29,58... Hebdomadaire : 52 semaines (lundis 02/06/2025 a 25/05/2026) moins 1 = 51 ;
        # 2,5 x 51 / 4 = 31,875. Journalier : 52 x 5 = 260 moins 5 = 255 ; 2,5 x 255 / 20 = 31,875.
        # 31,875 -> 32, plafond 30 : 30. Sans absence : 30. D = 30. Restants : 30 - 12 = 18.
        # Acours = 5 : lundi 1 au vendredi 5/06/2026. Mensuel : 4 mois ; semaines 8, 15, 22/06 (3) ; jours 6, 29,
        # 30/06 (3) ; 2,5 x (4 + 3/4 + 3/24) = 12,1875. Hebdomadaire : 21 - 1 = 20 -> 12,5. Journalier : 21 x 5 + 5
        # (26 au 30/10) = 110 moins 5 = 105 ; 2,5 x 105 / 20 = 105/8 = 13,125. § 3.4 « Plafond » : sans absence,
        # 5 mois = 12,5 ; le plus petit : 12,5 -> 1250 (exemple de la regle : 13,13 au lieu de 12,5).
        r = self.soldes(m.conges_de_depart(k(S3A, P5), T, pris_depuis_juin=12, absence_prec=5, absence_cours=5),
                        30, 18, 1250, "25/2")
        self.assertEqual(r["absences_prec"][0], "2025-06-02")
        self.assertEqual(r["absences_cours"][-1], "2026-06-05")

    def test_3j_pris_superieur(self):
        # D = 30 ; P = 40 : restants max(0, -10) = 0.
        self.soldes(m.conges_de_depart(k(S3A, P3), T, pris_depuis_juin=40), 30, 0, 1250)


class Placement(Base):
    """§ 3.4 : jour prevu = heures au planning, hors ferie, hors semaine sans accueil."""

    def test_ferie_saute(self):
        # S = lundi 10/11/2025 ; mardi 11/11 ferie : 2 jours d'absence = 10/11 et 12/11.
        r = R(m.conges_de_depart(k(date(2025, 11, 10), P5), T, absence_prec=2))
        self.assertEqual(r["absences_prec"], ["2025-11-10", "2025-11-12"])

    def test_semaine_sans_accueil_sautee(self):
        # Annee incomplete, semaine du 03/08/2026 sans accueil (pas un CP de l'AM) : 10 et 11/08.
        c = {"debut": S3M, "type_annee": "incomplete", "planning": P5, "semaines_sans_accueil": [date(2026, 8, 3)],
             "semaines_cp_am": []}
        r = R(m.conges_de_depart(c, T, absence_cours=2))
        self.assertEqual(r["absences_cours"], ["2026-08-10", "2026-08-11"])

    def test_trop_de_jours(self):
        # Fenetre de 3 mois a 3 jours : 39 jours prevus ; 40 jours d'absence : erreur de saisie.
        self.assertEqual(m.conges_de_depart(k(S3M, P3), T, absence_cours=40)["statut"], "erreur_saisie")


class Refus(Base):
    """§ 3.5 : impossible a calculer, rien n'est devine (refus de B)."""

    def refus(self, s, code):
        self.assertEqual(s["statut"], "non_gere", s)
        self.assertEqual(s["code"], code)

    def test_incomplete_sans_semaines(self):
        c = {"debut": S14M, "type_annee": "incomplete", "planning": P5}
        self.refus(m.conges_de_depart(c, T), "T119-SEMAINES-SANS-ACCUEIL")

    def test_incomplete_sans_cp_am(self):
        # Semaines sans accueil donnees, mais pas lesquelles sont des CP de l'AM : refus C11 de B propage.
        c = {"debut": S3A, "type_annee": "incomplete", "planning": P5, "semaines_sans_accueil": [date(2025, 8, 4)]}
        self.refus(m.conges_de_depart(c, T), "C11-SEMAINES-CP-AM")

    def test_avenant(self):
        self.refus(m.conges_de_depart(k(S14M, P5, avenants=[{"du": "2026-01-01"}]), T), "T119-NON-GERE")

    def test_planning_variable(self):
        self.refus(m.conges_de_depart(k(S14M, P5, planning_variable=True), T), "T119-NON-GERE")

    def test_erreurs(self):
        self.assertEqual(m.conges_de_depart(k(S14M, P5), S14M)["statut"], "erreur_saisie")  # T = S
        self.assertEqual(m.conges_de_depart(k(S14M, P5), T, pris_depuis_juin=1.5)["statut"], "erreur_saisie")
        self.assertEqual(m.conges_de_depart(k(S14M, P5), T, enfants_a_charge=1)["statut"], "erreur_saisie")


if __name__ == "__main__":
    unittest.main()
