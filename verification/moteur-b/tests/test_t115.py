"""T-115 (R3) : brut depuis le net, F1 (brut mensuel, convertisseur Urssaf) et F2 (brut horaire inverse).
Specification : regles/t115-net-brut.md (depot calculateur-arvela), sections 2, 3, 5, 6, 7.
Tous les attendus sont recopies du rapport (tableaux du § 3.3 et du § 6.1, § 5.2, § 5.5), jamais calcules ici."""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import moteur_b as m  # noqa: E402

# § 3.3 : le convertisseur repond pour la periode « 2026-10 ».
OCT26 = date(2026, 10, 1)


def R(s, k):
    assert s["statut"] in ("ok", "provisoire"), s
    return s["resultat"][k]


class Base(unittest.TestCase):
    def refus(self, s, code):
        self.assertEqual(s["statut"], "non_gere", s)
        self.assertEqual(s["code"], code, s)


class F1Convertisseur(Base):
    """§ 3.3 : 17 sorties officielles net -> brut, toutes egales a F1 (§ 5.2)."""

    SORTIES = [  # (net, brut officiel), en centimes, recopies du tableau du § 3.3
        (300, 384), (328, 420), (340, 435), (391, 501), (400, 512), (745, 954), (13410, 17166), (13836, 17711),
        (37639, 48181), (39113, 50068), (76050, 97351), (85844, 109888), (100000, 128009), (145275, 185964),
        (182914, 234146), (184388, 236033),
    ]

    def test_metropole_16_sorties(self):
        for net, brut in self.SORTIES:
            with self.subTest(net=net):
                s = m.brut_depuis_net(net, OCT26)
                self.assertEqual(R(s, "brut_estime_centimes"), brut)
                self.assertEqual(R(s, "methode"), "F1")
                self.assertIn("T115-F1", s["regles"])

    def test_alsace_moselle_17e_sortie(self):
        # § 3.3, derniere ligne : Alsace-Moselle 3,28 -> 4,27 (zenassmat/releves-bruts.md, R5).
        self.assertEqual(R(m.brut_depuis_net(328, OCT26, "alsace_moselle"), "brut_estime_centimes"), 427)

    def test_part_nette(self):
        # § 2.1 : 21,88025 % ; part nette 78,11975 % ; Alsace-Moselle 23,18025 %, 76,81975 % (§ 5.2 : 0,7811975 / 0,7681975).
        s = m.brut_depuis_net(100, OCT26)
        self.assertEqual(R(s, "taux_salarial_pour_cent"), "21.88025")
        self.assertEqual(R(s, "part_nette"), "0.7811975")
        s = m.brut_depuis_net(100, OCT26, "alsace_moselle")
        self.assertEqual(R(s, "taux_salarial_pour_cent"), "23.18025")
        self.assertEqual(R(s, "part_nette"), "0.7681975")

    def test_colonne_f1_du_6_1(self):
        # § 6.1, colonne F1 (et § 5.2 fin) : F1 ne redonne pas toujours le brut publie.
        cas = [(date(2026, 1, 1), "metropole", 286, 366), (date(2026, 1, 1), "alsace_moselle", 281, 366),
               (date(2026, 6, 1), "alsace_moselle", 335, 436), (date(2026, 6, 1), "metropole", 341, 437),
               (date(2026, 1, 1), "metropole", 296, 379), (date(2026, 1, 1), "alsace_moselle", 291, 379),
               (date(2024, 2, 1), "metropole", 269, 344), (date(2024, 2, 1), "metropole", 281, 360),
               (date(2024, 2, 1), "alsace_moselle", 265, 345), (date(2024, 2, 1), "alsace_moselle", 276, 359),
               (date(2025, 1, 1), "metropole", 274, 351)]
        for d, r, net, brut in cas:
            with self.subTest(d=d, r=r, net=net):
                self.assertEqual(R(m.brut_depuis_net(net, d, r), "brut_estime_centimes"), brut)

    def test_avant_2024_estimation_inchangee(self):
        # § 5.5 : avec l'ancienne part 78,10 %, 1 000 EUR net -> 1 280,41 EUR ; F1 : 1 280,09 (§ 6.2, cas 1).
        s = m.brut_depuis_net(100000, date(2023, 12, 1))
        self.assertEqual(R(s, "brut_estime_centimes"), 128041)
        self.assertEqual(R(s, "part_net_pour_dix_mille"), 7810)
        self.assertEqual(s["regles"], ["T077-R1"])
        self.assertEqual(R(m.brut_depuis_net(100000, date(2024, 1, 1)), "brut_estime_centimes"), 128009)

    def test_mayotte_estimation_inchangee(self):
        # A4 : Mayotte garde l'estimation T-077 (part 8 820) ; 4,20 / 3,70 publie (§ 6.1, colonne F1 : 4,20).
        s = m.brut_depuis_net(370, date(2026, 6, 1), "mayotte")
        self.assertEqual(R(s, "brut_estime_centimes"), 420)
        self.assertEqual(R(s, "part_net_pour_dix_mille"), 8820)


class CouplesPublies(Base):
    """§ 6.1 : couples brut / net publies. Brut -> net ligne par ligne (§ 3.3 fin, § 5.2) et net -> brut F2."""

    COUPLES = [  # (date, region, brut, net), recopies du § 6.1 (et § 5.2 pour la liste des bruts uniques)
        (date(2026, 6, 1), "metropole", 420, 328),       # C-NET-01
        (date(2026, 6, 1), "metropole", 437, 341),       # C-NET-01, majore 4 %
        (date(2026, 6, 1), "alsace_moselle", 420, 323),  # C-NET-01, Alsace-Moselle
        (date(2026, 6, 1), "alsace_moselle", 437, 335),
        (date(2026, 1, 1), "metropole", 364, 286),       # C-NET-02
        (date(2026, 1, 1), "alsace_moselle", 364, 281),
        (date(2026, 1, 1), "metropole", 379, 296),       # C-NET-02, majore
        (date(2026, 1, 1), "alsace_moselle", 379, 291),
        (date(2026, 6, 12), "metropole", 420, 328),      # C-NET-03, DREETS Pays de la Loire
        (date(2026, 6, 12), "metropole", 437, 341),
        (date(2024, 2, 1), "metropole", 345, 269),       # C-NET-05, DREETS ARA
        (date(2024, 2, 1), "alsace_moselle", 345, 265),
        (date(2024, 2, 1), "metropole", 359, 281),
        (date(2024, 2, 1), "alsace_moselle", 359, 276),
        (date(2025, 1, 1), "metropole", 350, 274),       # Urssaf, du 01/01 au 31/03/2025
    ]

    def test_brut_vers_net_ligne_par_ligne(self):
        for d, r, brut, net in self.COUPLES:
            with self.subTest(d=d, r=r, brut=brut):
                self.assertEqual(R(m.net_ligne_par_ligne(brut, d, r), "net_centimes"), net)

    def test_net_vers_brut_f2(self):
        for d, r, brut, net in self.COUPLES:
            with self.subTest(d=d, r=r, net=net):
                s = m.brut_horaire_depuis_net(net, d, r)
                self.assertEqual(R(s, "brut_horaire_centimes"), brut)
                self.assertEqual(R(s, "methode"), "F2")

    def test_detail_du_couple_du_repere(self):
        # § 6.1 (controle du juriste, 4,20 -> 3,28) : 0,29 ; 0,02 ; 0,13 ; 0,04 ; 0,04 ; 0,28 ; 0,12 ; total 0,92.
        c = R(m.net_ligne_par_ligne(420, date(2026, 6, 1)), "cotisations")
        self.assertEqual(list(c.values()), [29, 2, 13, 4, 4, 28, 12])

    def test_csg_crds_une_seule_ligne(self):
        # § 5.2 : CSG imposable et CRDS en UNE ligne : 3,64 -> 2,86 (arrondies a part : 2,85, faux).
        self.assertEqual(R(m.net_ligne_par_ligne(364, date(2026, 1, 1)), "net_centimes"), 286)

    def test_c_net_04_deux_antecedents(self):
        # § 6.1 et § 5.2 : 5 EUR brut -> 3,91 EUR net ; antecedents 4,99 et 5,00, la proximite choisit 5,00.
        # Taux non dates (fiches de janvier 2023) : controle avec les taux 2026 du rapport.
        s = m.brut_horaire_depuis_net(391, date(2026, 1, 1))
        self.assertEqual(R(s, "antecedents"), [499, 500])
        self.assertEqual(R(s, "brut_horaire_centimes"), 500)
        self.assertEqual(R(m.net_ligne_par_ligne(500, date(2026, 1, 1)), "net_centimes"), 391)
        # § 3.4 et § 6.2, cas 3 : F1 rend 5,01 pour 3,91.
        self.assertEqual(R(s, "brut_f1_centimes"), 501)

    def test_moselle_5_00(self):
        # § 3.3 (convertisseur, 5,00 en Moselle) et § 5.2 : Moselle 5,00 / 3,84, F2 rend 5,00.
        self.assertEqual(R(m.net_ligne_par_ligne(500, OCT26, "alsace_moselle"), "net_centimes"), 384)
        self.assertEqual(R(m.brut_horaire_depuis_net(384, OCT26, "alsace_moselle"), "brut_horaire_centimes"), 500)


class Perimetre(Base):
    """F2 : refus avant le 01/01/2024 (A5) et a Mayotte (A4), sans estimation."""

    def test_mayotte_refuse(self):
        # § 6.1 : Mayotte 4,20 / 3,70, F2 4,19 « voir § 7 » ; A4 : aucun brut sur au centime.
        self.refus(m.brut_horaire_depuis_net(370, date(2026, 6, 1), "mayotte"), "T115-MAYOTTE")
        self.refus(m.net_ligne_par_ligne(420, date(2026, 6, 1), "mayotte"), "T115-MAYOTTE")

    def test_avant_2024_refuse(self):
        self.refus(m.brut_horaire_depuis_net(391, date(2023, 12, 31)), "T115-AVANT-2024")
        self.refus(m.brut_horaire_depuis_net(391, date(2023, 1, 1), "alsace_moselle"), "T115-AVANT-2024")
        self.refus(m.net_ligne_par_ligne(500, date(2023, 1, 1)), "T115-AVANT-2024")
        self.assertEqual(m.brut_horaire_depuis_net(391, date(2024, 1, 1))["statut"], "ok")

    def test_saisie(self):
        self.assertEqual(m.brut_horaire_depuis_net(391.0, OCT26)["statut"], "erreur_saisie")
        self.assertEqual(m.brut_horaire_depuis_net(391, OCT26, "reunion")["statut"], "erreur_saisie")


if __name__ == "__main__":
    unittest.main()
