"""Contrat regulier a planning variable (T-076, passage 1).

Sources : regles/t076-planning-variable.md (regles R-PV-01 a R-PV-13, points
P-PV-1 a P-PV-6) ; choix de calcul : regles/t076-decisions-direction.md,
section 1. Aucune regle nouvelle : chaque fonction cite son article.

Representation d'un planning de semaine : {0: lundi, ..., 6: dimanche} ->
minutes prevues ce jour (entiers). Deux formes de contrat (decisions, 1) :
- S1 : cycle de 2 a 4 semaines types ancre sur un lundi (cycle_ancre) ;
- S2 : planning remis semaine par semaine (cle : lundi de la semaine).

Point a confirmer : la part sure est payee (plus petite lecture), l'ecart est
donne « a confirmer » a cote (decisions, preambule).
"""

from datetime import date, timedelta
from fractions import Fraction

from .commun import (
    NonGere, ErreurSaisie, api, resultat_ok, exact, positif, entier,
    vers_centimes, texte_fraction, type_annee_valide, verifier_date_ccn,
)
from .calendrier import jours_du_mois, jours_feries
from .mensualisation import _type_annee
from .heures import SEUIL_45H, MAJORATION_MINIMALE_HM

MESSAGE_BASE = ("La base des heures complementaires est celle de votre contrat (heures mensualisees "
                "ecrites au contrat, CASF D423-5, 14°). Question DDETS P-PV-1 notee (liceite de la base).")
QUESTION_P_PV_5 = ("Maintien des conges payes avec un horaire variable : duree habituelle moyenne (C1) ou "
                   "heures prevues des jours de conge (C2) ? Question DDETS P-PV-5 notee.")


def _planning(p, nom="planning"):
    """Planning d'une semaine : {jour 0..6 : minutes entieres >= 0}."""
    if not isinstance(p, dict):
        raise ErreurSaisie(f"{nom} : dictionnaire {{0..6 : minutes}} attendu.")
    out = {}
    for k, v in p.items():
        j = int(k)
        if j < 0 or j > 6:
            raise ErreurSaisie(f"{nom} : jour {k} hors de 0 (lundi) a 6 (dimanche).")
        out[j] = entier(v, f"{nom}[{k}]")
    return out


def _total(p):
    return sum(p.values())


def _lundi(d, nom):
    if not isinstance(d, date):
        raise ErreurSaisie(f"{nom} : date attendue.")
    if d.weekday() != 0:
        raise ErreurSaisie(f"{nom} : un lundi est attendu ({d.isoformat()}).")
    return d


def _refus_plus_45h(plannings, regles):
    """P-PV-3 (decisions, 1 : « Semaine PREVUE au-dela de 45 h : non calculee au
    passage 1, le contrat reste refuse avec un message precis »). CCN 96.4,
    110.1 ; CASF D423-10 : la majoration est due, sa place (lissee ou payee le
    mois) n'est pas tranchee (A-13 du projet)."""
    for nom, p in plannings:
        if _total(p) > SEUIL_45H:
            raise NonGere("PV-SEMAINE-PREVUE-PLUS-45H", regles + ["R-PV-05", "P-PV-3"],
                          precision=f"Semaine prevue au-dela de 45 h ({nom} : {texte_fraction(Fraction(_total(p), 60))} h).")


@api("R-PV-02", "R-PV-04", "P-PV-4")
def semaine_prevue(lundi, cycle=None, cycle_ancre=None, plannings_semaines=None):
    """Planning prevu de la semaine du lundi donne.
    S1 (CCN 90.1 et 98.1.1 : periodes « determinees » au contrat) : la semaine
    du lundi L suit la semaine type n° ((L - cycle_ancre) / 7) modulo la
    longueur du cycle, y compris pendant les semaines sans accueil, les conges
    et les absences (lecture Q1 de P-PV-4, retenue par la direction parce que
    le contrat fixe l'ancrage, R-PV-02).
    S2 (CCN 98.1.2 : planning ecrit remis) : planning saisi pour ce lundi. Une
    semaine sans planning saisi : refus PV-SEMAINE-SANS-PLANNING (donnee
    manquante, rien n'est devine ; CCN 111 et 48.1.1.3 renvoient au planning).
    Une semaine prevue au-dela de 45 h : refus PV-SEMAINE-PREVUE-PLUS-45H (P-PV-3) ;
    S1 : toute semaine type du cycle au-dela de 45 h refuse tout le contrat (le cycle
    se repete) ; S2 : seule la semaine concernee est refusee (les mois qu'elle touche).
    Sortie : forme (S1/S2), index (S1), minutes_par_jour, minutes_semaine."""
    regles = ["R-PV-02", "R-PV-04"]
    _lundi(lundi, "lundi")
    if (cycle is None) == (plannings_semaines is None):
        raise ErreurSaisie("Donner soit cycle et cycle_ancre (S1), soit plannings_semaines (S2).")
    if cycle is not None:
        if not isinstance(cycle, (list, tuple)) or not 2 <= len(cycle) <= 4:
            raise ErreurSaisie("cycle : 2 a 4 semaines types (decisions T-076, 1).")
        _lundi(cycle_ancre, "cycle_ancre")
        types = [_planning(p, f"cycle[{i}]") for i, p in enumerate(cycle)]
        _refus_plus_45h([(f"semaine type {i + 1}", p) for i, p in enumerate(types)], regles)
        i = ((lundi - cycle_ancre).days // 7) % len(types)
        p = types[i]
        return resultat_ok(regles + ["P-PV-4"], {"forme": "S1", "index": i, "minutes_par_jour": p,
                                                 "minutes_semaine": _total(p)})
    cles = {}
    for k, v in plannings_semaines.items():
        cles[_lundi(k, "plannings_semaines (cle)")] = v
    if lundi not in cles:
        raise NonGere("PV-SEMAINE-SANS-PLANNING", regles + ["R-PV-08", "R-PV-09", "P-PV-4"],
                      precision=f"Planning de la semaine du {lundi.isoformat()} non saisi.")
    p = _planning(cles[lundi], f"planning du {lundi.isoformat()}")
    # P-PV-3 (decisions, 1) : en S2, seule la semaine prevue au-dela de 45 h est refusee, donc les mois
    # qu'elle touche ; en S1 le cycle se repete, tout le contrat est refuse (controle du cycle ci-dessus).
    _refus_plus_45h([(f"semaine du {lundi.isoformat()}", p)], regles)
    return resultat_ok(regles, {"forme": "S2", "minutes_par_jour": p, "minutes_semaine": _total(p)})


@api("R-PV-01", "R-PV-03", "P-PV-1", "P-PV-2", "R-MENS-02")
def mensualisation_planning_variable(semaines_programmees, heures_mensualisees, taux_horaire_centimes,
                                     cycle=None, date_paie=None):
    """Salaire mensualise d'un contrat a planning variable.
    - CCN 108.1 (mensualise « quels que soient le nombre d'heures de travail par
      semaine ») et CASF L423-19 al. 2 : jamais paye au reel (R-PV-01).
    - Salaire mensualise = heures_mensualisees x taux : le contrat fixe « la
      remuneration et son mode de calcul » (CASF D423-5, 14° ; R-PV-03, regle
      commune). heures_mensualisees : heures (entier ou chaine exacte).
    - Total prevu / 12 (decisions, 1) : S1 = moyenne du cycle x semaines
      programmees / 12 (CCN 109.1 ou 109.2 appliques a chaque semaine du cycle) ;
      S2 (cycle=None) = heures mensualisees (moyenne ecrite au contrat).
    - Lecture : heures mensualisees >= total prevu / 12 (a 1 minute pres) ->
      L1 + H1 (HC sur le prevu de la semaine) ; sinon L2 + H2, base hebdomadaire
      B = heures mensualisees x 12 / semaines programmees (P-PV-1, P-PV-2).
    S2 : la base vient des seules heures mensualisees du contrat (decisions, 1) ; une
    semaine prevue au-dela de 45 h est refusee par semaine_prevue, mois par mois.
    Refus : A-01 (47 a 51 semaines), PV-SEMAINE-PREVUE-PLUS-45H (P-PV-3).
    Sortie : salaire_mensualise_centimes, heures_mensualisees, lecture,
    base_hebdo_minutes (L2), total_prevu_mensuel_minutes, note."""
    regles = ["R-PV-03", "P-PV-1"]
    verifier_date_ccn(date_paie, regles)
    if not isinstance(semaines_programmees, int) or isinstance(semaines_programmees, bool):
        raise NonGere("A-05", regles + ["R-MENS-04"])
    ta = _type_annee(semaines_programmees)
    hm = positif(heures_mensualisees, "heures_mensualisees")
    if hm == 0:
        raise ErreurSaisie("heures_mensualisees : obligatoire au contrat (CASF D423-5, 14°).", regles)
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    hm_min = hm * 60
    if cycle is not None:
        types = [_planning(p, f"cycle[{i}]") for i, p in enumerate(cycle)]
        if not 2 <= len(types) <= 4:
            raise ErreurSaisie("cycle : 2 a 4 semaines types.")
        _refus_plus_45h([(f"semaine type {i + 1}", p) for i, p in enumerate(types)], regles)
        moyenne = Fraction(sum(_total(p) for p in types), len(types))
        total_mensuel = moyenne * semaines_programmees / 12
    else:
        total_mensuel = hm_min  # S2 : moyenne ecrite au contrat (decisions, 1)
    if hm_min >= total_mensuel - 1:
        lecture, base = "L1", None
    else:
        lecture, base = "L2", hm_min * 12 / semaines_programmees
    res = {"type_annee": ta, "heures_mensualisees": texte_fraction(hm), "lecture": lecture,
           "base_hebdo_minutes": None if base is None else texte_fraction(base),
           "total_prevu_mensuel_minutes": texte_fraction(total_mensuel),
           "salaire_mensualise_centimes": vers_centimes(hm * t, "salaire mensualise", regles),
           "note": MESSAGE_BASE}
    return resultat_ok(mensualisation_planning_variable.regles, res)


@api("R-PV-04", "R-PV-05", "P-PV-2", "R-HC-02", "R-HC-03", "D1", "D2", "D4")
def heures_en_plus_semaine_planning_variable(lecture, heures_prevues_semaine_minutes, base_hebdo_minutes,
                                             heures_reelles_minutes, taux_horaire_centimes, majoration_hm_pourcent,
                                             majoration_hc_pourcent=0, absence_dans_semaine=False,
                                             minutes_1er_mai_chome=0, minutes_payees_non_travaillees=0,
                                             absence_retenue=False, prorata_base=None):
    """Heures complementaires et majorees d'une semaine (planning variable).
    - CCN 96.4 : HC « au-dela de la duree de travail hebdomadaire prevue au
      contrat et jusqu'a 45 heures par semaine incluses » ; une semaine ne
      compense pas une autre (R-PV-04). L1 + H1 : reference = heures prevues
      de la semaine (contrat S1 ou planning S2, CCN 98.1.2 al. 3) ; L2 + H2 :
      reference = base hebdomadaire du contrat.
      HC = max(0 ; min(reelles ; 45 h) - reference).
    - CCN 96.4 et 110.1, CASF D423-10 : HM = max(0 ; reelles - 45 h), majoration
      d'au moins 10 % (R-PV-05). HC majorees du taux du contrat (CCN 110.2).
    Lecture L2, decisions de la direction (section 4) :
    - D1 : 1er mai chome un jour prevu (minutes_1er_mai_chome) : ses heures
      prevues comptent (CCN 47.1, « aucune reduction de la remuneration »).
      Autre ferie chome paye ou jour paye non travaille (evenement familial,
      absence remuneree de l'enfant) (minutes_payees_non_travaillees) : deux
      lectures, sans et avec ces heures (CCN 47.2 « remuneration brute
      habituelle » ; CCN 105) ; part sure + a confirmer.
    - D2 : absence retenue (deduite selon l'art. 111) dans une semaine prevue
      au-dela de la base : refus PV-L2-ABSENCE-HC (passage 2).
    - D4 : premiere ou derniere semaine incomplete du contrat
      (prorata_base = (jours prevus dans le contrat, jours prevus de la semaine)) :
      deux lectures, base entiere ou base x prorata.
    Refus : A-09 (absence dans la semaine et heures en plus, comme pour un
    planning fixe), PV-SEMAINE-PREVUE-PLUS-45H, PV-L2-ABSENCE-HC.
    Sortie : minutes et montants (centimes, part sure) des HC et des HM ;
    lectures_montant_complementaires [plus petite, plus grande]."""
    regles = ["R-PV-04", "R-PV-05"]
    if lecture not in ("L1", "L2"):
        raise ErreurSaisie("lecture : « L1 » ou « L2 » (sortie de mensualisation_planning_variable).")
    prevu = positif(heures_prevues_semaine_minutes, "heures_prevues_semaine_minutes")
    if prevu > SEUIL_45H:
        raise NonGere("PV-SEMAINE-PREVUE-PLUS-45H", regles + ["P-PV-3"])
    reelles = positif(heures_reelles_minutes, "heures_reelles_minutes")
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    maj_hc = positif(majoration_hc_pourcent, "majoration_hc_pourcent")
    maj_hm = positif(majoration_hm_pourcent, "majoration_hm_pourcent")
    if maj_hm < MAJORATION_MINIMALE_HM:
        raise ErreurSaisie("Majoration des heures majorees inferieure a 10 % (CCN art. 110.1).", regles)
    mai = positif(minutes_1er_mai_chome, "minutes_1er_mai_chome")
    payees = positif(minutes_payees_non_travaillees, "minutes_payees_non_travaillees")
    if lecture == "L1":
        refs = [prevu]
        reels = [reelles]
    else:
        base = positif(base_hebdo_minutes, "base_hebdo_minutes")
        if absence_retenue and prevu > base:
            raise NonGere("PV-L2-ABSENCE-HC", regles + ["D2"], precision=(
                "Absence deduite dans une semaine prevue au-dela de la base : combinaison de la deduction de "
                "l'art. 111 et de la perte des HC non ecrite (passage 2, question DDETS)."))
        refs = [base]
        if prorata_base is not None:
            n, dnm = (entier(x, "prorata_base") for x in prorata_base)
            if dnm == 0 or n > dnm:
                raise ErreurSaisie("prorata_base : (jours dans le contrat, jours prevus de la semaine).")
            refs.append(base * n / dnm)
        reels = sorted({reelles + mai, reelles + mai + payees})
    hcs = sorted({max(Fraction(0), min(r, SEUIL_45H) - ref) for r in reels for ref in refs})
    hm = max(Fraction(0), reelles - SEUIL_45H)
    if absence_dans_semaine and (hcs[-1] > 0 or hm > 0):
        raise NonGere("A-09", regles + ["R-MENS-05"])
    montants = [vers_centimes(h / 60 * t * (1 + maj_hc / 100), "heures complementaires", regles) for h in hcs]
    mhm = hm / 60 * t * (1 + maj_hm / 100)
    return resultat_ok(heures_en_plus_semaine_planning_variable.regles, {
        "reference_minutes": texte_fraction(refs[0]),
        "minutes_complementaires": texte_fraction(hcs[0]), "minutes_majorees": texte_fraction(hm),
        "montant_complementaires_centimes": montants[0],
        "lectures_montant_complementaires": [montants[0], montants[-1]],
        "montant_majorees_centimes": vers_centimes(mhm, "heures majorees", regles)})


@api("R-PV-04")
def mois_de_rattachement_semaine(lundi):
    """Mois de paie d'une semaine a cheval sur deux mois : le mois ou elle finit
    (exemple E-PV-02, Departement du Cher, « La mensualisation », p. 2 : « Les 5
    heures seront payees sur fevrier » ; source secondaire). La CCN ne definit
    pas la semaine (A-11 du projet) : resultat donne avec une note."""
    _lundi(lundi, "lundi")
    fin = lundi + timedelta(days=6)
    return resultat_ok(["R-PV-04"], {"annee": fin.year, "mois": fin.month,
                                     "note": "Rattachement au mois de fin de semaine : exemple E-PV-02 (source "
                                             "secondaire) ; semaine non definie par la CCN (A-11)."})


def _plannings_par_lundi(plannings_par_lundi):
    out = {}
    for k, v in plannings_par_lundi.items():
        out[_lundi(k, "plannings_par_lundi (cle)")] = _planning(v, f"planning du {k}")
    return out


@api("R-PV-08", "R-ABS-07", "R-ABS-08", "R-JF-05")
def prevu_du_mois_planning_variable(annee, mois, plannings_par_lundi, type_annee):
    """Denominateur de la deduction d'absence (CCN 111) pour un planning variable :
    « les parties se referent aux dispositions prevues dans le contrat de travail
    ou au planning remis au salarie » (R-PV-08). Chaque jour du mois prend le
    planning de sa semaine (plannings_par_lundi : {lundi : planning}) ; absences,
    semaines de non-accueil et feries chomes d'un jour prevu sont comptes
    (CCN 111, dernier alinea). 52 semaines : minutes ; 46 semaines ou moins :
    jours. Semaine du mois sans planning : refus PV-SEMAINE-SANS-PLANNING."""
    type_annee_valide(type_annee)
    plans = _plannings_par_lundi(plannings_par_lundi)
    tot_min = tot_j = 0
    for d in jours_du_mois(annee, mois):
        lu = d - timedelta(days=d.weekday())
        if lu not in plans:
            raise NonGere("PV-SEMAINE-SANS-PLANNING", ["R-PV-08", "P-PV-4"],
                          precision=f"Planning de la semaine du {lu.isoformat()} non saisi.")
        m = plans[lu].get(d.weekday(), 0)
        tot_min += m
        tot_j += 1 if m > 0 else 0
    if type_annee == "complete":
        return resultat_ok(["R-PV-08", "R-ABS-07"], {"prevu_minutes": tot_min})
    return resultat_ok(["R-PV-08", "R-ABS-08"], {"prevu_jours": tot_j})


_PRESENCES = ("travaille", "absence_autorisee", "absence_enfant", "absence_employeur", "absence_am")


@api("R-PV-12", "P-PV-6", "R-JF-02", "R-JF-04")
def ferie_chome_planning_variable(date_ferie, jours_prevus, presence_veille="travaille",
                                  presence_lendemain="travaille", jours_non_accueil=()):
    """Ferie chome avec un planning variable (lecture F1 de P-PV-6, retenue par la
    direction : le ferie est « habituellement travaille » s'il est prevu cette
    semaine-la ; F2 notee question DDETS, sans calcul au passage 1).
    CCN 47.2 : maintien si l'AM a travaille « le dernier jour de travail qui
    precede le jour ferie et le premier jour de travail qui lui fait suite » ;
    « jour de travail » = jour « qui aurait du etre travaille [...] selon le
    contrat de travail ou le planning ». CCN 47.1 : 1er mai, aucune reduction.
    jours_prevus : dates prevues (planning de chaque semaine), autour du ferie.
    Refus : A-32 (absence du fait de l'enfant ou de l'employeur, voisin ferie),
    R-JF-02-LIMITE (ferie en semaine de non-accueil), PV-SEMAINE-SANS-PLANNING
    (aucun jour prevu trouve)."""
    if not isinstance(date_ferie, date):
        raise ErreurSaisie("date_ferie : date attendue.")
    verifier_date_ccn(date_ferie, ["R-JF-02"])
    feries = jours_feries(date_ferie.year)
    if date_ferie not in feries:
        raise ErreurSaisie("Cette date n'est pas un jour ferie ordinaire (R-JF-01).")
    prevus = set(jours_prevus)
    if date_ferie in set(jours_non_accueil):
        raise NonGere("R-JF-02-LIMITE", ["R-JF-02"])
    if date_ferie not in prevus:
        return resultat_ok(["R-PV-12", "P-PV-6"], {"jour_habituellement_travaille": False,
                                                   "remuneration_maintenue": None,
                                                   "note": "Ferie non prevu au planning de la semaine (lecture F1)."})
    if date_ferie.month == 5 and date_ferie.day == 1:
        return resultat_ok(["R-JF-04"], {"jour_habituellement_travaille": True, "jours_condition": [],
                                         "remuneration_maintenue": True})
    avant = max((d for d in prevus if d < date_ferie), default=None)
    apres = min((d for d in prevus if d > date_ferie), default=None)
    if avant is None or apres is None:
        raise NonGere("PV-SEMAINE-SANS-PLANNING", ["R-PV-12"], precision="Aucun jour prevu autour du ferie.")
    for p in (presence_veille, presence_lendemain):
        if p not in _PRESENCES:
            raise ErreurSaisie(f"Presence inconnue : {p}.")
    voisins = set(jours_feries(avant.year)) | set(jours_feries(apres.year))
    if avant in voisins or apres in voisins:
        raise NonGere("A-32", ["R-JF-02"], precision="Le jour de travail voisin est lui-meme ferie.")
    statuts = (presence_veille, presence_lendemain)
    if any(p in ("absence_enfant", "absence_employeur") for p in statuts):
        raise NonGere("A-32", ["R-JF-02"])
    maintenu = all(p in ("travaille", "absence_autorisee") for p in statuts)
    return resultat_ok(ferie_chome_planning_variable.regles, {
        "jour_habituellement_travaille": True, "jours_condition": [avant.isoformat(), apres.isoformat()],
        "remuneration_maintenue": maintenu})


@api("R-PV-09", "R-CP-09")
def decompte_jours_cp_planning_variable(premier_jour_absence, jour_reprise, jours_prevus):
    """Jours de CP decomptes avec un planning variable (R-PV-09). CCN 48.1.1.3 :
    « le 1er jour de conges a decompter est le 1er jour ouvrable qui aurait du
    etre travaille par le salarie dans le cadre du planning convenu, puis il
    convient de decompter chaque jour ouvrable jusqu'au dernier jour ouvrable
    precedant le jour de la reprise du travail ». jours_prevus : dates prevues
    au planning de chaque semaine. Feries chomes non decomptes (comme R-CP-09).
    Sortie : jours_decomptes, premier_jour_decompte."""
    if not (isinstance(premier_jour_absence, date) and isinstance(jour_reprise, date)):
        raise ErreurSaisie("Dates attendues.")
    if jour_reprise <= premier_jour_absence:
        raise ErreurSaisie("La reprise doit suivre le premier jour d'absence.")
    prevus = set(jours_prevus)
    feries = {}
    for a in range(premier_jour_absence.year, jour_reprise.year + 1):
        feries.update(jours_feries(a))
    d = premier_jour_absence
    while d < jour_reprise and (d not in prevus or d in feries):
        d += timedelta(days=1)
    debut = d
    n = 0
    while d < jour_reprise:
        if d.weekday() <= 5 and d not in feries:
            n += 1
        d += timedelta(days=1)
    return resultat_ok(decompte_jours_cp_planning_variable.regles, {
        "jours_decomptes": n, "premier_jour_decompte": debut.isoformat() if debut < jour_reprise else None})


def _lectures_cp(j, t, h_periode, n_sem, h_conges, base):
    c1 = t * Fraction(h_periode, 60) / n_sem * Fraction(j, 6)
    c2 = t * Fraction(h_conges, 60)
    dix = Fraction(base) / 10
    return c1, c2, dix


@api("R-PV-10", "P-PV-5", "R-CP-06")
def indemnite_cp_planning_variable(jours_conges, taux_horaire_centimes, heures_prevues_periode_minutes,
                                   semaines_prevues_travaillees, heures_prevues_jours_conge_minutes,
                                   salaires_bruts_periode_centimes, icp_versee_pendant_periode_centimes=0,
                                   icp_annee_precedente_centimes=0, jours_supplementaires=0):
    """Indemnite de CP d'un droit annuel avec un planning variable.
    CCN 48.1.1.5 : maintien (« remuneration brute que le salarie aurait percue
    pour une duree de travail egale a celle du conge paye ») ou dixieme ; « le
    montant le plus avantageux pour le salarie sera retenu ».
    Maintien en deux lectures (P-PV-5, decisions, 1) :
      C1 = taux x (heures prevues de la periode / semaines prevues travaillees)
           x jours / 6 (Cass. soc. 9/05/2019 n° 17-26.232 : « duree normale
           habituelle d'accueil [...] pendant toute la periode de reference ») ;
      C2 = taux x heures prevues des jours de conge pris (texte de 48.1.1.5).
    Dixieme : 1/10 de la remuneration brute de la periode (CCN 48.1.1.5) ; ICP
    « versee pendant la periode » ou « de l'annee precedente » (A-28) : refus
    si cela change le resultat.
    Part sure = max(dixieme ; min(C1, C2)) ; a confirmer = max(dixieme ;
    max(C1, C2)) - part sure. heures_prevues_jours_conge_minutes = None (droit
    pas encore pris en entier) : refus PV-C2-DROIT-NON-PRIS. jours_supplementaires
    (enfants a charge, fractionnement) : refus CP-SUPP s'ils changent le resultat.
    Sortie : indemnite_centimes (part sure), a_confirmer_centimes, lectures
    [C1 : max(dixieme, C1) ; C2 : max(dixieme, C2)], methode par lecture."""
    regles = ["R-PV-10", "P-PV-5"]
    j = entier(jours_conges, "jours_conges", 1)
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    hp = entier(heures_prevues_periode_minutes, "heures_prevues_periode_minutes")
    n = entier(semaines_prevues_travaillees, "semaines_prevues_travaillees", 1)
    if heures_prevues_jours_conge_minutes is None:
        raise NonGere("PV-C2-DROIT-NON-PRIS", regles,
                      precision="Lecture C2 : heures prevues des jours de conge inconnues tant que le droit n'est pas pris.")
    hc = entier(heures_prevues_jours_conge_minutes, "heures_prevues_jours_conge_minutes")
    sal = entier(salaires_bruts_periode_centimes, "salaires_bruts_periode_centimes")
    icp1 = entier(icp_versee_pendant_periode_centimes, "icp_versee_pendant_periode_centimes")
    icp2 = entier(icp_annee_precedente_centimes, "icp_annee_precedente_centimes")
    sup = entier(jours_supplementaires, "jours_supplementaires")
    if sup >= j:
        raise ErreurSaisie("jours_supplementaires doit etre inferieur a jours_conges.")
    variantes = {}
    for icp in sorted({icp1, icp2}):
        for echelle in ([False, True] if sup else [False]):
            c1, c2, dix = _lectures_cp(j, t, hp, n, hc, sal + icp)
            if echelle:
                dix = dix * j / (j - sup)  # CP-SUPP : jours supplementaires hors du dixieme (comme R-CP-06)
            variantes[(icp, echelle)] = (max(dix, c1), max(dix, c2), dix)
    if len({(a, b) for a, b, _ in variantes.values()}) != 1:
        codes = {("A-28" if k1[0] != k2[0] else "CP-SUPP") for k1 in variantes for k2 in variantes
                 if variantes[k1][:2] != variantes[k2][:2]}
        raise NonGere("A-28" if "A-28" in codes else "CP-SUPP", regles + ["R-CP-06"])
    variantes = set(variantes.values())
    l1, l2, dix = next(iter(variantes))
    c1, c2, _ = _lectures_cp(j, t, hp, n, hc, sal + icp1)
    v1 = vers_centimes(l1, "indemnite de CP, lecture C1", regles)
    v2 = vers_centimes(l2, "indemnite de CP, lecture C2", regles)
    sure = min(v1, v2)
    return resultat_ok(indemnite_cp_planning_variable.regles, {
        "indemnite_centimes": sure, "a_confirmer_centimes": max(v1, v2) - sure, "lectures": [v1, v2],
        "methodes": ["dixieme" if dix > c1 else ("egalite" if dix == c1 else "maintien"),
                     "dixieme" if dix > c2 else ("egalite" if dix == c2 else "maintien")],
        "maintien_c1_exact_centimes": texte_fraction(c1), "maintien_c2_exact_centimes": texte_fraction(c2),
        "dixieme_exact_centimes": texte_fraction(dix), "question": QUESTION_P_PV_5})


@api("R-PV-10", "R-CP-07", "P-PV-5")
def complement_cp_planning_variable(resultat_indemnite):
    """52 semaines (CCN 102.1.2.1 : l'indemnite remplace le salaire pendant le
    conge ; R-CP-07) : complement de juin nul seulement si le maintien l'emporte
    et si les deux lectures C1 et C2 donnent le meme montant. Dixieme plus fort :
    refus A-29 (moment et forme du complement non ecrits). C1 et C2 differents :
    refus P-PV-5 (le salaire maintenu pendant le conge ne correspond qu'a une
    lecture)."""
    if not isinstance(resultat_indemnite, dict) or resultat_indemnite.get("statut") not in ("ok", "provisoire"):
        raise ErreurSaisie("Fournir un resultat valide de indemnite_cp_planning_variable().")
    r = resultat_indemnite["resultat"]
    if any(m == "dixieme" for m in r["methodes"]):
        raise NonGere("A-29", ["R-CP-07"])
    if r["lectures"][0] != r["lectures"][1]:
        raise NonGere("P-PV-5", ["R-PV-10"], details={"lectures_centimes": r["lectures"]})
    return resultat_ok(["R-CP-07"], {"complement_centimes": 0})


@api("R-PV-13", "P-PV-5", "R-FIN-09", "R-FIN-10", "R-CP-06")
def iccp_planning_variable(type_annee, motif, periodes, taux_horaire_centimes):
    """ICCP de fin d'un contrat a planning variable (R-PV-13). CCN 123.1 et 123.2 :
    « methode du maintien de salaire ou methode du dixieme, selon les dispositions
    prevues a l'article 48.1.1.5 » ; CCN 67 : CP « acquis, non remuneres au jour de
    la date de fin ». Maintien : lecture C1 de P-PV-5 (duree habituelle moyenne de
    la periode : taux x heures prevues / semaines prevues x jours / 6). C2 (heures
    prevues des jours de conge pris) est sans objet : aucun conge n'est pris.
    Memes refus que iccp() : A-49 (faute lourde), A-48 (agrement), A-50 (jours deja
    payes en partie ; ICCP de la periode precedente dans la base si cela change le
    resultat, SUS-04), A-28, CP-SUPP, ASSIETTE-A-CONFIRMER.
    periodes : liste (la plus ancienne d'abord) de {jours_acquis, jours_payes,
    salaires_bruts_periode_centimes, icp_versee_pendant_periode_centimes,
    icp_annee_precedente_centimes, jours_supplementaires, heures_prevues_periode_minutes,
    semaines_prevues_travaillees, regularisation_due_centimes (derniere),
    regularisation_a_confirmer}. Sortie : iccp_centimes, detail_centimes."""
    from .fin_contrat import _motif_exclu
    regles = ["R-PV-13", "R-FIN-09"]
    type_annee_valide(type_annee)
    _motif_exclu(motif, regles)
    if motif == "faute_lourde":
        raise NonGere("A-49", regles)
    if motif == "agrement":
        raise NonGere("A-48", regles)
    t = positif(taux_horaire_centimes, "taux_horaire_centimes")
    total, detail, precedente = 0, [], 0
    for i, p in enumerate(periodes):
        derniere = i == len(periodes) - 1
        a = entier(p.get("jours_acquis"), f"periodes[{i}].jours_acquis")
        pay = entier(p.get("jours_payes", 0), f"periodes[{i}].jours_payes")
        if pay > a:
            raise ErreurSaisie(f"periodes[{i}] : plus de jours payes qu'acquis.")
        if a - pay == 0:
            v = 0
        elif pay > 0:
            raise NonGere("A-50", regles, precision=f"Periode {i + 1} : {pay} jours deja payes sur {a}.")
        else:
            if derniere and p.get("regularisation_a_confirmer"):
                raise NonGere("ASSIETTE-A-CONFIRMER", regles)
            reg = max(0, entier(p.get("regularisation_due_centimes", 0) or 0, "regularisation_due_centimes")) \
                if derniere else 0
            sal = entier(p.get("salaires_bruts_periode_centimes"), "salaires_bruts_periode_centimes")
            icp1 = entier(p.get("icp_versee_pendant_periode_centimes", 0), "icp_versee_pendant_periode_centimes")
            icp2 = entier(p.get("icp_annee_precedente_centimes", 0), "icp_annee_precedente_centimes")
            sup = entier(p.get("jours_supplementaires", 0), "jours_supplementaires")
            hp = entier(p.get("heures_prevues_periode_minutes"), "heures_prevues_periode_minutes")
            n = entier(p.get("semaines_prevues_travaillees"), "semaines_prevues_travaillees", 1)
            c1 = t * Fraction(hp, 60) / n * Fraction(a, 6)
            vals = {}
            for icp in sorted({icp1, icp2}):
                for prec in sorted({0, precedente}):
                    for ech in ([False, True] if sup else [False]):
                        dix = Fraction(sal + icp + reg + prec, 10)
                        if ech:
                            dix = dix * a / (a - sup)
                        vals[(icp, prec, ech)] = max(dix, c1)
            if len(set(vals.values())) != 1:
                ks = list(vals)
                code = "A-50"
                for k1 in ks:
                    for k2 in ks:
                        if vals[k1] != vals[k2]:
                            if k1[0] != k2[0] and k1[1:] == k2[1:]:
                                code = "A-28"
                            elif k1[2] != k2[2] and k1[:2] == k2[:2] and code != "A-28":
                                code = "CP-SUPP"
                raise NonGere(code, regles)
            v = vers_centimes(next(iter(vals.values())), f"ICCP periode {i + 1}", regles)
        total += v
        detail.append(v)
        precedente = v
    return resultat_ok(iccp_planning_variable.regles, {
        "iccp_centimes": total, "detail_centimes": detail,
        "note": "Maintien : lecture C1 (P-PV-5) ; C2 sans objet, aucun conge pris."})
