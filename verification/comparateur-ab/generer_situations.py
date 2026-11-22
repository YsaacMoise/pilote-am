"""Genere les situations du comparateur T-008 (fichiers JSON reproductibles).

- situations/officiels.json : les 66 cas officiels non suspects testes par le
  moteur B (moteur/B/tests/test_cas_officiels.py). Cote B, les appels sont
  recopies du fichier de tests. Cote A, chaque cas est traduit en une situation
  concrete (contrat, calendrier) ou en appel d'une fonction publique de A.
  Les resultats attendus sont recopies de tests/cas-officiels-v0.md (jamais
  calcules ici).
- situations/grille.json : grille de situations fictives (annee complete et
  incomplete, 10 a 45 h, absences, conges, feries, indemnites, fins de contrat).

Aucun resultat de reference n'est calcule par ce script : il ne produit que des
entrees. Deterministe : relancer donne les memes fichiers.
"""

import json
import os
from datetime import date, timedelta

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, "situations")


def D(s):
    return {"date": s}


def semaine(jours, debut, fin):
    return {str(j): [[debut, fin]] for j in jours}


L5 = [1, 2, 3, 4, 5]
P5x8 = semaine(L5, "08:00", "16:00")
P5x9 = semaine(L5, "08:00", "17:00")
P4x8 = semaine([1, 2, 4, 5], "08:00", "16:00")
P5x6 = semaine(L5, "08:00", "14:00")
PMaJ9 = semaine([2, 3, 4, 5], "09:00", "17:00")  # mardi a vendredi, 32 h

# Semaines sans accueil du contrat de Mme Bertrand (C-MENS-02), annee 2021-2022,
# et 16 semaines pour 2022-2023 (necessaires au moteur A pour la fin de contrat).
BERTRAND_OFF = ["2021-10-25", "2021-11-01", "2021-12-20", "2021-12-27", "2022-02-21", "2022-02-28",
                "2022-04-25", "2022-05-02", "2022-07-04", "2022-07-11", "2022-07-18", "2022-07-25",
                "2022-08-01", "2022-08-08", "2022-08-15", "2022-08-22",
                "2022-10-24", "2022-10-31", "2022-12-19", "2022-12-26", "2023-02-13", "2023-02-20",
                "2023-04-17", "2023-04-24", "2023-07-03", "2023-07-10", "2023-07-17", "2023-07-24",
                "2023-07-31", "2023-08-07", "2023-08-14", "2023-08-21"]

BERTRAND = {"debut": "2021-09-01", "type_annee": "incomplete", "semaines": 36, "planning": P5x8, "taux": 500,
            "majoration_hm": 15, "majoration_hc": 10, "semaines_sans_accueil": BERTRAND_OFF, "cp_mode": "juin"}
DURAND = {"debut": "2021-09-01", "type_annee": "complete", "semaines": 52, "planning": P5x8, "taux": 500,
          "majoration_hm": 15, "majoration_hc": 10}


def complet(planning, taux, debut="2025-09-01", **kw):
    return dict({"debut": debut, "type_annee": "complete", "semaines": 52, "planning": planning, "taux": taux}, **kw)


def incomplet(planning, taux, semaines, debut="2025-09-01", **kw):
    return dict({"debut": debut, "type_annee": "incomplete", "semaines": semaines, "planning": planning,
                 "taux": taux}, **kw)


def conge(t, du, au):
    return {"type": t, "du": du, "au": au}


def jours_ouvres(du, au, jours=(0, 1, 2, 3, 4)):
    a, b = date.fromisoformat(du), date.fromisoformat(au)
    out = []
    while a <= b:
        if a.weekday() in jours:
            out.append(a.isoformat())
        a += timedelta(days=1)
    return out


# ============================================================ cas officiels

def off(cas, domaine, attendu, a_calculs, b_appels, contrat=None, evenements=None, note=None, propage=None,
        suffixe=""):
    s = {"id": f"OFF-{cas}{suffixe}", "origine": "officiel", "cas": cas, "domaine": domaine,
         "attendu_officiel": attendu, "contrat": contrat or {"debut": "2026-01-05", "type_annee": "complete",
                                                           "semaines": 52, "planning": P5x8, "taux": 500},
         "evenements": evenements or {}, "a_calculs": a_calculs, "b_appels": b_appels}
    if note:
        s["note"] = note
    if propage:
        s["propage_de"] = propage
    return s


def mens_b(sortie, sem, h, t, cle="salaire_mensualise_centimes", **kw):
    return {"sortie": sortie, "fonction": "mensualisation", "args": [sem, h, t], "kwargs": kw, "cle": cle}


def officiels():
    S = []
    R = lambda **m: m  # renommage
    # ---------------- Mensualisation
    S.append(off("C-MENS-02", "mensualisation", {"salaire_mensualise": 60000, "heures_mensualisees": 120},
                 [{"type": "mensualisation", "renommer": R(salaire_mensualise="salaire_mensualise",
                                                          heures_mensualisees="heures_mensualisees"),
                   "sorties": ["salaire_mensualise", "heures_mensualisees"]}],
                 [mens_b("salaire_mensualise", 36, 2400, 500),
                  mens_b("heures_mensualisees", 36, 2400, 500, cle="heures_mensualisees")],
                 contrat=dict(BERTRAND)))
    S.append(off("C-MENS-03", "mensualisation", {"semaines_programmees": 42},
                 [{"type": "absent", "sorties": ["semaines_programmees"],
                   "note": "A reçoit le nombre de semaines comme donnée saisie ; il n'a pas de fonction qui le calcule."}],
                 [{"sortie": "semaines_programmees", "fonction": "semaines_programmees", "args": [7, 5, 2],
                   "cle": "semaines_programmees"}]))
    for cas, typ, sem, pl, h, t, att in [("C-MENS-06", "complete", 52, P5x8, 2400, 450, 78000),
                                         ("C-MENS-07", "incomplete", 36, P5x8, 2400, 450, 54000),
                                         ("C-MENS-08", "complete", 52, P5x9, 2700, 400, 78000),
                                         ("C-MENS-09", "incomplete", 36, P4x8, 1920, 400, 38400),
                                         ("C-MENS-11", "complete", 52, P5x8, 2400, 297, 51480)]:
        S.append(off(cas, "mensualisation", {"salaire_mensualise": att},
                     [{"type": "mensualisation", "renommer": R(salaire_mensualise="salaire_mensualise"),
                       "sorties": ["salaire_mensualise"]}],
                     [mens_b("salaire_mensualise", sem, h, t)],
                     contrat={"debut": "2026-01-05", "type_annee": typ, "semaines": sem, "planning": pl, "taux": t}))
    S.append(off("C-MENS-10", "mensualisation", {"heures_mensualisees": 90},
                 [{"type": "mensualisation", "renommer": R(heures_mensualisees="heures_mensualisees"),
                   "sorties": ["heures_mensualisees"]}],
                 [{"sortie": "heures_mensualisees", "fonction": "heures_mensualisees", "args": [36, 1800],
                   "cle": "heures_mensualisees"}],
                 contrat={"debut": "2026-01-05", "type_annee": "incomplete", "semaines": 36, "planning": P5x6,
                          "taux": 400}))
    S.append(off("C-MENS-12", "mensualisation", {"salaire_mensualise": 36000},
                 [{"type": "mensualisation", "renommer": R(salaire_mensualise="salaire_mensualise"),
                   "sorties": ["salaire_mensualise"]}],
                 [mens_b("salaire_mensualise", 36, 2400, 300, nature_taux="net")],
                 contrat={"debut": "2026-01-05", "type_annee": "incomplete", "semaines": 36, "planning": P5x8,
                          "taux": 300}, note="Taux en net : A travaille en net (rateNet)."))

    # ---------------- Heures complementaires et majorees (semaine du 5 au 9 octobre 2026, sans ferie)
    def hc_case(cas, contrat, pres, b_args, att):
        ev = {"jours": [{"date": d, "pres": [p]} for d, p in pres]}
        return off(cas, "heures en plus", att,
                   [{"type": "mois", "mois": "2026-10",
                     "renommer": R(heures_compl_montant="montant_hc", heures_maj_montant="montant_hm",
                                   salaire_mois_hors_cp="salaire_du_mois"),
                     "sorties": ["heures_compl_montant", "heures_maj_montant", "salaire_mois_hors_cp"]}],
                   b_args, contrat=contrat, evenements=ev)

    c = dict(BERTRAND, semaines_sans_accueil=[], debut="2026-09-01")
    S.append(hc_case("C-HC-03", c, [("2026-10-05", ["08:00", "18:00"])],
                     [{"sortie": "montant_hc", "fonction": "heures_en_plus_semaine", "args": [2400, 2520, 500],
                       "kwargs": {"majoration_hm_pourcent": 15, "majoration_hc_pourcent": 10},
                       "cle": "montant_complementaires_centimes"},
                      {"sortie": "montant_hm", "fonction": "heures_en_plus_semaine", "args": [2400, 2520, 500],
                       "kwargs": {"majoration_hm_pourcent": 15, "majoration_hc_pourcent": 10},
                       "cle": "montant_majorees_centimes", "interne": True},
                      {"sortie": "salaire_du_mois", "fonction": "salaire_du_mois",
                       "args": [60000, [{"ref": "montant_hc"}, {"ref": "montant_hm"}]],
                       "cle": "salaire_brut_mois_centimes"}],
                     {"montant_hc": 1100, "salaire_du_mois": 61100}))
    S.append(hc_case("C-HC-04", c, [("2026-10-05", ["08:00", "19:00"]), ("2026-10-06", ["08:00", "20:00"])],
                     [{"sortie": "montant_hc", "fonction": "heures_en_plus_semaine", "args": [2400, 2820, 500],
                       "kwargs": {"majoration_hm_pourcent": 15, "majoration_hc_pourcent": 10},
                       "cle": "montant_complementaires_centimes"},
                      {"sortie": "montant_hm", "fonction": "heures_en_plus_semaine", "args": [2400, 2820, 500],
                       "kwargs": {"majoration_hm_pourcent": 15, "majoration_hc_pourcent": 10},
                       "cle": "montant_majorees_centimes"},
                      {"sortie": "salaire_du_mois", "fonction": "salaire_du_mois",
                       "args": [60000, [{"ref": "montant_hc"}, {"ref": "montant_hm"}]],
                       "cle": "salaire_brut_mois_centimes"}],
                     {"montant_hc": 2750, "montant_hm": 1150, "salaire_du_mois": 63900}))
    # T-033 (M6, d'après T-030) : taux des heures complémentaires du contrat 3,20 € pour 3 € (Urssaf, exemple), soit 20/3 %
    c5 = {"debut": "2026-09-01", "type_annee": "complete", "semaines": 52, "planning": PMaJ9, "taux": 300,
          "majoration_hm": 100 / 6, "majoration_hc": 20 / 3}
    S.append(hc_case("C-HC-05", c5, [(d, ["09:00", "21:30"]) for d in ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]],
                     [mens_b("salaire_du_mois", 52, 1920, 300, nature_taux="net")],
                     {"salaire_du_mois": 47510}))
    p6 = semaine([1, 2, 4, 5], "08:30", "18:30")
    c6 = {"debut": "2026-09-01", "type_annee": "incomplete", "semaines": 37, "planning": p6, "taux": 300,
          "majoration_hm": 100 / 6, "majoration_hc": 20 / 3}
    S.append(hc_case("C-HC-06", c6, [(d, ["08:30", "21:00"]) for d in ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]],
                     [mens_b("salaire_du_mois", 37, 2400, 300, nature_taux="net")],
                     {"salaire_du_mois": 40350}))

    # ---------------- Absences
    def abs_case(cas, contrat, mois, ev, b_appels, att, suffixe="", note=None):
        return off(cas, "absences", att,
                   [{"type": "mois", "mois": mois, "renommer": R(deduction="deduction", salaire_base_mois="salaire_du"),
                     "sorties": ["deduction", "salaire_base_mois"]}],
                   b_appels, contrat=contrat, evenements=ev, suffixe=suffixe, note=note)

    def ded_b(typ, mens, nt, pv, **kw):
        return [{"sortie": "deduction", "fonction": "deduction_absence", "args": [typ, mens, nt, pv], "kwargs": kw,
                 "cle": "deduction_centimes"},
                {"sortie": "salaire_du", "fonction": "deduction_absence", "args": [typ, mens, nt, pv], "kwargs": kw,
                 "cle": "salaire_du_centimes"}]

    S.append(abs_case("C-ABS-02", dict(BERTRAND), "2021-10",
                      {"absences_am": [conge("am_malade", "2021-10-13", "2021-10-15")]},
                      ded_b("incomplete", 60000, 3, 21, semaines_non_accueil_dans_mois=1),
                      {"deduction": 8571, "salaire_du": 51429}))
    c3 = {"debut": "2026-01-06", "type_annee": "complete", "semaines": 52, "planning": PMaJ9, "taux": 300}
    S.append(abs_case("C-ABS-03", c3, "2026-06", {"absences_am": [conge("sans_solde", "2026-06-02", "2026-06-12")]},
                      [mens_b("salaire_du", 52, 1920, 300, nature_taux="net")], {"salaire_du": 22024}))
    c45 = {"debut": "2026-01-05", "type_annee": "complete", "semaines": 52, "planning": P5x8, "taux": 450}
    S.append(abs_case("C-ABS-05", c45, "2026-11", {"absences_am": [conge("sans_solde", "2026-11-16", "2026-11-20")]},
                      ded_b("complete", 78000, 2400, 168 * 60), {"deduction": 18571, "salaire_du": 59429}))
    S.append(off("C-ABS-05", "absences", {"deductible": True},
                 [{"type": "jour_retenu", "date": "2027-02-08", "renommer": R(deductible="deductible")}],
                 [{"sortie": "deductible", "fonction": "qualifier_absence",
                   "args": ["conge_complementaire_non_remunere", "complete"], "cle": "deductible"}],
                 contrat=dict(c45, debut="2026-09-01"),
                 evenements={"absences_am": [conge("cp", "2027-02-08", "2027-02-13")]}, suffixe="-08-QUALIF",
                 note="C-ABS-05 à 08 : semaine « sans solde » faute de droits à CP (congés pris sans droits acquis)."))
    S.append(abs_case("C-ABS-06", c45, "2027-03", {"absences_am": [conge("sans_solde", "2027-03-08", "2027-03-11")]},
                      ded_b("complete", 78000, 32 * 60, 184 * 60), {"deduction": 13565, "salaire_du": 64435}))
    S.append(abs_case("C-ABS-07", c45, "2026-10", {"absences_am": [conge("sans_solde", "2026-10-12", "2026-10-16")]},
                      ded_b("complete", 78000, 2400, 176 * 60), {"deduction": 17727, "salaire_du": 60273}))
    S.append(abs_case("C-ABS-08", c45, "2027-02", {"absences_am": [conge("sans_solde", "2027-02-08", "2027-02-12")]},
                      ded_b("complete", 78000, 2400, 160 * 60), {"deduction": 19500, "salaire_du": 58500}))
    # T-042f : source tests/cas-officiels-v0.md l. 243-256 (S-BFC fiche 11-II p. 38-39), « rupture en cours de mois ».
    # La source ne dit rien du preavis. Decision de la direction du 18/11/2026 : cas ordinaire, retrait de l'enfant,
    # preavis d'un mois fait en entier et termine a la date de fin (lettre envoyee un mois avant : finPreavis de A).
    NOTE_FIN_ABS = ("préavis supposé fait en entier, décision de la direction du 18/11/2026 : l'exemple officiel ne "
                    "traite que la proratisation du dernier mois")
    c9 = {"debut": "2025-09-01", "fin": "2026-10-21", "type_annee": "complete", "semaines": 52, "planning": P5x9,
          "taux": 400, "rupture": {"motif": "retrait", "notif": "2026-09-22", "preavis": "execute"}}
    S.append(abs_case("C-ABS-09", c9, "2026-10", {}, ded_b("complete", 78000, 63 * 60, 198 * 60),
                      {"deduction": 24818, "salaire_du": 53182}, note=NOTE_FIN_ABS))
    c10 = {"debut": "2025-09-01", "fin": "2026-10-20", "type_annee": "incomplete", "semaines": 36, "planning": P4x8,
           "taux": 400, "rupture": {"motif": "retrait", "notif": "2026-09-21", "preavis": "execute"}}
    S.append(abs_case("C-ABS-10", c10, "2026-10", {}, ded_b("incomplete", 38400, 6, 18),
                      {"deduction": 12800, "salaire_du": 25600}, note=NOTE_FIN_ABS))
    pl11 = {"1": [["08:00", "17:00"]], "2": [["08:00", "17:00"]], "3": [["08:00", "12:00"]],
            "4": [["08:00", "17:00"]], "5": [["08:00", "17:00"]]}
    plan_b = {0: 540, 1: 540, 2: 240, 3: 540, 4: 540}
    S.append(off("C-ABS-11", "absences", {"prevu_minutes": 182 * 60},
                 [{"type": "denominateur", "mois": "2023-05", "renommer": R(prevu_minutes="prevu_minutes"),
                   "sorties": ["prevu_minutes"]}],
                 [{"sortie": "prevu_minutes", "fonction": "prevu_du_mois", "args": [2023, 5, plan_b, "complete"],
                   "cle": "prevu_minutes"}],
                 contrat={"debut": "2023-01-02", "type_annee": "complete", "semaines": 52, "planning": pl11, "taux": 450}))
    S.append(off("C-ABS-12", "absences", {"prevu_jours": 23},
                 [{"type": "denominateur", "mois": "2023-05", "renommer": R(prevu_jours="prevu_jours"),
                   "sorties": ["prevu_jours"]}],
                 [{"sortie": "prevu_jours", "fonction": "prevu_du_mois", "args": [2023, 5, plan_b, "incomplete"],
                   "kwargs": {"contient_semaine_non_accueil": True}, "cle": "prevu_jours"}],
                 contrat={"debut": "2023-01-02", "type_annee": "incomplete", "semaines": 40, "planning": pl11,
                          "taux": 450, "semaines_sans_accueil": ["2023-05-15"]}))

    # ---------------- Conges payes : acquisition
    def acq_case(cas, contrat, periode, b_appels, att, ev=None, suffixe="", renommer=None, sorties=None, note=None,
                 propage=None):
        return off(cas, "congés payés", att,
                   [{"type": "cp_acquisition", "periode": periode,
                     "renommer": renommer or R(jours_acquis_hors_enfants="jours_acquis"),
                     "sorties": sorties or ["jours_acquis_hors_enfants"]}],
                   b_appels, contrat=contrat, evenements=ev, suffixe=suffixe, note=note, propage=propage)

    def acq_b(*args, **kw):
        return [{"sortie": "jours_acquis", "fonction": "acquisition_cp", "args": list(args), "kwargs": kw,
                 "cle": "jours_acquis"}]

    S.append(acq_case("C-CPA-02", dict(DURAND, enfants_a_charge=1, age_am=35), 2021,
                      [{"sortie": "total", "fonction": "jours_enfants_a_charge", "args": [25, 35, 1], "cle": "total"},
                       {"sortie": "jours_enfants", "fonction": "jours_enfants_a_charge", "args": [25, 35, 1],
                        "cle": "jours_supplementaires"}],
                      {"total": 27}, renommer=R(jours_acquis="total", jours_enfants="jours_enfants"),
                      sorties=["jours_acquis", "jours_enfants"]))
    S.append(acq_case("C-CPA-03", dict(DURAND, fin="2022-09-30"), 2022,
                      acq_b("complete", mois=4, semaines=17, jours=88, jours_par_semaine=5), {"jours_acquis": 11}))
    S.append(acq_case("C-CPA-03", dict(DURAND, fin="2022-09-30", enfants_a_charge=1), 2022,
                      [{"sortie": "jours_enfants", "fonction": "jours_enfants_a_charge", "args": [11, 35, 1],
                        "kwargs": {"periode_atteint_31_mai": False}, "cle": "jours_supplementaires"}],
                      {"jours_enfants": 0}, suffixe="-ENFANTS", renommer=R(jours_enfants="jours_enfants"),
                      sorties=["jours_enfants"]))
    S.append(acq_case("C-CPA-04", dict(BERTRAND), 2021,
                      acq_b("incomplete", semaines=31, jours=155, jours_par_semaine=5), {"jours_acquis": 20}))
    S.append(acq_case("C-CPA-04", dict(BERTRAND, enfants_a_charge=2, age_am=39), 2021,
                      [{"sortie": "jours_enfants", "fonction": "jours_enfants_a_charge", "args": [20, 39, 2],
                        "cle": "jours_supplementaires"},
                       {"sortie": "total", "fonction": "jours_enfants_a_charge", "args": [20, 39, 2], "cle": "total"}],
                      {"jours_enfants": 4, "total": 24}, suffixe="-ENFANTS",
                      renommer=R(jours_enfants="jours_enfants", jours_acquis="total"),
                      sorties=["jours_enfants", "jours_acquis"],
                      propage={"total": "SUS-11 (acquisition de C-CPA-04)"}))
    S.append(acq_case("C-CPA-05", dict(BERTRAND, fin="2022-09-30"), 2022,
                      acq_b("incomplete", semaines=11, jours=58, jours_par_semaine=5), {"jours_acquis": 8}))
    S.append(off("C-CPA-06", "congés payés", {"jours_acquis": 25},
                 [{"type": "absent", "non_comparable": True, "sorties": ["jours_acquis"],
                   "note": "Non comparable : le cas donne 118 jours travaillés sans dates ; A ne compte pas en jours, il compte des semaines calendaires."}],
                 acq_b("complete", jours=118, jours_par_semaine=3)))
    occ = ["2021-10-25", "2021-11-01", "2021-12-20", "2021-12-27", "2022-02-14", "2022-02-21", "2022-02-28",
           "2022-04-18", "2022-04-25", "2022-05-02", "2022-05-09", "2022-07-25", "2022-08-01", "2022-08-08",
           "2022-08-15", "2022-08-22"]
    S.append(acq_case("C-CPA-07", {"debut": "2021-09-01", "type_annee": "incomplete", "semaines": 36,
                                   "planning": P5x8, "taux": 500, "semaines_sans_accueil": occ}, 2021,
                      acq_b("incomplete", semaines=28), {"jours_acquis": 18},
                      note="Contrat de la fiche S-OCC-3.5 : 28 semaines travaillées du 1er septembre 2021 au 31 mai 2022."))
    S.append(acq_case("C-CPA-09", complet(P5x8, 450, debut="2025-06-01"), 2025,
                      acq_b("complete", periode_complete=True), {"jours_acquis": 30}))
    S.append(acq_case("C-CPA-10", incomplet(P4x8, 500, 40, debut="2025-06-01"), 2025,
                      acq_b("incomplete", semaines=40), {"jours_acquis": 25}))
    S.append(acq_case("C-CPA-13", complet(P5x8, 450, debut="2025-06-01"), 2025,
                      acq_b("complete", semaines=32, semaines_arret_maladie=20), {"jours_acquis": 30},
                      ev={"absences_am": [conge("am_malade", "2025-09-01", "2026-01-18")]}))
    S.append(acq_case("C-CPA-14", complet(P5x8, 450, debut="2024-06-01"), 2024,
                      acq_b("complete", semaines=48, semaines_arret_maladie=4), {"jours_acquis": 30},
                      ev={"absences_am": [conge("am_malade", "2024-10-07", "2024-11-03")]}, suffixe="-P1"))
    S.append(acq_case("C-CPA-14", complet(P5x8, 450, debut="2024-06-01"), 2025,
                      acq_b("complete", mois=10, semaines=41, mois_arret_maladie=1, semaines_arret_maladie=11,
                            date_fin_periode=D("2026-05-31")), {"jours_acquis": 29},
                      ev={"absences_am": [conge("am_malade", "2025-10-06", "2025-12-21")]}, suffixe="-P2"))
    S.append(acq_case("C-CPA-15", complet(P5x8, 450, debut="2024-06-01"), 2024,
                      acq_b("complete", mois=9, mois_arret_maladie=3, date_fin_periode=D("2025-05-31")),
                      {"jours_acquis": 29}, ev={"absences_am": [conge("am_malade", "2025-03-01", "2026-07-31")]}))
    S.append(acq_case("C-CPA-16", complet(P5x8, 450, debut="2026-01-01"), 2025,
                      acq_b("complete", mois=5), {"jours_acquis": 13}, suffixe="-P1"))
    S.append(acq_case("C-CPA-16", complet(P5x8, 450, debut="2026-01-01"), 2026,
                      acq_b("complete", periode_complete=True), {"jours_acquis": 30}, suffixe="-P2"))
    S.append(off("C-CPA-17", "congés payés", {"fractionnement_1": 2, "fractionnement_2": 1},
                 [{"type": "absent", "sorties": ["fractionnement_1", "fractionnement_2"],
                   "note": "A n'a pas de fonction pour les jours de fractionnement (R-CP-04)."}],
                 [{"sortie": "fractionnement_1", "fonction": "jours_fractionnement", "args": [28, 12],
                   "cle": "jours_fractionnement"},
                  {"sortie": "fractionnement_2", "fonction": "jours_fractionnement", "args": [16, 12],
                   "cle": "jours_fractionnement"}]))
    S.append(off("C-CPA-18", "congés payés", {"jours_semaine": 6, "jours_semaine_ferie": 5},
                 [{"type": "cp_decompte", "du": "2026-03-09", "au": "2026-03-14", "renommer": R(jours_decomptes="jours_semaine")},
                  {"type": "cp_decompte", "du": "2026-05-11", "au": "2026-05-16", "renommer": R(jours_decomptes="jours_semaine_ferie")}],
                 [{"sortie": "jours_semaine", "fonction": "decompte_jours_cp",
                   "args": [D("2026-03-09"), D("2026-03-16"), {"ens": [0, 1, 3, 4]}], "cle": "jours_decomptes"},
                  {"sortie": "jours_semaine_ferie", "fonction": "decompte_jours_cp",
                   "args": [D("2026-05-11"), D("2026-05-18"), {"ens": [0, 1, 3, 4]}], "cle": "jours_decomptes"}],
                 contrat=complet(P4x8, 450, debut="2025-09-01"),
                 note="Côté A, congé saisi du lundi au samedi (« Au (inclus) »)."))

    # ---------------- Conges payes : indemnite
    def ind_b(sortie, cle, *args, transformer=None, **kw):
        d = {"sortie": sortie, "fonction": "indemnite_cp", "args": list(args), "kwargs": kw, "cle": cle}
        if transformer:
            d["transformer"] = transformer
        return d

    S.append(off("C-CPI-03", "congés payés", {"maintien": 80000, "cp_juin": 80000},
                 [{"type": "maintien", "jours": 24, "renommer": R(maintien="maintien")},
                  {"type": "cp_mois", "mois": "2022-06", "renommer": R(cp_indemnite_mois="cp_juin"),
                   "sorties": ["cp_indemnite_mois"]}],
                 [ind_b("maintien", "maintien_exact_centimes.0", 24, 2400, 500, 531429, heures_conge_minutes=9600,
                        jours_supplementaires=4, transformer="entier"),
                  dict(ind_b("indemnite", "indemnite_centimes", 24, 2400, 500, 531429, heures_conge_minutes=9600,
                             jours_supplementaires=4), interne=True),
                  {"sortie": "cp_juin", "fonction": "paiement_cp_annee_incomplete", "args": ["juin", {"ref": "indemnite"}, 60000, 6],
                   "cle": "montant_cp_du_mois_centimes"}],
                 contrat=dict(BERTRAND, enfants_a_charge=2, age_am=39),
                 propage={"cp_juin": "SUS-11 (A calcule ses propres jours acquis, voir C-CPA-04)"}))
    S.append(off("C-CPI-03", "congés payés", {"cp_principale": 80000},
                 [{"type": "cp_mois", "mois": "2022-08", "renommer": R(cp_indemnite_mois="cp_principale"),
                   "sorties": ["cp_indemnite_mois"]}],
                 [dict(ind_b("indemnite", "indemnite_centimes", 24, 2400, 500, 531429, heures_conge_minutes=9600,
                             jours_supplementaires=4), interne=True),
                  {"sortie": "cp_principale", "fonction": "paiement_cp_annee_incomplete",
                   "args": ["prise_principale", {"ref": "indemnite"}, 60000, 8], "kwargs": {"mois_prise_principale": 8},
                   "cle": "montant_cp_du_mois_centimes"}],
                 contrat=dict(BERTRAND, enfants_a_charge=2, age_am=39, cp_mode="principale"),
                 evenements={"absences_am": [conge("cp", "2022-08-01", "2022-08-13")]}, suffixe="-PRINCIPALE",
                 propage={"cp_principale": "SUS-11 (A calcule ses propres jours acquis, voir C-CPA-04)"}))
    S.append(off("C-CPI-03", "congés payés", {"cp_fur": 40000},
                 [{"type": "cp_mois", "mois": "2022-08", "renommer": R(cp_indemnite_mois="cp_fur"),
                   "sorties": ["cp_indemnite_mois"]}],
                 [{"sortie": "cp_fur", "fonction": "paiement_cp_annee_incomplete",
                   "args": ["fur_et_a_mesure", 80000, 60000, 8], "cle": "montant_cp_du_mois_centimes"}],
                 contrat=dict(BERTRAND, enfants_a_charge=2, age_am=39, cp_mode="fur"),
                 evenements={"absences_am": [conge("cp", "2022-08-01", "2022-08-13")]}, suffixe="-FUR"))
    cocc = {"debut": "2021-09-01", "type_annee": "incomplete", "semaines": 36, "planning": P5x8, "taux": 500,
            "semaines_sans_accueil": occ + BERTRAND_OFF[16:]}
    for cas in ("C-CPI-04", "C-CPI-06"):
        S.append(off(cas, "congés payés", {"maintien": 60000, "cp_juin": 60000},
                     [{"type": "maintien", "jours": 18, "renommer": R(maintien="maintien")},
                      {"type": "cp_mois", "mois": "2022-06", "renommer": R(cp_indemnite_mois="cp_juin"),
                       "sorties": ["cp_indemnite_mois"]}],
                     [ind_b("maintien", "maintien_exact_centimes.0", 18, 2400, 500, 540000, transformer="entier"),
                      dict(ind_b("indemnite", "indemnite_centimes", 18, 2400, 500, 540000), interne=True),
                      {"sortie": "cp_juin", "fonction": "paiement_cp_annee_incomplete",
                       "args": ["juin", {"ref": "indemnite"}, 60000, 6], "cle": "montant_cp_du_mois_centimes"}],
                     contrat=dict(cocc),
                     propage={"cp_juin": "SUS-11 (A calcule ses propres jours acquis, voir C-CPA-07)"}))
        fur_b = ({"sortie": "cp_fur", "fonction": "paiement_cp_annee_incomplete",
                  "args": ["fur_et_a_mesure", 60000, 60000, 8], "cle": "montant_cp_du_mois_centimes"}
                 if cas == "C-CPI-04" else
                 {"sortie": "cp_fur", "fonction": "indemnite_cp_prise_partielle", "args": ["incomplete"],
                  "cle": "indemnite_centimes"})
        S.append(off(cas, "congés payés", {"cp_fur": 40000},
                     [{"type": "cp_mois", "mois": "2022-08", "renommer": R(cp_indemnite_mois="cp_fur"),
                       "sorties": ["cp_indemnite_mois"]}],
                     [fur_b], contrat=dict(cocc, cp_mode="fur"),
                     evenements={"absences_am": [conge("cp", "2022-08-01", "2022-08-13")]}, suffixe="-FUR"))
    c06 = complet(P5x8, 450, debut="2026-01-05")
    S.append(off("C-CPI-10", "congés payés", {"maintien": 39000},
                 [{"type": "maintien", "jours": 13, "renommer": R(maintien="maintien")}],
                 [ind_b("maintien", "indemnite_centimes", 13, 2400, 450, 371429)], contrat=c06,
                 note="B refuse avant de donner le maintien ; la clé compare le maintien de A au résultat de B."))
    S.append(off("C-CPI-11", "congés payés", {"maintien": 90000},
                 [{"type": "maintien", "jours": 30, "renommer": R(maintien="maintien")}],
                 [ind_b("maintien", "maintien_exact_centimes.0", 30, 2400, 450, 885208, transformer="entier")],
                 contrat=c06))
    S.append(off("C-CPI-12", "congés payés", {"indemnite": 93600, "complement": 3600},
                 [{"type": "cp_indemnite", "periode": 2025, "renommer": R(indemnite_cp="indemnite"),
                   "sorties": ["indemnite_cp"]},
                  {"type": "cp_mois", "mois": "2026-06", "renommer": R(cp_complement_mois="complement"),
                   "sorties": ["cp_complement_mois"]}],
                 [ind_b("indemnite", "indemnite_centimes", 30, 2400, 450, 936000),
                  {"sortie": "_ind", "fonction": "indemnite_cp", "args": [30, 2400, 450, 936000], "cle": "indemnite_centimes",
                   "garder": "ind", "interne": True},
                  {"sortie": "complement", "fonction": "complement_cp_annee_complete", "args": [{"ref": "ind"}],
                   "cle": "complement_centimes"}],
                 contrat=complet(P5x8, 450, debut="2025-06-01"),
                 note="Officiel : reliquat de 36 € versé « au terme de la dernière semaine de congés payés » (février N+3)."))
    S.append(off("C-CPI-13", "congés payés", {"maintien": 27000},
                 [{"type": "maintien", "jours": 13, "renommer": R(maintien="maintien")}],
                 [ind_b("maintien", "indemnite_centimes", 13, 2400, 450, 270000)],
                 contrat=incomplet(P5x8, 450, 36, debut="2026-01-05"),
                 note="La fiche S-BFC retient 13/26 × 540 € = 270 € pour le maintien."))
    S.append(off("C-CPI-16", "congés payés", {"indemnite_prise": 38640},
                 [{"type": "absent", "sorties": ["indemnite_prise"],
                   "note": "En année complète, A ne calcule pas d'indemnité à chaque prise : il maintient le salaire et verse un complément en juin."}],
                 [{"sortie": "indemnite_prise", "fonction": "indemnite_cp_prise_partielle", "args": ["complete"],
                   "cle": "indemnite_centimes"}]))

    # ---------------- Jours feries
    p_lmjv = semaine([1, 3, 4, 5], "08:00", "16:00")
    S.append(off("C-JF-01", "jours fériés", {"ferie_paye": True, "ferie_paye_absence_autorisee": True},
                 [{"type": "ferie", "date": "2026-11-11", "renommer": R(ferie_paye="ferie_paye")},
                  {"type": "ferie", "date": "2026-11-11", "renommer": R(ferie_paye="ferie_paye_absence_autorisee"),
                   "evenements": {"absences_am": [conge("cp", "2026-11-09", "2026-11-09")]}}],
                 [{"sortie": "ferie_paye", "fonction": "ferie_chome", "args": [D("2026-11-11"), {"ens": [0, 2, 3, 4]}],
                   "cle": "remuneration_maintenue"},
                  {"sortie": "ferie_paye_absence_autorisee", "fonction": "ferie_chome",
                   "args": [D("2026-11-11"), {"ens": [0, 2, 3, 4]}], "kwargs": {"presence_veille": "absence_autorisee"},
                   "cle": "remuneration_maintenue"}],
                 contrat=complet(p_lmjv, 450, debut="2026-09-01")))
    S.append(off("C-JF-02", "jours fériés", {"ferie_paye": True},
                 [{"type": "ferie", "date": "2022-07-14", "renommer": R(ferie_paye="ferie_paye")}],
                 [{"sortie": "ferie_paye", "fonction": "ferie_chome", "args": [D("2022-07-14"), {"ens": [0, 1, 2, 3, 4]}],
                   "cle": "remuneration_maintenue"}],
                 contrat=complet(P5x8, 450, debut="2022-01-03")))
    S.append(off("C-JF-02", "jours fériés", {"ferie_paye": True},
                 [{"type": "ferie", "date": "2022-07-14", "renommer": R(ferie_paye="ferie_paye")}],
                 [{"sortie": "ferie_paye", "fonction": "ferie_chome", "args": [D("2022-07-14"), {"ens": [3]}],
                   "cle": "remuneration_maintenue"}],
                 contrat=complet(semaine([4], "08:00", "16:00"), 450, debut="2022-01-03"), suffixe="-JEUDI"))

    # ---------------- Indemnites d'entretien
    def ent(sortie, d, mn):
        return {"sortie": sortie, "fonction": "minimum_entretien_journalier", "args": [D(d), mn], "cle": "minimum_centimes"}

    S.append(off("C-IND-01", "indemnités", {"minimum_9h": 392, "minimum_11h": 479},
                 [{"type": "plancher_entretien", "date": "2026-06-01", "minutes": 540, "renommer": R(minimum_entretien="minimum_9h")},
                  {"type": "plancher_entretien", "date": "2026-06-01", "minutes": 660, "renommer": R(minimum_entretien="minimum_11h")}],
                 [ent("minimum_9h", "2026-06-01", 540), ent("minimum_11h", "2026-06-01", 660)]))
    S.append(off("C-IND-03", "indemnités", {"minimum_10h": 415, "minimum_6h": 265},
                 [{"type": "plancher_entretien", "date": "2024-02-01", "minutes": 600, "renommer": R(minimum_entretien="minimum_10h")},
                  {"type": "plancher_entretien", "date": "2024-02-01", "minutes": 360, "renommer": R(minimum_entretien="minimum_6h")}],
                 [ent("minimum_10h", "2024-02-01", 600), ent("minimum_6h", "2024-02-01", 360)]))
    S.append(off("C-IND-04", "indemnités", {"minimum_9h": 338},
                 [{"type": "plancher_entretien", "date": "2022-01-01", "minutes": 540, "renommer": R(minimum_entretien="minimum_9h")}],
                 [ent("minimum_9h", "2022-01-01", 540)]))

    # ---------------- Regularisation
    AUCUNE = {"feries_chomes_payes": {"minutes": 0, "incluses": False},
              "absences_remunerees": {"minutes": 0, "incluses": False},
              "heures_complementaires": {"minutes": 0, "incluses": False}}
    ev_bert = {"absences_am": [conge("am_malade", "2021-10-13", "2021-10-15")]}
    S.append(off("C-REG-01", "régularisation", {"regularisation": 571},
                 [{"type": "regularisation", "du": "2021-09-01", "au": "2022-08-31", "renommer": R(regularisation="regularisation")}],
                 [{"sortie": "regularisation", "fonction": "regularisation_annuelle",
                   "args": ["incomplete", 711429, 500, 1424 * 60,
                            dict(AUCUNE, feries_chomes_payes={"minutes": None, "incluses": False})],
                   "cle": "ecart_centimes"}],
                 contrat=dict(BERTRAND), evenements=ev_bert))
    S.append(off("C-REG-02", "régularisation", {"regularisation": 28571},
                 [{"type": "fin", "notification": "2022-09-01", "motif": "retrait", "renommer": R(regularisation_fin="regularisation"),
                   "sorties": ["regularisation_fin"]}],
                 [{"sortie": "regularisation", "fonction": "regularisation_finale",
                   "args": ["incomplete", [571], 60000, 500, 176 * 60, AUCUNE], "cle": "versement_centimes"}],
                 contrat=dict(BERTRAND), evenements=ev_bert,
                 propage={"regularisation": "A-06 (écart annuel de C-REG-01, donné à B comme entrée)"}))
    for cas, verse, minutes_, attv in [("C-REG-03", 294000, 924 * 60, 0), ("C-REG-04", 222000, 892 * 60, 45600),
                                       ("C-REG-05", 294000, 900 * 60, 0), ("C-REG-06", 222000, 860 * 60, 36000)]:
        comp = dict(AUCUNE, heures_complementaires={"minutes": 20 * 60, "incluses": True})
        S.append(off(cas, "régularisation", {"regularisation": attv},
                     [{"type": "absent", "non_comparable": True, "sorties": ["regularisation"],
                       "note": "Non comparable : exemple en net sur un contrat de 2014 dont le calendrier n'est pas donné."}],
                     [{"sortie": "regularisation", "fonction": "regularisation_finale",
                       "args": ["incomplete", [], verse, 300, minutes_, comp], "kwargs": {"nature_taux": "net"},
                       "cle": "versement_centimes"}]))
    for cas, verse, attv in [("C-REG-07", 540 * 400, 52000), ("C-REG-08", 720 * 400, 0)]:
        comp = dict(AUCUNE, feries_chomes_payes={"minutes": None, "incluses": True},
                    absences_remunerees={"minutes": None, "incluses": True})
        S.append(off(cas, "régularisation", {"regularisation": attv},
                     [{"type": "absent", "non_comparable": True, "sorties": ["regularisation"],
                       "note": "Non comparable : heures effectuées données en bloc par mois (planning variable), que A ne peut pas recevoir."}],
                     [{"sortie": "regularisation", "fonction": "regularisation_finale",
                       "args": ["incomplete", [], verse, 400, 670 * 60, comp], "cle": "versement_centimes"}]))

    # ---------------- Fin de contrat
    S.append(off("C-FIN-09", "fin de contrat", {"iccp": 40200},
                 [{"type": "fin", "notification": "2026-08-17", "motif": "retrait", "renommer": R(iccp="iccp"),
                   "sorties": ["iccp"]},
                  {"type": "absent", "sorties": ["iccp_periode_2"],
                   "note": "A ne donne pas l'ICCP période par période."}],
                 [{"sortie": "iccp", "fonction": "iccp",
                   "args": ["complete", "normal",
                            [{"jours_acquis": 23, "jours_payes": 18, "salaires_bruts_periode_centimes": 9 * 78000},
                             {"jours_acquis": 8, "jours_payes": 0, "salaires_bruts_periode_centimes": 3 * 78000}],
                            2700, 400], "cle": "iccp_centimes"},
                  {"sortie": "iccp_periode_2", "fonction": "iccp",
                   "args": ["complete", "normal", [{"jours_acquis": 8, "jours_payes": 0,
                                                     "salaires_bruts_periode_centimes": 3 * 78000}], 2700, 400],
                   "cle": "iccp_centimes"}],
                 contrat=complet(P5x9, 400, debut="2025-09-01", fin="2026-08-31"),
                 evenements={"absences_am": [conge("cp", "2026-06-08", "2026-06-27")]}))
    # T-076 (direction) : A calcule la fin de CDD (decisions, section 2). Contrat du 01/01 au 28/02/2026 choisi pour
    # un salaire mensuel de 800 EUR : 4 jours (lundi, mardi, mercredi, vendredi ; le 1er janvier, jeudi, n'est pas
    # travaille) de 9 h 24, 4,91 EUR : 37,6 h x 52 / 12 x 4,91 = 800,0027 EUR, 800,00 EUR au centime (ARR-01).
    S.append(off("C-FIN-11", "fin de contrat", {"precarite": 16000},
                 [{"type": "fin", "date": "2026-02-28", "motif": "fin_cdd", "fin_cdd": "terme",
                   "renommer": R(ifc="precarite"), "sorties": ["ifc"]}],
                 [{"sortie": "precarite", "fonction": "indemnite_precarite_cdd", "args": [160000], "cle": "indemnite_centimes"}],
                 contrat={"debut": "2026-01-01", "fin": "2026-02-28", "type_annee": "complete", "semaines": 52,
                          "planning": semaine([1, 2, 3, 5], "08:00", "17:24"), "taux": 491, "majoration_hm": 10,
                          "cdd": True, "cdd_terme": "2026-02-28", "cdd_motif": "remplacement"},
                 note="Exemple Urssaf (Virginie) : 800 EUR brut par mois du 1er janvier au 28 février."))
    S.append(off("C-FIN-12", "fin de contrat", {"jours_a_indemniser": 0},
                 [{"type": "absent", "non_comparable": True, "sorties": ["jours_a_indemniser"],
                   "note": "Non comparable : A ne sort pas l'ICCP ni les jours période par période."}],
                 [{"sortie": "jours_a_indemniser", "fonction": "jours_a_indemniser", "args": [15, 15], "cle": "jours"}]))

    # ---------------- Brut et net
    for cas, d, brut, titre, net in [("C-NET-01", "2026-06-01", 420, 437, 328), ("C-NET-02", "2026-01-01", 364, 379, 286),
                                     ("C-NET-03", "2026-06-12", 420, 437, 328)]:
        S.append(off(cas, "brut et net", {"minimum_brut": brut, "minimum_titre": titre, "minimum_net": net},
                     [{"type": "minimum_conventionnel", "date": d,
                       "renommer": R(minimum_brut="minimum_brut", minimum_net="minimum_net")},
                      {"type": "absent", "sorties": ["minimum_titre"],
                       "note": "A ne connaît pas la majoration pour le titre AM-AP (R-SAL-05)."}],
                     [{"sortie": "minimum_brut", "fonction": "minimum_horaire_brut", "args": [D(d)], "cle": "minimum_centimes"},
                      {"sortie": "minimum_titre", "fonction": "minimum_horaire_brut", "args": [D(d)],
                       "kwargs": {"titre_am_ap": True}, "cle": "minimum_centimes"},
                      {"sortie": "minimum_net", "fonction": "convertir_brut_net", "args": [brut], "cle": "net_centimes"}]))
    S.append(off("C-NET-04", "brut et net", {"conversion": 500},
                 [{"type": "brut_depuis_net", "net": 391, "date": "2023-01-01", "renommer": R(brut_estime="conversion")}],
                 [{"sortie": "conversion", "fonction": "convertir_brut_net", "args": [500], "cle": "net_centimes"}],
                 note="5 € brut soit 3,91 € net : A ne convertit que du net vers le brut ; on compare le brut que A tire de 3,91 €."))
    S.append(off("C-NET-05", "brut et net", {"minimum_brut": 345},
                 [{"type": "minimum_conventionnel", "date": "2024-02-01", "renommer": R(minimum_brut="minimum_brut"),
                   "sorties": ["minimum_brut"]}],
                 [{"sortie": "minimum_brut", "fonction": "minimum_horaire_brut", "args": [D("2024-02-01")],
                   "cle": "minimum_centimes"}]))
    return S


# ============================================================ grille

# Semaines sans accueil (lundis). Annee incomplete 36 semaines : 16 par annee de contrat.
OFF36 = ["2025-07-07", "2025-07-14", "2025-07-21", "2025-07-28", "2025-08-04", "2025-08-11", "2025-08-18", "2025-08-25",
         "2025-10-20", "2025-10-27", "2025-12-22", "2025-12-29", "2026-02-16", "2026-02-23", "2026-04-13", "2026-04-20",
         "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24",
         "2026-10-19", "2026-10-26", "2026-12-21", "2026-12-28", "2027-02-15", "2027-02-22", "2027-04-12", "2027-04-19",
         "2027-07-05", "2027-07-12", "2027-07-19", "2027-07-26", "2027-08-02", "2027-08-09", "2027-08-16", "2027-08-23"]
# Annee incomplete 46 semaines : 6 par annee de contrat.
OFF46 = ["2025-08-04", "2025-08-11", "2025-08-18", "2025-08-25",
         "2025-12-22", "2025-12-29", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24",
         "2026-12-21", "2026-12-28", "2027-08-02", "2027-08-09", "2027-08-16", "2027-08-23"]

HORAIRES = {
    "H10": semaine([1, 2], "08:00", "13:00"),
    "H25": semaine(L5, "08:00", "13:00"),
    "H32": P4x8,
    "H40": P5x8,
    "H45": P5x9,
}
ANNEES = {"C52": ("complete", 52, []), "I36": ("incomplete", 36, OFF36), "I46": ("incomplete", 46, OFF46)}
TAUX = {"T420": 420, "T500": 500}


def contrat_grille(an, hr, tx, debut="2025-09-01", **kw):
    typ, sem, off_ = ANNEES[an]
    pl = HORAIRES[hr]
    k = {"debut": debut, "type_annee": typ, "semaines": sem, "planning": pl, "taux": TAUX[tx],
         "majoration_hm": 10, "semaines_sans_accueil": off_, "entretien_jour": 400,  # tarif par jour d'accueil, lu par A et B (T-042)
         "repas_prix": 300, "repas_par_jour": 1,
         "cp_mode": "juin", "age_am": 35, "enfants_a_charge": 0}
    k.update(kw)
    return k


def jours_planifies(pl, du, au):
    js = [int(x) - 1 for x in pl]
    return jours_ouvres(du, au, js)


def sit(id_, domaine, contrat, calculs, evenements=None, theme=None, marques=None):
    d = {"id": id_, "origine": "grille", "domaine": domaine, "theme": theme or domaine, "contrat": contrat,
         "evenements": evenements or {}, "calculs": calculs}
    if marques:
        # T-042b : marques reprises par comparer.py dans la synthese. Cle = nom de sortie, ou « * » pour toutes.
        d["marques"] = marques
    return d


def duree_planning(pl):
    """Duree (minutes) d'un jour du planning ; la grille n'a que des jours de meme duree."""
    j = next(iter(pl.values()))[0]
    h1, m1 = map(int, j[0].split(":"))
    h2, m2 = map(int, j[1].split(":"))
    return (h2 * 60 + m2) - (h1 * 60 + m1)


MARQUE_HORAIRE = "entretien à montant horaire (CCN art. 114.1), même montant envoyé aux deux moteurs"
MARQUE_PREAVIS = ("préavis non exécuté à la demande de l'AM, accepté (CCN art. 64 et 64.2) : fin au dernier jour "
                  "travaillé ; inexécution transmise aux deux moteurs")


def mois(id_, m):
    return {"id": id_, "type": "mois", "mois": m}


def heure_plus(hhmm, minutes_):
    h, m = map(int, hhmm.split(":"))
    t = h * 60 + m + minutes_
    return f"{t // 60:02d}:{t % 60:02d}"


def grille():
    S = []
    for an in ANNEES:
        for hr, pl in HORAIRES.items():
            for tx in TAUX:
                base = f"{an}-{hr}-{tx}"
                k = contrat_grille(an, hr, tx)
                deb, fin_ = next(iter(pl.values()))[0]
                S.append(sit(f"G-{base}-S01", "mois ordinaire", k, [mois("m", "2026-09")]))
                S.append(sit(f"G-{base}-S02", "jours fériés", k, [mois("m", "2026-11")], theme="mois avec férié chômé"))
                S.append(sit(f"G-{base}-S03", "jours fériés", k, [mois("m", "2026-11")],
                             {"absences_am": [conge("am_malade", "2026-11-10", "2026-11-10")]},
                             theme="férié et AM malade la veille"))
                S.append(sit(f"G-{base}-S04", "absences", k, [mois("m", "2026-09")],
                             {"jours": [{"date": d, "abs": "parents"} for d in ["2026-09-08", "2026-09-09"]]},
                             theme="enfant absent à la demande des parents"))
                S.append(sit(f"G-{base}-S05", "absences", k, [mois("m", "2026-09")],
                             {"jours": [{"date": d, "abs": "malade_certif"} for d in ["2026-09-15", "2026-09-16", "2026-09-17"]]},
                             theme="enfant malade avec certificat, 3 jours"))
                S.append(sit(f"G-{base}-S06", "absences", k, [mois("m", "2026-09")],
                             {"jours": [{"date": d, "abs": "malade_certif"} for d in jours_ouvres("2026-09-14", "2026-09-23")]},
                             theme="enfant malade avec certificat, 8 jours ouvrés"))
                S.append(sit(f"G-{base}-S07", "absences", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("am_malade", "2026-09-14", "2026-09-15")]}, theme="AM malade 2 jours"))
                S.append(sit(f"G-{base}-S08", "absences", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("sans_solde", "2026-09-21", "2026-09-25")]},
                             theme="AM en congé sans solde une semaine"))
                S.append(sit(f"G-{base}-S09", "absences", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("evenement", "2026-09-10", "2026-09-11")]},
                             theme="AM en congé pour événement familial"))
                S.append(sit(f"G-{base}-S09B", "absences", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("am_enfant_malade", "2026-09-10", "2026-09-11")]},
                             theme="AM absente pour son enfant malade"))
                # Heures en plus : +2 h le premier jour de la semaine du 7 septembre ; +7 h reparties la semaine du 14.
                jA = jours_planifies(pl, "2026-09-07", "2026-09-13")
                jB = jours_planifies(pl, "2026-09-14", "2026-09-20")
                pres = [{"date": jA[0], "pres": [[deb, heure_plus(fin_, 120)]]}]
                q = 420 // len(jB)
                pres += [{"date": d, "pres": [[deb, heure_plus(fin_, q)]]} for d in jB]
                S.append(sit(f"G-{base}-S10", "heures en plus", k, [mois("m", "2026-09")], {"jours": pres},
                             theme="heures en plus (2 h, puis 7 h dans la semaine)"))
                # T-042b (B-1, C-2) : meme mois, contrat a montant HORAIRE d'entretien, envoye tel quel aux deux moteurs.
                # T-042c : montant en centimes entiers, comme dans un contrat : 4,00 EUR divises par la duree d'un jour du
                # planning, arrondi au centime superieur (0,80 EUR pour 5 h ; 0,50 EUR pour 8 h ; 0,45 EUR pour 9 h).
                kh = dict(k, entretien_horaire=str(-(-400 * 60 // duree_planning(pl))))  # T-042c : centimes entiers par heure
                kh.pop("entretien_jour")
                S.append(sit(f"G-{base}-S10H", "indemnités", kh,
                             [{"id": "m", "type": "mois", "mois": "2026-09", "sorties": ["entretien"]}], {"jours": pres},
                             theme="entretien à montant horaire, heures en plus", marques={"*": MARQUE_HORAIRE}))
                if "3" in pl:
                    S.append(sit(f"G-{base}-S11", "jours fériés", k, [mois("m", "2026-11")],
                                 {"jours": [{"date": "2026-11-11", "pres": [[deb, fin_]], "ferie_travaille": True}]},
                                 theme="férié travaillé (11 novembre)"))
                S.append(sit(f"G-{base}-S13", "indemnités", dict(k, km_taux=40), [mois("m", "2026-09")],
                             {"jours": [{"date": d, "km": 10} for d in jA]}, theme="indemnités kilométriques"))
                # Fins de contrat
                S.append(sit(f"G-{base}-S16", "fin de contrat", dict(k, fin="2026-10-31"),
                             [{"id": "f", "type": "fin", "notification": "2026-10-01", "motif": "retrait"}],
                             theme="retrait, plus d'un an"))
                k17 = contrat_grille(an, hr, tx, debut="2026-03-02", fin="2026-09-30")
                S.append(sit(f"G-{base}-S17", "fin de contrat", k17,
                             [{"id": "f", "type": "fin", "notification": "2026-09-16", "motif": "retrait"}],
                             theme="retrait, 3 mois à 1 an"))
                k18 = contrat_grille(an, hr, tx, debut="2026-09-01", fin="2026-10-30")
                # T-042 (C4) : la notification etait le 30/10, jour de fin du contrat, alors que le preavis de 8 jours
                # court apres. A regularisait jusqu'a la fin du preavis (06/11), B jusqu'au 30/10 (16 faux F2).
                # Comme S17 : notification + preavis = fin (le 23/10 compte comme 1er jour, lecture de A).
                S.append(sit(f"G-{base}-S18", "fin de contrat", k18,
                             [{"id": "f", "type": "fin", "notification": "2026-10-23", "motif": "demission"}],
                             theme="démission, moins de 3 mois"))
                # T-042b (B-2) : l'ancienne S18 (notification et fin le 30/10, preavis de 8 jours non execute a la
                # demande de l'AM). Cas possible selon la CCN art. 64 et 64.2 ; garde visible pour le refus de A (M11).
                S.append(sit(f"G-{base}-S18N", "fin de contrat", k18,
                             # T-042c (M11, T-045) : l'inexecution est transmise aux moteurs. Dispense demandee par
                             # l'AM et acceptee par les parents (CCN art. 64.2, al. 2), dernier jour travaille = fin.
                             [{"id": "f", "type": "fin", "notification": "2026-10-30", "motif": "demission",
                               "inexecution": {"demandeur": "am_acceptee", "dernier_jour_travaille": "2026-10-30"}}],
                             theme="démission, moins de 3 mois, préavis non exécuté", marques={"*": MARQUE_PREAVIS}))
                S.append(sit(f"G-{base}-S19", "fin de contrat", dict(k, fin="2026-10-31"),
                             [{"id": "f", "type": "fin", "notification": "2026-10-01", "motif": "demission"}],
                             theme="démission, plus d'un an"))
                k20 = contrat_grille(an, hr, tx, debut="2026-03-02", fin="2026-09-30")
                S.append(sit(f"G-{base}-S20", "fin de contrat", k20,
                             [{"id": "f", "type": "fin", "notification": "2026-09-16", "motif": "demission"}],
                             theme="démission, 3 mois à 1 an"))
                if an == "C52":
                    # Conges pris normalement : contrat ancien, suivi depuis le 1er juin 2025 avec 30 jours a prendre.
                    kc = contrat_grille(an, hr, tx, debut="2024-06-03", suivi_depuis="2025-06-01",
                                        soldes={"cp_restants": 30})
                    ev = {"absences_am": [conge("cp", "2025-12-22", "2025-12-27"), conge("cp", "2026-07-20", "2026-08-01")]}
                    S.append(sit(f"G-{base}-S14", "congés payés", kc,
                                 [mois("dec", "2025-12"), mois("juil", "2026-07"), mois("aout", "2026-08"),
                                  {"id": "acq", "type": "cp_acquisition", "periode": 2025},
                                  {"id": "ind", "type": "cp_indemnite", "periode": 2025},
                                  {"id": "juin", "type": "cp_mois", "mois": "2026-06"}], ev,
                                 theme="congés pris normalement (année complète)"))
                    S.append(sit(f"G-{base}-S14V", "congés payés", kc,
                                 [{"id": "sam", "type": "cp_decompte", "du": "2026-07-20", "au": "2026-08-01", "reprise": "2026-08-03"},
                                  {"id": "ven", "type": "cp_decompte", "du": "2026-07-20", "au": "2026-07-31", "reprise": "2026-08-03"}],
                                 theme="décompte des jours de congé selon la saisie « Au (inclus) »"))
                else:
                    for mode in ("juin", "principale", "fur"):
                        kc = contrat_grille(an, hr, tx, cp_mode=mode)
                        ev = {"absences_am": [conge("cp", "2026-08-03", "2026-08-15")]}
                        S.append(sit(f"G-{base}-S15-{mode}", "congés payés", kc,
                                     [{"id": "acq", "type": "cp_acquisition", "periode": 2025},
                                      {"id": "ind", "type": "cp_indemnite", "periode": 2025},
                                      {"id": "juin", "type": "cp_mois", "mois": "2026-06"},
                                      {"id": "aout", "type": "cp_mois", "mois": "2026-08"}], ev,
                                     theme=f"indemnité de congés en année incomplète, paiement « {mode} »"))
    # ---------------- Situations ciblees
    k = contrat_grille("C52", "H40", "T420")
    S.append(sit("X-A01-48SEM", "mensualisation", dict(contrat_grille("I36", "H40", "T420"), semaines=48,
                                                       semaines_sans_accueil=[]), [mois("m", "2026-09")],
                 theme="48 semaines d'accueil (entre 46 et 52)"))
    p50 = semaine(L5, "08:00", "18:00")
    S.append(sit("X-A13-50H", "mensualisation", dict(k, planning=p50),
                 [mois("m", "2026-09")], theme="contrat de 50 h par semaine"))
    S.append(sit("X-CP03-MOINS21", "congés payés", dict(contrat_grille("C52", "H40", "T420", debut="2025-06-01"),
                                                         age_am=20, enfants_a_charge=2),
                 [{"id": "acq", "type": "cp_acquisition", "periode": 2025}], theme="AM de moins de 21 ans avec 2 enfants"))
    S.append(sit("X-A25-CP-SANS-DROITS", "absences", contrat_grille("C52", "H40", "T420", debut="2026-01-05"),
                 [mois("m", "2026-03")], {"absences_am": [conge("cp", "2026-03-09", "2026-03-14")]},
                 theme="congés pris sans droits acquis (année complète)"))
    S.append(sit("X-ENFANT-SANS-SOLDE", "absences", k, [mois("m", "2026-09")],
                 {"jours": [{"date": d, "abs": "sans_solde_enfant"} for d in ["2026-09-08", "2026-09-09"]]},
                 theme="absence de l'enfant « sans solde » avec accord écrit"))
    S.append(sit("X-A19-NON-ACCUEIL", "absences", contrat_grille("I36", "H40", "T420"), [mois("m", "2026-10")],
                 {"absences_am": [conge("am_malade", "2026-10-06", "2026-10-07")]},
                 theme="absence dans un mois qui contient une semaine sans accueil"))
    S.append(sit("X-A31-PENTECOTE", "jours fériés", k, [mois("m", "2026-05")], theme="mois de mai avec lundi de Pentecôte"))
    S.append(sit("X-A32-ENFANT-VEILLE", "jours fériés", k, [mois("m", "2026-11")],
                 {"jours": [{"date": "2026-11-10", "abs": "parents"}]}, theme="enfant absent la veille du férié"))
    S.append(sit("X-1ER-MAI-TRAVAILLE", "jours fériés", contrat_grille("C52", "H40", "T420", debut="2027-06-01"),
                 [{"id": "m", "type": "mois", "mois": "2028-05", "sorties": ["salaire_base_mois", "heures_compl_montant",
                   "heures_maj_montant", "ferie_travaille_montant", "salaire_mois_hors_cp"]}],
                 {"jours": [{"date": "2028-05-01", "pres": [["08:00", "16:00"]], "ferie_travaille": True}]},
                 theme="1er mai travaillé (lundi 1er mai 2028, jour prévu)"))
    S.append(sit("X-ENTREE-MILIEU-MOIS", "mensualisation", contrat_grille("C52", "H40", "T420", debut="2026-09-16"),
                 [mois("m", "2026-09")], theme="embauche en cours de mois"))
    S.append(sit("X-A20-MOIS-ENTIER", "absences", k, [mois("m", "2026-09")],
                 {"absences_am": [conge("am_malade", "2026-09-01", "2026-09-30")]}, theme="AM malade tout le mois"))
    S.append(sit("X-ANCIENNETE-1-AN", "fin de contrat", dict(k, fin="2026-09-30"),
                 [{"id": "f", "type": "fin", "notification": "2026-09-01", "motif": "retrait",
                   "sorties": ["preavis", "date_fin_preavis"]}], theme="lettre envoyée le jour du premier anniversaire"))
    S.append(sit("X-A43-ENVOI-PRESENTATION", "fin de contrat", dict(k, fin="2026-09-17"),
                 [{"id": "f", "type": "fin", "notification": "2026-08-28", "presentation": "2026-09-03", "motif": "retrait",
                   "sorties": ["preavis", "date_fin_preavis"]}], theme="envoi avant 1 an, présentation après 1 an"))
    S.append(sit("X-ENTRETIEN-SOUS-MINIMUM", "indemnités", dict(contrat_grille("C52", "H45", "T420"), entretien_jour=300),
                 [mois("m", "2026-09")], theme="indemnité d'entretien du contrat sous le minimum"))
    # T-042d : entretien a montant horaire, enfant qui part plus tot ou arrive plus tard que prevu (un jour, 15/09/2026).
    # Aucune lecture n'est choisie ici : la duree du jour est celle que chaque moteur retient (art. 99 ou presence).
    # Des cas touchent le plancher journalier de 2,65 EUR selon la lecture, d'autres non. Seule la sortie entretien.
    MARQUE_042D = "T-042d : montant horaire d'entretien, présence différente du planning (aucune lecture choisie)"
    for id_, hr, taux_h, pres, theme in [
        ("X-ENTH-DEPART-5H", "H25", 60, ["08:00", "11:00"], "5 h prévues, départ à 11 h, 0,60 €/h"),
        ("X-ENTH-ARRIVEE-5H", "H25", 60, ["10:00", "13:00"], "5 h prévues, arrivée à 10 h, 0,60 €/h"),
        ("X-ENTH-DEPART-5H-SOUS-PLANCHER", "H25", 50, ["08:00", "11:00"], "5 h prévues, départ à 11 h, 0,50 €/h"),
        ("X-ENTH-DEPART-8H", "H40", 50, ["08:00", "14:00"], "8 h prévues, départ à 14 h, 0,50 €/h"),
        ("X-ENTH-ARRIVEE-8H", "H40", 50, ["10:00", "16:00"], "8 h prévues, arrivée à 10 h, 0,50 €/h"),
        ("X-ENTH-DECALE-8H", "H40", 50, ["07:00", "15:00"], "8 h prévues, arrivée à 7 h et départ à 15 h, 0,50 €/h"),
        ("X-ENTH-DEPART-9H", "H45", 45, ["08:00", "12:00"], "9 h prévues, départ à 12 h, 0,45 €/h"),
        ("X-ENTH-HORS-PLANNING-2H", "H25", 60, ["09:00", "11:00", "2026-09-19"], "samedi hors planning, 2 h, 0,60 €/h"),
        ("X-ENTH-HORS-PLANNING-6H", "H25", 60, ["08:00", "14:00", "2026-09-19"], "samedi hors planning, 6 h, 0,60 €/h"),
    ]:
        jour_ = pres[2] if len(pres) > 2 else "2026-09-15"
        pres = pres[:2]
        kd = dict(contrat_grille("C52", hr, "T420"), entretien_horaire=str(taux_h))
        kd.pop("entretien_jour")
        S.append(sit(id_, "indemnités", kd, [{"id": "m", "type": "mois", "mois": "2026-09", "sorties": ["entretien"]}],
                     {"jours": [{"date": jour_, "pres": [pres]}]},
                     theme="entretien horaire : " + theme, marques={"*": MARQUE_042D}))
    S.append(sit("X-CP-PENTECOTE", "congés payés", contrat_grille("C52", "H40", "T420"),
                 [{"id": "d", "type": "cp_decompte", "du": "2026-05-25", "au": "2026-05-30", "reprise": "2026-06-01"}],
                 theme="semaine de congé avec le lundi de Pentecôte"))
    S.append(sit("X-CP-DEBUT-NON-TRAVAILLE", "congés payés", contrat_grille("C52", "H32", "T420"),
                 [{"id": "d", "type": "cp_decompte", "du": "2026-03-11", "au": "2026-03-14", "reprise": "2026-03-16"}],
                 theme="congé saisi à partir d'un mercredi non travaillé (AM du lundi, mardi, jeudi, vendredi)"))
    # ---------------- Situations sans lundi travaille (le lundi de Pentecote, A-31, ne bloque pas B)
    OFF36_2024 = ["2024-07-08", "2024-07-15", "2024-07-22", "2024-07-29", "2024-08-05", "2024-08-12", "2024-08-19",
                  "2024-08-26", "2024-10-21", "2024-10-28", "2024-12-23", "2024-12-30", "2025-02-17", "2025-02-24",
                  "2025-04-14", "2025-04-21"]
    p_mv = PMaJ9
    kc = dict(contrat_grille("C52", "H32", "T420", debut="2024-06-01"), planning=p_mv)
    cp30 = [conge("cp", "2025-07-15", "2025-07-28"), conge("cp", "2025-08-19", "2025-09-01"),
            conge("cp", "2025-10-21", "2025-10-27")]
    S.append(sit("X-SANS-LUNDI-CP", "congés payés", kc,
                 [{"id": "acq24", "type": "cp_acquisition", "periode": 2024},
                  {"id": "ind24", "type": "cp_indemnite", "periode": 2024},
                  {"id": "juin25", "type": "cp_mois", "mois": "2025-06"},
                  mois("aout25", "2025-08"), mois("oct25", "2025-10"),
                  {"id": "ind25", "type": "cp_indemnite", "periode": 2025},
                  {"id": "juin26", "type": "cp_mois", "mois": "2026-06"}],
                 {"absences_am": cp30}, theme="congés pris normalement, contrat sans lundi (année complète)"))
    S.append(sit("X-SANS-LUNDI-FIN-C52", "fin de contrat", dict(kc, fin="2026-05-31"),
                 [{"id": "f", "type": "fin", "notification": "2026-05-01", "motif": "retrait"}],
                 {"absences_am": cp30}, theme="retrait au 31 mai, contrat sans lundi (année complète)"))
    ki = dict(contrat_grille("I36", "H32", "T420", debut="2024-06-01", fin="2026-05-31"), planning=p_mv,
              semaines_sans_accueil=OFF36_2024 + OFF36)
    S.append(sit("X-SANS-LUNDI-FIN-I36", "fin de contrat", ki,
                 [{"id": "f", "type": "fin", "notification": "2026-05-01", "motif": "retrait"}],
                 theme="retrait au 31 mai, contrat sans lundi (année incomplète)"))
    S.append(sit("X-A09-ABSENCE-ET-HEURES", "heures en plus", k, [mois("m", "2026-09")],
                 {"absences_am": [conge("am_malade", "2026-09-14", "2026-09-14")],
                  "jours": [{"date": "2026-09-15", "pres": [["08:00", "19:00"]]}]},
                 theme="AM absente un jour et heures en plus le lendemain"))
    S.append(sit("X-ENFANT-2-EPISODES", "absences", k, [mois("m", "2026-09")],
                 {"jours": [{"date": d, "abs": "malade_certif"} for d in
                            ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-21", "2026-09-22", "2026-09-23"]]},
                 theme="enfant malade avec certificat, deux fois 3 jours"))
    S.append(sit("X-KM-A37", "indemnités", dict(k, km_taux=45), [{"id": "m", "type": "mois", "mois": "2026-09", "sorties": ["km"]}],
                 {"jours": [{"date": d, "km": 10} for d in ["2026-09-07", "2026-09-08"]]},
                 theme="indemnités kilométriques au-dessus du barème plancher"))
    S.append(sit("X-DECES-6MOIS", "fin de contrat", contrat_grille("C52", "H40", "T420", debut="2026-03-02", fin="2026-09-15"),
                 [{"id": "f", "type": "fin", "notification": "2026-09-15", "motif": "deces",
                   "sorties": ["preavis", "indemnite_rupture"]}], theme="décès de l'enfant après 6 mois"))
    S += situations_t027()
    S += situations_s50b()  # T-050c
    S += situations_t076()  # T-076 : planning variable (PV-*) et CDD (CDD-*)
    S += situations_t076_d()  # T-076 : decisions D1 a D11, fins de contrat a planning variable (verification B)
    return S


def situations_t027():
    """T-027 : kilometres (controle du taux, partage) et evenements familiaux nommes.
    Aucun resultat attendu n'est calcule ici : A et B sont seulement compares."""
    S = []
    # 1. Controle du taux (CCN art. 57) : puissance x taux x date.
    for cv in (3, 4, 5, 6, 7, 8):
        for taux in (20, 33, 35, 40, 41, 42, 45, 53, 57, 64, 70, 80):
            for d in ("2025-09-08", "2026-05-29", "2026-09-07", "2027-03-01"):
                S.append(sit(f"KM-CTRL-{cv}CV-{taux}-{d}", "indemnités", contrat_grille("C52", "H40", "T420"),
                             [{"id": "c", "type": "km_controle", "cv": cv, "taux": taux, "date": d}],
                             theme="contrôle du taux kilométrique"))
    # 2. Montant du mois, avec et sans partage (CCN art. 113).
    k = contrat_grille("C52", "H40", "T420")
    cas = {
        "SEUL": [{"date": "2026-09-07", "km": 10, "km_partage": False}, {"date": "2026-09-08", "km": 12, "km_partage": False}],
        "SEUL-AUTRES-ENFANTS": [{"date": "2026-09-07", "km": 10, "km_partage": False, "km_enfants": 3}],
        "PARTAGE-NON-SAISI": [{"date": "2026-09-07", "km": 10}],
        "PARTAGE-2": [{"date": "2026-09-07", "km": 10, "km_partage": True, "km_enfants": 2}],
        "PARTAGE-3": [{"date": "2026-09-07", "km": 10, "km_partage": True, "km_enfants": 3}],
        "PARTAGE-3-30KM": [{"date": "2026-09-07", "km": 30, "km_partage": True, "km_enfants": 3}],
        "MIXTE": [{"date": "2026-09-07", "km": 10, "km_partage": False}, {"date": "2026-09-08", "km": 20, "km_partage": True, "km_enfants": 4}],
        "DECIMAL": [{"date": "2026-09-07", "km": 12.5, "km_partage": False}, {"date": "2026-09-08", "km": 7.5, "km_partage": False}],
        "MAI-JUIN": None,
    }
    cas.pop("MAI-JUIN")
    for nom, jours in cas.items():
        for cv, taux in ((5, 41), (5, 42), (6, 53), (4, 41)):
            S.append(sit(f"KM-MOIS-{nom}-{cv}CV-{taux}", "indemnités", dict(k, km_taux=taux, km_cv=cv),
                         [{"id": "m", "type": "mois", "mois": "2026-09", "sorties": ["km"]}], {"jours": jours},
                         theme="indemnités kilométriques du mois"))
    S.append(sit("KM-MOIS-2025-5CV-40", "indemnités", dict(k, km_taux=40, km_cv=5),
                 [{"id": "m", "type": "mois", "mois": "2025-10", "sorties": ["km"]}],
                 {"jours": [{"date": "2025-10-06", "km": 10, "km_partage": False}, {"date": "2025-10-07", "km": 15, "km_partage": True, "km_enfants": 2}]},
                 theme="indemnités kilométriques du mois (barème de base)"))
    # 3. Duree du conge, par evenement et par date.
    natures = ["mariage", "mariage_enfant", "naissance", "deces_enfant", "deces_enfant_14", "deces_proche",
               "handicap_enfant", "deces_descendant", "deces_ascendant", "deuil"]
    dates = ["2022-06-01", "2023-07-20", "2023-07-21", "2023-11-15", "2024-05-01", "2026-06-13", "2026-06-14", "2026-09-10"]
    for n in natures:
        for d in dates:
            S.append(sit(f"EVT-DUREE-{n}-{d}", "événements familiaux", contrat_grille("C52", "H40", "T420", debut="2022-01-03"),
                         [{"id": "e", "type": "evt_duree", "nature": n, "date": d}], theme="durée du congé pour événement familial"))
    # 4. Mois avec un conge nomme (planning du lundi au vendredi).
    conges_evt = {
        "NAISSANCE-3J": ("naissance", "2026-09-09", "2026-09-11"),
        "MARIAGE-4J": ("mariage", "2026-09-14", "2026-09-17"),
        "MARIAGE-DEPASSE": ("mariage", "2026-09-14", "2026-09-21"),
        "HANDICAP-10J": ("handicap_enfant", "2026-09-14", "2026-09-25"),
        "DECES-PROCHE-SAMEDI": ("deces_proche", "2026-09-10", "2026-09-14"),
        "DEUIL": ("deuil", "2026-09-14", "2026-09-18"),
        "DECES-ENFANT-14": ("deces_enfant_14", "2026-09-07", "2026-09-23"),
    }
    # 5. Evenements avant la loi du 19/07/2023 (contrat depuis janvier 2022).
    k22 = contrat_grille("C52", "H40", "T420", debut="2022-01-03")
    for nom, (nat, du, au) in {"DECES-ENFANT-2023-5J": ("deces_enfant", "2023-03-06", "2023-03-10"),
                               "DECES-ENFANT-2023-7J": ("deces_enfant", "2023-03-06", "2023-03-14"),
                               "HANDICAP-2023-3J": ("handicap_enfant", "2023-03-06", "2023-03-08"),
                               "DECES-ENFANT-14-2023": ("deces_enfant_14", "2023-03-06", "2023-03-17")}.items():
        S.append(sit(f"EVT-MOIS-2023-{nom}", "absences", k22, [mois("m", "2023-03")],
                     {"absences_am": [dict(conge("evenement", du, au), nature=nat)]},
                     theme="mois avec congé pour événement familial nommé (2023)"))
    for an in ("C52", "I46"):
        ka = contrat_grille(an, "H40", "T420")
        for nom, (nat, du, au) in conges_evt.items():
            S.append(sit(f"EVT-MOIS-{an}-{nom}", "absences", ka, [mois("m", "2026-09")],
                         {"absences_am": [dict(conge("evenement", du, au), nature=nat)]},
                         theme="mois avec congé pour événement familial nommé"))
    return S


# ---------------- T-050c : famille S50B (assiette du 1/80, A-45 ; regularisation dans le dixieme de fin, A-50)
S50B_MER = semaine([3], "08:00", "18:00")  # famille 1, annee incomplete : aucun mercredi ferie de 06/2025 a 10/2026
S50B_MAR = semaine([2], "08:00", "17:00")  # famille 2, annee incomplete : feries du mardi (11/11/2025, 14/07/2026) en semaine sans accueil
S50B_MAJE = semaine([2, 4], "08:00", "18:00")  # famille 2, annee complete
MARQUE_S50B = ("T-050c : assiette du 1/80 en brut, estimée par A depuis le taux net (rates.ts) ; l'adaptateur B "
               "convertit les mêmes montants de la même façon avant l'appel à B")


def situations_s50b():
    """T-050c : met a l'epreuve A-45 (ICCP, CP payes et regularisation dans l'assiette du 1/80) et A-50
    (regularisation due dans la base du dixieme de fin). Donnees choisies pour que les jours de conges soient surs
    dans les deux moteurs : annee complete sur une periode de reference entiere ; annee incomplete de 46 semaines
    dont les semaines comptees et les mois d'accueil donnent le meme nombre de jours (18 ou 30, multiples de 6).
    Toutes les semaines sans accueil de chaque annee de contrat sont saisies. Le deces de l'enfant (pas de preavis,
    CCN art. 119.4.2) evite la date de fin « a confirmer » du preavis de A ; le meme contrat est aussi donne en
    retrait ou en demission. Aucun resultat attendu n'est calcule ici."""
    S = []

    def fin_(id_, k, notif, motif, theme, ev=None):
        k = dict(k)
        if motif != "deces":
            k["rupture"] = {"motif": motif, "notif": notif, "preavis": "execute"}
        S.append(sit(id_, "fin de contrat", k,
                     [{"id": "f", "type": "fin", "notification": notif, "motif": motif, "comparer_assiette": True}],
                     ev, theme=theme, marques={"indemnite_rupture": MARQUE_S50B, "assiette_rupture": MARQUE_S50B}))

    def kc(pl, taux, deb, fin):
        return dict(contrat_grille("C52", "H32", "T420", debut=deb, fin=fin), planning=pl, taux=taux)

    def ki(pl, taux, deb, fin, off):
        return dict(contrat_grille("I46", "H40", "T420", debut=deb, fin=fin), planning=pl, taux=taux, semaines=46,
                    semaines_sans_accueil=sorted(off))

    # Annee complete (mardi a vendredi : le lundi de Pentecote ne bloque pas B, A-31).
    cp24 = [conge("cp", "2025-07-15", "2025-07-28"), conge("cp", "2025-08-19", "2025-09-01"),
            conge("cp", "2025-10-21", "2025-10-27")]
    fin_("S50B-C52-F1-1P-DECES", kc(PMaJ9, 420, "2025-06-01", "2026-05-31"), "2026-05-31", "deces",
         "année complète, une période entière, ICCP de la période en cours")
    fin_("S50B-C52-F2-1P-DECES", kc(S50B_MAJE, 500, "2025-06-01", "2026-05-31"), "2026-05-31", "deces",
         "année complète, une période entière, seconde famille")
    fin_("S50B-C52-F1-1P-RETRAIT", kc(PMaJ9, 420, "2025-06-01", "2026-05-31"), "2026-05-17", "retrait",
         "année complète, retrait au 31 mai")
    fin_("S50B-C52-F2-1P-RETRAIT", kc(S50B_MAJE, 500, "2025-06-01", "2026-05-31"), "2026-05-17", "retrait",
         "année complète, retrait au 31 mai, seconde famille")
    fin_("S50B-C52-F1-1P-DEMISSION", kc(PMaJ9, 420, "2025-06-01", "2026-05-31"), "2026-05-17", "demission",
         "année complète, démission au 31 mai")
    fin_("S50B-C52-F1-2P-PRIS-DECES", kc(PMaJ9, 420, "2024-06-01", "2026-05-31"), "2026-05-31", "deces",
         "année complète, deux périodes, congés de la première pris", {"absences_am": cp24})
    fin_("S50B-C52-F1-2P-NONPRIS-DECES", kc(PMaJ9, 420, "2024-06-01", "2026-05-31"), "2026-05-31", "deces",
         "année complète, deux périodes, ICCP des deux périodes")
    fin_("S50B-C52-F1-2P-MOITIE-DECES", kc(PMaJ9, 420, "2024-06-01", "2026-05-31"), "2026-05-31", "deces",
         "année complète, deux périodes, congés de la première pris en partie", {"absences_am": cp24[:1]})
    fin_("S50B-C52-F1-JUIN-DECES", kc(PMaJ9, 420, "2025-06-01", "2026-06-30"), "2026-06-30", "deces",
         "année complète, fin en cours de période (juin)")
    fin_("S50B-C52-F1-NOV-DECES", kc(PMaJ9, 420, "2025-01-06", "2025-11-30"), "2025-11-30", "deces",
         "année complète, fin en cours de période (novembre)")
    # Annee incomplete, 46 semaines. Famille 1 : mercredi, 10 h, 4,20 EUR. Famille 2 : mardi, 9 h, 5,00 EUR.
    for fam, pl, taux, ferie in (("F1", S50B_MER, 420, None), ("F2", S50B_MAR, 500, "2025-11-10")):
        # Contrat du 02/06/2025 au 31/05/2026 : 5 semaines sans accueil dans la periode, la 6e apres la fin (juin 2026).
        off = ["2025-08-04", ferie or "2025-10-27", "2025-12-22", "2026-02-16", "2026-04-13", "2026-06-01"]
        k = ki(pl, taux, "2025-06-02", "2026-05-31", off)
        fin_(f"S50B-I46-{fam}-FP-DECES", k, "2026-05-31", "deces",
             "année incomplète, fin au 31 mai, régularisation positive")
        if fam == "F1":
            fin_(f"S50B-I46-{fam}-FP-RETRAIT", k, "2026-05-17", "retrait",
                 "année incomplète, retrait au 31 mai, régularisation positive")
            fin_(f"S50B-I46-{fam}-FP-DEMISSION", k, "2026-05-17", "demission",
                 "année incomplète, démission au 31 mai")
            # Debut le 09/06/2025 : 4 semaines dans la periode, 2 apres la fin.
            off_b = ["2025-08-04", "2025-10-27", "2025-12-22", "2026-04-13", "2026-06-01", "2026-06-08"]
            fin_(f"S50B-I46-{fam}-FP-B-DECES", ki(pl, taux, "2025-06-09", "2026-05-31", off_b), "2026-05-31", "deces",
                 "année incomplète, fin au 31 mai, régularisation positive plus forte")
        # Contrat du 01/11/2025 : periode 2025 de 7 mois (18 jours), 2 semaines sans accueil de novembre a mai.
        a1 = [ferie or "2025-11-17", "2026-03-02"]
        fin_(f"S50B-I46-{fam}-7M-DECES", ki(pl, taux, "2025-11-01", "2026-05-31",
                                             a1 + ["2026-06-01", "2026-06-08", "2026-07-20", "2026-08-03"]),
             "2026-05-31", "deces", "année incomplète, une période de 7 mois, fin au 31 mai")
        # Fin au 28/06/2026, aucun accueil en juin : periode en cours sans jours, regularisation negative.
        fin_(f"S50B-I46-{fam}-NEG-DECES", ki(pl, taux, "2025-11-01", "2026-06-28",
                                              a1 + ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]),
             "2026-06-28", "deces", "année incomplète, fin en cours de période, régularisation négative")
        # Deux periodes : 18 jours payes en juin 2026, 30 jours de la periode 2026 non pris a la fin (31/05/2027).
        a1b = a1 + ["2026-06-01", "2026-06-08", "2026-07-13" if fam == "F2" else "2026-07-20", "2026-08-03"]
        a2 = ["2026-11-09", "2027-06-07", "2027-06-14", "2027-07-05", "2027-07-12", "2027-08-02"]
        k2 = ki(pl, taux, "2025-11-01", "2027-05-31", a1b + a2)
        fin_(f"S50B-I46-{fam}-2P-DECES", k2, "2027-05-31", "deces",
             "année incomplète, deux périodes, fin au 31 mai, régularisation positive")
        if fam == "F1":
            fin_(f"S50B-I46-{fam}-2P-RETRAIT", k2, "2027-05-01", "retrait",
                 "année incomplète, deux périodes, retrait au 31 mai")
        # Fin en cours de periode : contrat du 01/06/2026, 7 mois (18 jours), fin le 27/12/2026.
        fin_(f"S50B-I46-{fam}-DEC-DECES", ki(pl, taux, "2026-06-01", "2026-12-27",
                                              [("2026-07-13" if fam == "F2" else "2026-08-03"), "2026-11-09",
                                               "2027-02-15", "2027-02-22", "2027-04-12", "2027-04-19"]),
             "2026-12-27", "deces", "année incomplète, fin en cours de période (décembre)")
    return S


# ---------------- T-076 (passage 1) : planning variable et CDD
# Format : regles/t076-decisions-direction.md, sections 1 et 2. Aucun resultat attendu n'est calcule ici.
# Planning variable : contrat `planning_variable: true`, `cycle` + `cycle_ancre` (S1) ou `plannings_semaines` (S2),
# `heures_mensualisees` (heures ecrites au contrat). `planning` garde la premiere semaine du cycle (S1) ou une semaine
# moyenne indicative (S2), comme l'ecran ; le calcul ne s'en sert pas.
PV_A45 = semaine(L5, "08:00", "17:00")            # 45 h
PV_B15 = semaine(L5, "08:00", "11:00")            # 15 h
PV_C30 = semaine(L5, "08:00", "14:00")            # 30 h
PV_B12 = semaine([1, 2, 4, 5], "08:00", "11:00")  # 12 h, sans mercredi
PV_A50 = semaine(L5, "08:00", "18:00")            # 50 h (semaine prevue au-dela de 45 h)
PV_B10 = semaine([1, 2], "08:00", "13:00")        # 10 h
# Ancre : lundi 7 septembre 2026 = premiere semaine type. Les semaines a cheval sur aout-septembre, septembre-octobre
# et octobre-novembre suivent alors la deuxieme semaine type.
PV_ANCRE = "2026-09-07"
# cycle : (semaines types, heures mensualisees L1 et L2 en 52 semaines, puis en 36 semaines). Moyenne x 52 / 12.
PV_CYCLES = {
    "AB": ([PV_A45, PV_B15], {"C52": {"L1": 130, "L2": 65}, "I36": {"L1": 90, "L2": 45}}),
    "ABC": ([PV_A45, PV_B15, PV_C30], {"C52": {"L1": 130, "L2": 65}, "I36": {"L1": 90, "L2": 45}}),
    "AB12": ([PV_A45, PV_B12], {"C52": {"L1": 123.5, "L2": 52}, "I36": {"L1": 85.5, "L2": 36}}),
}
MARQUE_PV = "T-076 : planning variable (decisions de la direction, section 1)"
MARQUE_CDD = "T-076 : CDD (decisions de la direction, section 2)"


def contrat_pv(an, cycle, hm, debut="2025-09-01", **kw):
    k = contrat_grille(an, "H40", "T500", debut=debut, majoration_hm=25)
    k.update({"planning": cycle[0], "planning_variable": True, "cycle": cycle, "cycle_ancre": PV_ANCRE,
              "heures_mensualisees": hm})
    k.update(kw)
    return k


def contrat_pv_s2(an, plannings, hm, debut="2026-08-31", **kw):
    k = contrat_grille(an, "H40", "T500", debut=debut, majoration_hm=25)
    k.update({"planning": PV_C30, "planning_variable": True, "plannings_semaines": plannings,
              "heures_mensualisees": hm})
    k.update(kw)
    return k


def situations_t076():
    S = []
    m = {"*": MARQUE_PV}
    # ---- S1 : cycles ancres, 52 semaines et 36 semaines, bases L1 et L2
    for nom, (cyc, hms) in PV_CYCLES.items():
        for an in ("C52", "I36"):
            for base in ("L1", "L2"):
                k = contrat_pv(an, cyc, hms[an][base])
                b = f"PV-{an}-{nom}-{base}"
                # Fevrier 2027 commence un lundi et finit un dimanche : aucune semaine a cheval sur deux mois.
                S.append(sit(f"{b}-S01", "planning variable", k, [mois("sep", "2026-09"), mois("oct", "2026-10"),
                                                                  mois("fev27", "2027-02")],
                             theme="mois ordinaires (cycle ancre)", marques=m))
                if nom == "ABC" and base == "L2":
                    continue  # cycle de 3 semaines : les semaines a cheval de septembre portent des HC (refus du comparateur)
                S.append(sit(f"{b}-S04", "planning variable", k, [mois("m", "2026-09")],
                             {"jours": [{"date": d, "abs": "parents"} for d in ["2026-09-08", "2026-09-09"]]},
                             theme="enfant absent à la demande des parents (semaine type 1)", marques=m))
                S.append(sit(f"{b}-S07A", "planning variable", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("am_malade", "2026-09-07", "2026-09-08")]},
                             theme="AM malade 2 jours d'une semaine longue", marques=m))
                S.append(sit(f"{b}-S07B", "planning variable", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("am_malade", "2026-09-14", "2026-09-15")]},
                             theme="AM malade 2 jours d'une semaine courte", marques=m))
                S.append(sit(f"{b}-S08", "planning variable", k, [mois("m", "2026-09")],
                             {"absences_am": [conge("sans_solde", "2026-09-14", "2026-09-18")]},
                             theme="AM en congé sans solde une semaine courte", marques=m))
                # Heures en plus : semaine courte du 14/09 (+2 h lundi et mardi) ; semaine longue du 21/09 (+2 h lundi).
                d0 = cyc[1]["1"][0][0]
                pres = [{"date": "2026-09-14", "pres": [[d0, heure_plus(cyc[1]["1"][0][1], 120)]]},
                        {"date": "2026-09-15", "pres": [[d0, heure_plus(cyc[1]["2"][0][1], 120)]]},
                        {"date": "2026-09-21", "pres": [["08:00", "19:00"]]}]
                S.append(sit(f"{b}-S10", "planning variable", k, [mois("m", "2026-09")], {"jours": pres},
                             theme="heures complémentaires (semaine courte) et majorées (semaine longue de 47 h)",
                             marques=m))
                if base == "L1":
                    S.append(sit(f"{b}-S02", "planning variable", k, [mois("m", "2026-11")],
                                 theme="mois avec le 11 novembre (semaine type 2)", marques=m))
                    S.append(sit(f"{b}-S03", "planning variable", k, [mois("m", "2026-11")],
                                 {"absences_am": [conge("am_malade", "2026-11-10", "2026-11-10")]},
                                 theme="11 novembre et AM malade la veille", marques=m))
            if an == "C52":
                # Conges : periode de reference 2025 entiere (contrat du 01/06/2025), 30 jours pris du 24/08 au 26/09/2026.
                kc = contrat_pv(an, cyc, hms[an]["L1"], debut="2025-06-01")
                ev = {"absences_am": [conge("cp", "2026-08-24", "2026-09-26")]}
                S.append(sit(f"PV-{an}-{nom}-L1-S14", "planning variable", kc,
                             [{"id": "acq", "type": "cp_acquisition", "periode": 2025},
                              {"id": "ind", "type": "cp_indemnite", "periode": 2025, "sorties": ["indemnite_cp"]},
                              {"id": "juin", "type": "cp_mois", "mois": "2026-06"},
                              mois("aout", "2026-08"), mois("sep", "2026-09"),
                              {"id": "d", "type": "cp_decompte", "du": "2026-08-24", "au": "2026-09-26",
                               "reprise": "2026-09-28"}], ev,
                             theme="congés payés : maintien en deux lectures C1 et C2 (P-PV-5)", marques=m))
    # Base a une minute pres (cycle 45 h / 20 h : 140,8333 h ; contrat 140,83 h) : lecture L1.
    pv_b20 = semaine([1, 2, 3, 4], "08:00", "13:00")
    S.append(sit("PV-C52-AB20-L1-ARRONDI-S01", "planning variable", contrat_pv("C52", [PV_A45, pv_b20], 140.83),
                 [mois("m", "2026-09")], theme="heures mensualisées arrondies au centième (L1 à une minute près)",
                 marques=m))
    # Semaine prevue au-dela de 45 h (P-PV-3) : contrat refuse.
    S.append(sit("PV-C52-A50-S01", "planning variable", contrat_pv("C52", [PV_A50, PV_B10], 130),
                 [mois("m", "2026-09")], theme="cycle avec une semaine prévue de 50 h", marques=m))
    # ---- S2 : planning remis semaine par semaine (du 31/08 au 30/11/2026)
    lundis = [(date(2026, 8, 31) + timedelta(weeks=i)).isoformat() for i in range(14)]
    p25, p35, p20, p40 = (semaine(L5, "08:00", "13:00"), semaine(L5, "08:00", "15:00"),
                          semaine([1, 2, 3, 4], "08:00", "13:00"), P5x8)
    rotation = [PV_C30, p25, p35, p20, p40, PV_C30, p25, p35, PV_B12, p40, PV_C30, p25, p35, PV_C30]
    pl = {l: p for l, p in zip(lundis, rotation)}  # semaine du 09/11 : sans mercredi (11 novembre non prevu)
    pl_mer = dict(pl, **{"2026-11-09": PV_C30})     # meme contrat, 11 novembre prevu
    mois3 = [mois("sep", "2026-09"), mois("oct", "2026-10"), mois("nov", "2026-11")]
    S.append(sit("PV-C52-S2-S01", "planning variable", contrat_pv_s2("C52", pl, 130), mois3,
                 theme="planning remis semaine par semaine (11 novembre non prévu)", marques=m))
    S.append(sit("PV-C52-S2-S02", "planning variable", contrat_pv_s2("C52", pl_mer, 130), mois3,
                 {"absences_am": [conge("am_malade", "2026-11-12", "2026-11-12")]},
                 theme="planning remis, 11 novembre prévu et AM malade le lendemain", marques=m))
    S.append(sit("PV-C52-S2-S07", "planning variable", contrat_pv_s2("C52", pl, 130), [mois("m", "2026-09")],
                 {"absences_am": [conge("am_malade", "2026-09-14", "2026-09-16")]},
                 theme="planning remis, AM malade 3 jours", marques=m))
    S.append(sit("PV-C52-S2-S10", "planning variable", contrat_pv_s2("C52", pl, 130), [mois("m", "2026-10")],
                 {"jours": [{"date": "2026-10-05", "pres": [["08:00", "16:00"]]},
                            {"date": "2026-10-13", "pres": [["08:00", "18:00"]]},
                            {"date": "2026-10-14", "pres": [["08:00", "18:00"]]}]},
                 theme="planning remis, heures complémentaires sur le planning de la semaine", marques=m))
    sans = dict(pl, **{"2026-10-19": {}})
    S.append(sit("PV-C52-S2-SANS-ACCUEIL", "planning variable", contrat_pv_s2("C52", sans, 130),
                 [mois("m", "2026-10")], {"absences_am": [conge("am_malade", "2026-10-06", "2026-10-06")]},
                 theme="planning remis, semaine « sans accueil » (0 h) et absence dans le mois", marques=m))
    manque = {l: p for l, p in pl.items() if l != "2026-09-14"}
    S.append(sit("PV-C52-S2-MANQUE", "planning variable", contrat_pv_s2("C52", manque, 130),
                 [mois("sep", "2026-09"), mois("oct", "2026-10")],
                 theme="planning remis, une semaine de septembre sans planning saisi", marques=m))
    S.append(sit("PV-C52-S2-PLUS45H", "planning variable", contrat_pv_s2("C52", dict(pl, **{"2026-10-12": PV_A50}), 130),
                 [mois("m", "2026-09"), mois("oct", "2026-10")],
                 theme="planning remis, une semaine prévue de 50 h en octobre (seul octobre est refusé)", marques=m))
    off_s2 = ["2026-10-19", "2026-10-26"]
    pl_i = dict(pl, **{l: {} for l in off_s2})
    S.append(sit("PV-I36-S2-S01", "planning variable",
                 contrat_pv_s2("I36", pl_i, 90, semaines_sans_accueil=off_s2), [mois("m", "2026-10")],
                 {"absences_am": [conge("am_malade", "2026-10-06", "2026-10-07")]},
                 theme="planning remis, 36 semaines, mois avec semaines sans accueil et absence", marques=m))

    # ---- CDD
    mc = {"*": MARQUE_CDD}

    def kcdd(debut, terme, fin=None, an="C52", **kw):
        k = contrat_grille(an, "H40", "T420", debut=debut, fin=fin or terme)
        k.update({"cdd": True, "cdd_terme": terme, "cdd_motif": "remplacement"})
        k.update(kw)
        return k

    def fin_cdd(fin, fc, mois_=()):
        return [mois(f"m{i}", x) for i, x in enumerate(mois_)] + [
            {"id": "f", "type": "fin", "date": fin, "motif": "fin_cdd", "fin_cdd": fc}]

    k = kcdd("2026-01-05", "2026-05-29")
    S.append(sit("CDD-TERME", "CDD", k, fin_cdd("2026-05-29", "terme", ["2026-01", "2026-05"]),
                 theme="CDD de 5 mois au terme", marques=mc))
    for fc in ("suite_cdi", "refus_cdi", "commun_accord", "employeur", "force_majeure", "inaptitude"):
        S.append(sit(f"CDD-FIN-{fc.upper()}", "CDD", kcdd("2026-01-05", "2026-05-29"),
                     fin_cdd("2026-05-29", fc), theme=f"CDD, fin « {fc} » (R-CDD-08)", marques=mc))
    for fc, fin in (("initiative_am", "2026-04-30"), ("faute_grave", "2026-04-15"), ("commun_accord", "2026-04-30"),
                    ("employeur", "2026-04-30"), ("essai", "2026-01-09")):
        S.append(sit(f"CDD-ANTICIPE-{fc.upper()}", "CDD", kcdd("2026-01-05", "2026-05-29", fin=fin),
                     fin_cdd(fin, fc, [fin[:7]]), theme=f"CDD rompu avant le terme, « {fc} » (R-CDD-08)", marques=mc))
    S.append(sit("CDD-12MOIS", "CDD", kcdd("2025-06-01", "2026-05-31"), fin_cdd("2026-05-31", "terme", ["2026-05"]),
                 theme="CDD de 12 mois, période de référence entière (P3)", marques=mc))
    S.append(sit("CDD-DEUX-PERIODES", "CDD", kcdd("2026-03-02", "2026-07-31"), fin_cdd("2026-07-31", "terme"),
                 theme="CDD à cheval sur le 1er juin (deux périodes de référence)", marques=mc))
    S.append(sit("CDD-URSSAF-2MOIS", "CDD", kcdd("2026-01-01", "2026-02-28"),
                 fin_cdd("2026-02-28", "terme", ["2026-01", "2026-02"]),
                 theme="CDD du 1er janvier au 28 février (forme de l'exemple Urssaf E-CDD-01)", marques=mc))
    # Moins d'un mois (P1) ; un mois de date a date (pas P1).
    S.append(sit("CDD-MOINS-1-MOIS", "CDD", kcdd("2026-09-07", "2026-09-25"), fin_cdd("2026-09-25", "terme", ["2026-09"]),
                 theme="CDD de moins d'un mois (P1)", marques=mc))
    S.append(sit("CDD-MOINS-1-MOIS-2-MOIS-CIVILS", "CDD", kcdd("2026-09-21", "2026-10-09"),
                 fin_cdd("2026-10-09", "terme", ["2026-09", "2026-10"]),
                 theme="CDD de moins d'un mois sur deux mois civils (P1)", marques=mc))
    S.append(sit("CDD-MOINS-1-MOIS-HC", "CDD", kcdd("2026-09-07", "2026-09-25"), fin_cdd("2026-09-25", "terme", ["2026-09"]),
                 {"jours": [{"date": "2026-09-08", "pres": [["08:00", "18:00"]]}]},
                 theme="CDD de moins d'un mois avec 2 h complémentaires (P1)", marques=mc))
    S.append(sit("CDD-UN-MOIS", "CDD", kcdd("2026-09-01", "2026-09-30"), fin_cdd("2026-09-30", "terme", ["2026-09"]),
                 theme="CDD d'un mois de date à date (pas P1)", marques=mc))
    # Semaines sans accueil (P2) : du 05/01 au 29/03/2026, 12 semaines dont 1 sans accueil (16/02) : 11 semaines
    # programmees ecrites au contrat (sans ferie dans la periode).
    kp2 = kcdd("2026-01-05", "2026-03-29", an="I36", semaines=11, semaines_sans_accueil=["2026-02-16"])
    S.append(sit("CDD-SANS-ACCUEIL", "CDD", kp2, fin_cdd("2026-03-29", "terme", ["2026-01", "2026-02", "2026-03"]),
                 theme="CDD avec une semaine sans accueil (P2)", marques=mc))
    kp2b = kcdd("2026-01-05", "2026-03-29", an="I36", semaines=10, semaines_sans_accueil=["2026-02-16", "2026-03-02"])
    S.append(sit("CDD-SANS-ACCUEIL-2", "CDD", kp2b, fin_cdd("2026-03-29", "terme", ["2026-02", "2026-03"]),
                 theme="CDD avec deux semaines sans accueil (P2)", marques=mc))
    S.append(sit("CDD-SANS-ACCUEIL-HC", "CDD", kp2, fin_cdd("2026-03-29", "terme", ["2026-01"]),
                 {"jours": [{"date": "2026-01-13", "pres": [["08:00", "18:00"]]}]},
                 theme="CDD avec semaine sans accueil et heures complémentaires (P2)", marques=mc))
    # Heures en plus, entretien et repas (hors assiette de l'IFC).
    S.append(sit("CDD-HC-HM", "CDD", kcdd("2026-09-01", "2026-10-30"),
                 fin_cdd("2026-10-30", "terme", ["2026-09", "2026-10"]),
                 {"jours": [{"date": "2026-09-08", "pres": [["08:00", "18:00"]]}]
                  + [{"date": d, "pres": [["07:00", "17:00"]]} for d in jours_ouvres("2026-09-14", "2026-09-18")]},
                 theme="CDD avec heures complémentaires et majorées", marques=mc))
    S.append(sit("CDD-ENTRETIEN-REPAS", "CDD", kcdd("2026-09-01", "2026-10-30", repas_par_jour=2, entretien_jour=500),
                 fin_cdd("2026-10-30", "terme", ["2026-09", "2026-10"]),
                 theme="CDD : entretien et repas hors de l'assiette de l'IFC", marques=mc))
    return S


def situations_t076_d():
    """T-076, apres les verificateurs : decisions D1 a D10 (regles/t076-decisions-direction.md, section 4), fins de
    contrat CDI a planning variable (R-PV-07, R-PV-13), lignes de R-CDD-08 manquantes, conges. Aucun resultat
    attendu n'est calcule ici."""
    S = []
    m = {"*": MARQUE_PV}
    mc = {"*": MARQUE_CDD}
    AB = [PV_A45, PV_B15]
    ABC = [PV_A45, PV_B15, PV_C30]

    def fin_pv(id_, k, notif, motif, theme, ev=None, sorties=None):
        k = dict(k)
        if motif != "deces":
            k["rupture"] = {"motif": motif, "notif": notif, "preavis": "execute"}
        c = {"id": "f", "type": "fin", "notification": notif, "motif": motif}
        if sorties:
            c["sorties"] = sorties
        S.append(sit(id_, "planning variable", k, [c], ev, theme=theme, marques=m))

    # ---- Fins de contrat CDI a planning variable (R-PV-07, R-PV-13 ; B2, B3)
    k12 = contrat_pv("C52", AB, 130, debut="2025-06-01", fin="2026-05-31")
    fin_pv("PV-FIN-C52-AB-L1-12MOIS-RETRAIT", k12, "2026-05-01", "retrait",
           "fin d'un CDI à planning variable, 52 semaines, période entière, retrait (ICCP C1)")
    fin_pv("PV-FIN-C52-AB-L1-12MOIS-DECES", k12, "2026-05-31", "deces",
           "fin d'un CDI à planning variable, 52 semaines, période entière, décès de l'enfant")
    # Contrats courts du 05/01 au 29/03/2026 (ancre 05/01 : les semaines à cheval sur deux mois sont des semaines B).
    for an, base, hm in (("C52", "L1", 130), ("C52", "L2", 65), ("I36", "L1", 90), ("I36", "L2", 45)):
        # Direction T-076 (22/11) : en 46 semaines ou moins, un début le 05/01 laisse les 01-02/01 hors contrat dans une
        # semaine sans accueil ; A les déduit du premier mois, B non (point ouvert T-076, registre ; même question en
        # planning fixe). Les contrats I36 commencent donc le 01/01 : la régularisation de fin est comparée sans ce point.
        k = contrat_pv(an, AB, hm, debut="2026-01-01" if an == "I36" else "2026-01-05", fin="2026-03-29",
                       cycle_ancre="2026-01-05")
        fin_pv(f"PV-FIN-{an}-AB-{base}-COURT-DECES", k, "2026-03-29", "deces",
               f"fin d'un CDI à planning variable ({an}, {base}), régularisation de fin")
    k = contrat_pv("C52", AB, 130, debut="2026-01-05", fin="2026-02-08", cycle_ancre="2026-01-05")
    fin_pv("PV-FIN-C52-AB-L1-PLUS-DE-A", k, "2026-02-08", "deces",
           "52 semaines, fin après trois semaines A et deux B : aucune régularisation (R-PV-07)")
    lundis = [(date(2026, 8, 31) + timedelta(weeks=i)).isoformat() for i in range(14)]
    p25, p35, p20 = (semaine(L5, "08:00", "13:00"), semaine(L5, "08:00", "15:00"), semaine([1, 2, 3, 4], "08:00", "13:00"))
    rot = [PV_C30, p25, p35, p20, P5x8, PV_C30, p25, p35, PV_B12, P5x8, PV_C30, p25, p35, PV_C30]
    pl = {l: p for l, p in zip(lundis, rot)}
    fin_pv("PV-FIN-C52-S2-DECES", contrat_pv_s2("C52", pl, 130, debut="2026-09-07", fin="2026-11-29"), "2026-11-29", "deces",
           "fin d'un CDI à planning remis semaine par semaine")

    # ---- Conges a planning variable
    S.append(sit("PV-C52-AB12-L1-CP-MERCREDI", "planning variable", contrat_pv("C52", [PV_A45, PV_B12], 123.5),
                 [{"id": "d", "type": "cp_decompte", "du": "2026-09-16", "au": "2026-09-19", "reprise": "2026-09-21"}],
                 theme="congé commencé un mercredi non prévu d'une semaine B (R-PV-09)", marques=m))
    S.append(sit("PV-C52-S2-CP-VENDREDI", "planning variable", contrat_pv_s2("C52", pl, 130),
                 [{"id": "d", "type": "cp_decompte", "du": "2026-09-24", "au": "2026-09-26", "reprise": "2026-09-28"}],
                 theme="planning remis : congé du jeudi au samedi d'une semaine du lundi au jeudi (R-PV-09)", marques=m))
    kc = contrat_pv("C52", AB, 130, debut="2025-06-01", age_am=20, enfants_a_charge=2)
    S.append(sit("PV-C52-AB-L1-S14-ENFANTS", "planning variable", kc,
                 [{"id": "acq", "type": "cp_acquisition", "periode": 2025},
                  {"id": "ind", "type": "cp_indemnite", "periode": 2025, "sorties": ["indemnite_cp"]}],
                 {"absences_am": [conge("cp", "2026-08-24", "2026-10-01")]},
                 theme="congés payés avec jours pour enfants à charge, 34 jours pris (CP-SUPP)", marques=m))
    ki = contrat_pv("I36", AB, 90, debut="2025-06-01")
    S.append(sit("PV-I36-AB-L1-S15", "planning variable", ki,
                 [{"id": "acq", "type": "cp_acquisition", "periode": 2025},
                  {"id": "ind", "type": "cp_indemnite", "periode": 2025, "sorties": ["indemnite_cp"]},
                  {"id": "juin", "type": "cp_mois", "mois": "2026-06"}],
                 {"absences_am": [conge("cp", "2026-08-03", "2026-08-15")]},
                 theme="congés payés en 36 semaines (planning variable)", marques=m))

    # ---- D1 : L2, 1er mai chome (CCN 47.1) et autre ferie chome (deux lectures) ; mai 2028 commence un lundi.
    S.append(sit("PV-C52-ABC-L2-D1-MAI-2028", "planning variable",
                 contrat_pv("C52", ABC, 65, cycle_ancre="2028-05-01"), [mois("m", "2028-05")],
                 theme="L2 : 1er mai chômé d'une semaine longue, 8 mai et Ascension (D1)", marques=m))
    # Direction T-076 (22/11) : mois de mai 2028 passé (sinon A ne compte ni présence ni repas d'un jour futur).
    S[-1]["aujourdhui"] = "2028-06-30"
    # Fevrier 2027 commence un lundi : semaine du 08/02 = semaine A (ancre du 07/09/2026).
    k27 = contrat_pv("C52", AB, 65)
    S.append(sit("PV-C52-AB-L2-D1-EVENEMENT", "planning variable", k27, [mois("m", "2027-02")],
                 {"absences_am": [dict(conge("evenement", "2027-02-09", "2027-02-11"), nature="naissance")]},
                 theme="L2 : congé de naissance payé dans une semaine longue (D1)", marques=m))
    S.append(sit("PV-C52-AB-L2-D1-ENFANT-ABSENT", "planning variable", k27, [mois("m", "2027-02")],
                 {"jours": [{"date": d, "abs": "parents"} for d in ["2027-02-09", "2027-02-10"]]},
                 theme="L2 : enfant absent (payé) dans une semaine longue", marques=m))
    # ---- D2 : absence retenue dans une semaine prevue au-dela de la base
    S.append(sit("PV-C52-AB-L2-D2-MALADE", "planning variable", k27, [mois("m", "2027-02")],
                 {"absences_am": [conge("am_malade", "2027-02-09", "2027-02-10")]},
                 theme="L2 : AM malade 2 jours d'une semaine longue (D2)", marques=m))
    # ---- D4 : premiere et derniere semaine incompletes (L2)
    S.append(sit("PV-C52-AB-L2-D4-DEBUT", "planning variable",
                 contrat_pv("C52", AB, 65, debut="2027-02-03", cycle_ancre="2027-02-01"), [mois("m", "2027-02")],
                 theme="L2 : contrat commencé un mercredi d'une semaine longue (D4)", marques=m))
    S.append(sit("PV-C52-AB-L2-D4-FIN", "planning variable",
                 contrat_pv("C52", AB, 65, fin="2027-02-24", cycle_ancre="2027-02-08"), [mois("m", "2027-02")],
                 theme="L2 : contrat fini un mercredi d'une semaine longue (D4)", marques=m))

    # ---- CDD
    def kcdd(debut, terme, fin=None, an="C52", **kw):
        k = contrat_grille(an, "H40", "T420", debut=debut, fin=fin or terme)
        k.update({"cdd": True, "cdd_terme": terme, "cdd_motif": "remplacement"})
        k.update(kw)
        return k

    def fin_cdd(fin, fc, mois_=()):
        return [mois(f"m{i}", x) for i, x in enumerate(mois_)] + [
            {"id": "f", "type": "fin", "date": fin, "motif": "fin_cdd", "fin_cdd": fc}]

    # Lignes de R-CDD-08 manquantes
    S.append(sit("CDD-FIN-RENOUVELE", "CDD", kcdd("2026-01-05", "2026-06-26", cdd_renouvellements=1,
                                                  cdd_terme_initial="2026-04-30"),
                 fin_cdd("2026-06-26", "terme"), theme="CDD renouvelé une fois, au terme final (R-CDD-08, L1243-13-1)",
                 marques=mc))
    for fc in ("jeune_vacances", "saisonnier"):
        S.append(sit(f"CDD-FIN-{fc.upper()}", "CDD", kcdd("2026-01-05", "2026-05-29"), fin_cdd("2026-05-29", fc),
                     theme=f"CDD, fin « {fc} » (R-CDD-08, non géré)", marques=mc))
    # D3
    kpv = kcdd("2026-01-05", "2026-03-29", an="I36", semaines=11, semaines_sans_accueil=["2026-02-16"])
    kpv.update({"planning": PV_A45, "planning_variable": True, "cycle": AB, "cycle_ancre": "2026-01-05",
                "heures_mensualisees": 55})
    S.append(sit("CDD-D3-PV-SANS-ACCUEIL", "CDD", kpv, fin_cdd("2026-03-29", "terme", ["2026-02"]),
                 theme="CDD à planning variable avec semaine sans accueil (D3)", marques=mc))
    S.append(sit("CDD-D3-P1-P2", "CDD", kcdd("2026-09-07", "2026-09-25", an="I36", semaines=2,
                                             semaines_sans_accueil=["2026-09-14"]),
                 fin_cdd("2026-09-25", "terme", ["2026-09"]), theme="CDD de moins d'un mois avec semaine sans accueil (D3)",
                 marques=mc))
    S.append(sit("CDD-PV-C52", "CDD", dict(kcdd("2026-01-05", "2026-03-29"), planning=PV_A45, planning_variable=True,
                                           cycle=AB, cycle_ancre="2026-01-05", heures_mensualisees=130),
                 fin_cdd("2026-03-29", "terme", ["2026-01", "2026-03"]), theme="CDD à planning variable, 52 semaines",
                 marques=mc))
    # D7 : P1, ferie chome et absence remuneree de l'enfant dans les heures reelles
    S.append(sit("CDD-D7-FERIE-ENFANT", "CDD", kcdd("2026-11-02", "2026-11-20"), fin_cdd("2026-11-20", "terme", ["2026-11"]),
                 {"jours": [{"date": "2026-11-16", "abs": "parents"}]},
                 theme="CDD de moins d'un mois avec le 11 novembre et une absence de l'enfant (D7)", marques=mc))
    # D8 : P2 suivi d'un CDI
    kp2 = kcdd("2026-01-05", "2026-03-29", an="I36", semaines=11, semaines_sans_accueil=["2026-02-16"])
    S.append(sit("CDD-SANS-ACCUEIL-SUITE-CDI", "CDD", kp2, fin_cdd("2026-03-29", "suite_cdi"),
                 theme="CDD avec semaine sans accueil suivi d'un CDI (D8)", marques=mc))
    # D9
    S.append(sit("CDD-D9-ANTICIPE-AU-TERME", "CDD", kcdd("2026-01-05", "2026-05-29"),
                 fin_cdd("2026-05-29", "initiative_am"), theme="fin « à ta demande » le jour du terme (D9)", marques=mc))
    S.append(sit("CDD-D9-APRES-TERME", "CDD", kcdd("2026-01-05", "2026-05-29", fin="2026-06-05"),
                 fin_cdd("2026-06-05", "terme"), theme="travail après le terme sans CDI signé (D9, L1243-11)", marques=mc))
    # D10 : P2 a cheval sur le 1er juin
    S.append(sit("CDD-D10-P2-1ER-JUIN", "CDD",
                 kcdd("2026-04-27", "2026-06-28", an="I36", semaines=8, semaines_sans_accueil=["2026-05-11"]),
                 fin_cdd("2026-06-28", "terme"), theme="CDD avec semaine sans accueil, à cheval sur le 1er juin (D10)",
                 marques=mc))
    S.append(sit("CDD-D10-1ER-JUIN-COMMUN-ACCORD", "CDD", kcdd("2026-03-02", "2026-07-31", fin="2026-06-30"),
                 fin_cdd("2026-06-30", "commun_accord"), theme="CDD à cheval sur le 1er juin, rompu d'un commun accord (D10)",
                 marques=mc))
    return S


def main():
    os.makedirs(SORTIE, exist_ok=True)
    o = officiels()
    g = grille()
    with open(os.path.join(SORTIE, "officiels.json"), "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False, indent=1)
    with open(os.path.join(SORTIE, "grille.json"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, indent=1)
    cas = sorted({s["cas"] for s in o})
    print(f"officiels : {len(o)} situations, {len(cas)} cas ; grille : {len(g)} situations")


if __name__ == "__main__":
    main()
