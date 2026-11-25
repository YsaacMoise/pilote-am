"""Adaptateur du moteur B (Python) pour le comparateur T-008.

Deux modes :
- « b_appels » (cas officiels) : appels explicites aux fonctions publiques de B,
  recopies de moteur/B/tests/test_cas_officiels.py ;
- composition (grille) : la situation (contrat + evenements) est traduite en
  appels aux fonctions publiques de B. L'adaptateur ne fait que compter des
  faits du calendrier (jours, minutes, semaines, mois, repas, km). Toute
  qualification (absence deductible ou non, ferie paye ou non, jours de CP
  decomptes, methode d'acquisition, maintien ou dixieme) est demandee a B.
  Si B refuse une etape, toutes les sorties qui en dependent portent le refus.

Le moteur B n'est pas modifie. Montants en centimes entiers.
T-050b : la regularisation de fin est calculee avant l'ICCP et l'indemnite de rupture (elle entre dans les deux bases).
T-027 : kilometres (km_cv, km_partage, km_enfants), evenements nommes (nature), km_controle, evt_duree.
T-077 (MB7) : region du contrat (contrat.region : « alsace_moselle », « mayotte », absent = metropole). Feries
locaux (R3), maintien du droit local (R4), brut estime par region (R1), minimum et repere net (R2). Un jour « a
confirmer » (code A77-xxx de B) n'est ni paye ni retenu par B : les sorties qui en dependent sont refusees avec le
code et la liste des valeurs possibles (details.lectures_valeurs, une liste par sortie).
T-076 : planning variable (planning_variable, cycle, cycle_ancre ou plannings_semaines, heures_mensualisees) et CDD
(cdd, cdd_terme, cdd_motif ; fin motif « fin_cdd » avec fin_cdd). Point a confirmer : `valeur` = part sure,
`lectures` = [lecture 1, lecture 2] (regles/t076-decisions-direction.md).
"""

import os
import sys
from datetime import date, timedelta
from fractions import Fraction

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get("ARVELA_B_RACINE", "/home/claude/projet/moteur/B"))  # M6 : copie hors du projet
import moteur_b as B  # noqa: E402
from moteur_b.heures import calcul_h9  # noqa: E402  (verif-1 : test de semaine sans heures en plus)
from moteur_b.calendrier import jours_feries  # noqa: E402  (liste des feries R-JF-01, sans regle de paie)
from moteur_b.regions import region_valide, feries_locaux_entre  # noqa: E402  (liste des feries locaux, R3)
from itertools import combinations  # noqa: E402


# ------------------------------------------------------------------ outils

class Refus(Exception):
    """Une etape de B a refuse : on propage son code."""

    def __init__(self, code, etape, details=None):
        super().__init__(code)
        self.code = code
        self.etape = etape
        self.details = details or {}


class Lect(int):
    """T-076 : montant (part sure, la plus petite lecture) qui porte ses lectures (decisions T-076, preambule :
    `valeur` = part sure, `lectures` = [lecture 1, lecture 2]). Se comporte comme un entier dans les sommes."""

    def __new__(cls, valeur, lectures):
        o = int.__new__(cls, valeur)
        o.lectures = None if lectures is None else list(lectures)
        return o


def d_(s):
    return date.fromisoformat(s)


def appel(nom_fonction, *args, **kwargs):
    """Appelle une fonction publique de B ; leve Refus si non gere."""
    f = getattr(B, nom_fonction)
    r = f(*args, **kwargs)
    if r["statut"] in ("ok", "provisoire"):
        return r
    if r["statut"] == "non_gere":
        raise Refus(r["code"], nom_fonction, r.get("details"))
    raise Refus("ERREUR-SAISIE", nom_fonction, {"message": r.get("message")})


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def lundi(d):
    return d - timedelta(days=d.weekday())


def jours_entre(a, b):
    x = a
    while x <= b:
        yield x
        x += timedelta(days=1)


def mois_de(d):
    return f"{d.year:04d}-{d.month:02d}"


def premier(m):
    y, mo = map(int, m.split("-"))
    return date(y, mo, 1)


def dernier(m):
    d = premier(m)
    n = date(d.year + (d.month // 12), d.month % 12 + 1, 1)
    return n - timedelta(days=1)


def mois_entre(a, b):
    m = date(a.year, a.month, 1)
    while m <= b:
        yield mois_de(m)
        m = date(m.year + (m.month // 12), m.month % 12 + 1, 1)


# T-103 (R4) : la liste des feries depend de la region (27 avril a Mayotte, B : calendrier.jours_feries). Region de
# la situation en cours, fixee par Ctx (une situation a une seule region).
_REGION = ["metropole"]


def feries(annee):
    return jours_feries(annee, _REGION[0])


def est_ferie(d):
    return d in feries(d.year)


# ------------------------------------------------------------------ contexte

class Ctx:
    def __init__(self, s):
        k = s["contrat"]
        self.s = s
        self.k = k
        self.debut = d_(k["debut"])
        self.fin = d_(k["fin"]) if k.get("fin") else None
        self.type = k["type_annee"]
        self.semaines = 52 if self.type == "complete" else k["semaines"]
        self.sans_accueil = {d_(x) for x in k.get("semaines_sans_accueil", [])}
        # planning : 1 = lundi ... 7 = dimanche -> liste de plages
        self.plages = {int(j) - 1: [(minutes(a), minutes(b)) for a, b in p] for j, p in k["planning"].items()}
        self.plan_min = {j: sum(b - a for a, b in p) for j, p in self.plages.items() if sum(b - a for a, b in p) > 0}
        self.hebdo = sum(self.plan_min.values())
        self.jours_travailles = set(self.plan_min)
        self.taux = k["taux"]
        self.maj_hm = k.get("majoration_hm", 10)
        self.maj_hc = k.get("majoration_hc", 0)
        ev = s.get("evenements", {})
        self.jours = {d_(j["date"]): j for j in ev.get("jours", [])}
        self.conges = [dict(l, du=d_(l["du"]), au=d_(l["au"])) for l in ev.get("absences_am", [])]
        self.cache = {}
        self.region = region_valide(k.get("region"))
        _REGION[0] = self.region
        self.locaux = feries_locaux_entre(self.debut, self.fin or date(self.debut.year + 6, 12, 31), self.region)
        # T-072 (T-052) : types d'annee successifs du contrat (debut, puis chaque avenant), pour les conges.
        # Rempli par ctx_mois quand la situation a des avenants.
        self.historique = [(self.debut, self.type)]
        # T-074 : preavis dispense par l'employeur. Fait de la situation : dernier jour travaille ; la date de fin
        # du contrat (k["fin"]) est la date prevue de fin du preavis (CCN art. 64, al. 2, 2e tiret). Donne par le
        # contrat (rupture.preavis = « employeur ») ou par le calcul de fin (inexecution.demandeur = « employeur »).
        self.dernier_travaille = None
        ru = k.get("rupture") or {}
        if ru.get("preavis") == "employeur":
            self.dernier_travaille = d_(ru["dernier_jour_travaille"])
        for c in s.get("calculs", []):
            inex = c.get("inexecution") if c.get("type") == "fin" else None
            if inex and inex.get("demandeur") == "employeur":
                dj = d_(inex["dernier_jour_travaille"])
                if self.dernier_travaille not in (None, dj):
                    raise ValueError("dernier jour travaille different entre le contrat et le calcul de fin")
                self.dernier_travaille = dj
        if self.dernier_travaille is not None and (self.fin is None or not self.debut <= self.dernier_travaille < self.fin):
            self.dernier_travaille = "incoherent"
        # T-076 : planning variable (regles/t076-decisions-direction.md, 1) et CDD (idem, 2).
        self.pv = bool(k.get("planning_variable"))
        self.cdd = bool(k.get("cdd"))
        self.p2_52 = False  # CDD, point P2, lecture « 52 semaines avec deduction de l'art. 111 »
        if self.pv:
            def conv(p):
                return {int(j) - 1: [(minutes(a), minutes(b)) for a, b in pl] for j, pl in p.items()}
            self.pv_cycle = [conv(p) for p in k["cycle"]] if k.get("cycle") else None
            self.pv_ancre = d_(k["cycle_ancre"]) if k.get("cycle_ancre") else None
            self.pv_semaines = None if self.pv_cycle else {d_(l): conv(p) for l, p in k.get("plannings_semaines", {}).items()}

    def ferie_local(self, d):
        """Fait du calendrier : d est-il un des feries locaux de la region (R3) ? Sans regle de paie."""
        return d in self.locaux

    def types_entre(self, a, b):
        """Types d'annee en vigueur entre a et b (faits du contrat et des avenants)."""
        out = []
        for i, (du, t) in enumerate(self.historique):
            au = self.historique[i + 1][0] - timedelta(days=1) if i + 1 < len(self.historique) else date(9999, 12, 31)
            if du <= b and au >= a:
                out.append(t)
        return out

    def dispense(self, d):
        """T-074 : jour du preavis dispense par l'employeur (apres le dernier jour travaille, jusqu'a la fin)."""
        return isinstance(self.dernier_travaille, date) and self.dernier_travaille < d <= self.fin

    def semaine_pv(self, lu):
        """Plages prevues de la semaine du lundi lu (planning variable). Le choix de la semaine type (cycle ancre,
        P-PV-4 lecture Q1) et le refus d'une semaine sans planning sont demandes a B (semaine_prevue)."""
        key = ("pvsem", lu)
        if key not in self.cache:
            def mins(pl):
                return {j: sum(b - a for a, b in p) for j, p in pl.items()}
            try:
                if self.pv_cycle is not None:
                    r = appel("semaine_prevue", lu, cycle=[mins(p) for p in self.pv_cycle], cycle_ancre=self.pv_ancre)
                    self.cache[key] = self.pv_cycle[r["resultat"]["index"]]
                else:
                    appel("semaine_prevue", lu, plannings_semaines={l: mins(p) for l, p in self.pv_semaines.items()})
                    self.cache[key] = self.pv_semaines[lu]
            except Refus as e:
                self.cache[key] = e
        v = self.cache[key]
        if isinstance(v, Refus):
            raise v
        return v

    def plages_jour(self, d):
        if self.pv:
            return self.semaine_pv(lundi(d)).get(d.weekday(), [])
        return self.plages.get(d.weekday(), [])

    def plan_jour(self, d):
        """Minutes du planning ce jour (planning de la semaine), sans tenir compte des dates du contrat."""
        if self.pv:
            return sum(b - a for a, b in self.plages_jour(d))
        return self.plan_min.get(d.weekday(), 0)

    def prevu_hors_dates(self, d):
        """Minutes prevues selon le planning (0 en semaine de non-accueil), meme hors des dates du contrat."""
        if self.type == "incomplete" and lundi(d) in self.sans_accueil:
            return 0
        return self.plan_jour(d)

    def jours_prevus(self, a, b):
        """Dates prevues (minutes > 0) entre a et b inclus : fait du calendrier et du planning."""
        return {x for x in jours_entre(a, b) if self.prevu(x) > 0}

    def dans_contrat(self, d):
        return d >= self.debut and (self.fin is None or d <= self.fin)

    def prevu(self, d):
        """Minutes prevues ce jour (planning type ; 0 en semaine de non-accueil)."""
        if not self.dans_contrat(d):
            return 0
        if self.type == "incomplete" and lundi(d) in self.sans_accueil:
            return 0
        return self.plan_jour(d)

    def conge(self, d):
        """Type d'absence de l'AM ce jour. T-103 (C15, C17) : plusieurs saisies le meme jour : B decide
        (absence_retenue_du_jour : l'arret maladie l'emporte sur le conge paye ; autre cas : refus C17)."""
        types = [l["type"] for l in self.conges if l["du"] <= d <= l["au"]]
        if not types:
            return None
        if len(types) == 1:
            return types[0]
        return appel("absence_retenue_du_jour", types)["resultat"]["type"]

    def conge_ligne(self, d, type_):
        for l in self.conges:
            if l["du"] <= d <= l["au"] and l["type"] == type_:
                return l
        return None

    def travail_jour(self, d):
        """Minutes de travail du jour (R-HC-04 via B) pour un jour travaille."""
        j = self.jours.get(d)
        p = self.plages_jour(d)
        prevu = self.prevu(d)
        if j and j.get("pres"):
            pres = j["pres"]
            if prevu == 0:
                return sum(minutes(b) - minutes(a) for a, b in pres)
            if len(pres) != 1 or len(p) != 1:
                raise Refus("HORS-COMPARATEUR", "travail_jour", {"motif": "plusieurs plages"})
            r = appel("temps_de_travail_jour", p[0][0], p[0][1], minutes(pres[0][0]), minutes(pres[0][1]))
            return r["resultat"]["minutes_travaillees"]
        return prevu


# ------------------------------------------------------------------ qualification d'un jour

# Refus d'un jour qui empechent de savoir s'il est travaille : les sorties qui en dependent sont refusees, jamais
# mises a 0 par defaut. T-076 : planning variable (semaine sans planning, semaine prevue au-dela de 45 h).
REFUS_BLOQUANTS = ("HORS-COMPARATEUR", "PV-SEMAINE-SANS-PLANNING", "PV-SEMAINE-PREVUE-PLUS-45H")

_TYPE_AM = {"am_malade": "am_maladie", "am_enfant_malade": "am_enfant_malade",
            "sans_solde": "am_convenance_personnelle", "evenement": "am_evenement_familial"}


# T-027 : nature d'evenement (moteur A) -> evenement de B.
NATURES_EVT = {"mariage": "mariage_pacs", "mariage_enfant": "mariage_pacs_enfant", "naissance": "naissance",
               "deces_enfant": "deces_enfant", "deces_enfant_14": "deces_enfant_majore",
               "deces_proche": "deces_proche", "handicap_enfant": "handicap_enfant",
               "deces_descendant": "deces_descendant", "deces_ascendant": "deces_ascendant",
               "deuil": "deuil_complementaire"}


def jour_evenement(ctx, d):
    """Deductible ou non pour un jour de conge pour evenement familial (B decide).
    La date de l'evenement est le premier jour du conge (fait de la situation)."""
    l = ctx.conge_ligne(d, "evenement")
    if not l.get("nature"):
        r = appel("qualifier_absence", "am_evenement_familial", ctx.type)  # refus R-ABS-06
    # T-103 (C8) : jour de repos hebdomadaire du contrat (contrat.reposHebdo : 1 = lundi ... 7 = dimanche) ; B refuse
    # (C8-REPOS-HEBDO-MANQUANT) si le planning prevoit le dimanche et que ce jour n'est pas saisi.
    rh = ctx.k.get("reposHebdo")
    dim = 6 in ctx.plan_min or (ctx.pv and any(6 in p for p in (ctx.pv_cycle or list((ctx.pv_semaines or {}).values()))))
    r = appel("jours_conge_evenement", NATURES_EVT[l["nature"]], l.get("date_evenement") and d_(l["date_evenement"])
              or l["du"], l["du"], l["au"], jour_repos_hebdomadaire=None if rh is None else int(rh) - 1,
              planning_contient_dimanche=dim)
    st = r["resultat"]["jours"][d.isoformat()]
    if st == "ferie":
        return None  # T-103 (C7) : ferie pendant le conge : jour ferie (CCN 47), qualifie a part
    if st == "remunere":
        if l["nature"] == "deuil":
            # T-103 (C9) : salaire maintenu, IJ de la CPAM (l["ijSecu"], centimes) retirees du mois (ij_du_mois).
            appel("conge_deuil", l["du"], l.get("ijSecu"))
        return False
    if st == "non_remunere":
        return True
    if st == "hors_droit":
        raise Refus("EVT-HORS-DROIT", "jours_conge_evenement")
    raise Refus("HORS-COMPARATEUR", "jours_conge_evenement", {"motif": "jour prevu non ouvrable"})


def statut_presence(ctx, d):
    """Fait du jour pour la condition du ferie (R-JF-02), sans regle."""
    c = ctx.conge(d)
    if c in ("am_malade", "am_enfant_malade"):
        return "absence_am"
    if c in ("cp", "evenement", "sans_solde"):
        return "absence_autorisee"
    j = ctx.jours.get(d)
    if j and j.get("abs"):
        return "absence_enfant"
    if ctx.ferie_local(d) and not (j and (j.get("pres") or j.get("ferie_travaille"))):
        # T-077 (R3.3) : ferie local non travaille, voisin d'un ferie national : fait inconnu en lecture B
        # (parents ou fermeture de l'AM), ferie en lecture A. B decide (ferie_chome, A77-FERIE-VOISIN).
        return "inconnu"
    return "travaille"


def droits_cp_suffisants(ctx, d):
    """Annee complete : le conge pris le jour d est-il couvert par les droits ?
    Droits de la periode de prise y (1er juin y - 31 mai y+1) : solde de debut de
    suivi si le suivi commence dans cette periode (fait donne par la situation),
    sinon jours acquis sur la periode y-1 (calcules par B). Jours pris decomptes
    par B (R-CP-09), dans l'ordre chronologique."""
    y = d.year if d.month >= 6 else d.year - 1
    suivi = d_(ctx.k.get("suivi_depuis", ctx.k["debut"]))
    ys = suivi.year if suivi.month >= 6 else suivi.year - 1
    if y == ys:
        droits = ctx.k.get("soldes", {}).get("cp_restants", 0)
    else:
        acq = acquisition_b(ctx, y - 1)["jours_acquis"]
        if isinstance(acq, Refus):
            raise acq
        droits = acq
    p0, p1 = date(y, 6, 1), date(y + 1, 5, 31)
    total_a = total_b = 0
    for l in sorted([x for x in ctx.conges if x["type"] == "cp" and p0 <= x["du"] <= p1], key=lambda x: x["du"]):
        na, nb = decompte_conge(ctx, l)
        total_a += na
        total_b += nb
        if l["du"] <= d <= l["au"]:
            va, vb = total_a <= droits, total_b <= droits
            if va != vb:
                # T-077 (R3.4) : les droits suffisent dans une lecture et pas dans l'autre.
                raise Refus("A77-DECOMPTE-CP", "decompte_jours_cp",
                            {"lectures": {"A": total_a, "B": total_b}, "droits": droits})
            return va
    return True


def decompte_conge(ctx, l, borne=None):
    """Jours decomptes d'un conge, dans les deux lectures de R3.4 (B les donne ; egales hors region a feries
    locaux). La reprise est le premier jour prevu qui n'est pas ferie (fait du calendrier) ; si ce jour est un
    ferie local, la reprise elle-meme depend de la lecture : refus visible.
    Integration T-078 : planning variable (T-076, metropole seulement) : decompte_b (R-PV-09), une seule lecture."""
    reprise = l["au"] + timedelta(days=1)
    while ctx.prevu(reprise) == 0 or est_ferie(reprise):
        reprise += timedelta(days=1)
        if borne and reprise > borne:
            break
    if ctx.ferie_local(reprise):
        raise Refus("A77-DECOMPTE-CP", "decompte_jours_cp", {"motif": "jour de reprise ferie local : reprise selon la lecture"})
    if ctx.pv:
        n = decompte_b(ctx, l["du"], reprise)
        return n, n
    # T-103 (C15) : jours d'arret maladie saisis pendant le conge : non decomptes (B). (C16) : contrat fini avant la
    # reprise : decompte arrete a la fin du contrat (B).
    arret = [x for x in jours_entre(l["du"], reprise - timedelta(days=1))
             if any(c["type"] == "am_malade" and c["du"] <= x <= c["au"] for c in ctx.conges)]
    fin_k = ctx.fin if ctx.fin is not None and ctx.fin < reprise - timedelta(days=1) else None
    try:
        r = appel("decompte_jours_cp", l["du"], reprise, ctx.jours_travailles, region=ctx.region,
                  jours_arret_maladie=arret, date_fin_contrat=fin_k)
        n = r["resultat"]["jours_decomptes"]
        return n, n
    except Refus as e:
        if e.code == "A77-DECOMPTE-CP":
            return e.details["lectures"]["A"], e.details["lectures"]["B"]
        raise


def decompte_b(ctx, du, reprise):
    """Jours de CP decomptes par B (R-CP-09 ; planning variable : R-PV-09, CCN 48.1.1.3, sur le planning de
    chaque semaine)."""
    if ctx.pv:
        prevus = ctx.jours_prevus(du, reprise)
        return appel("decompte_jours_cp_planning_variable", du, reprise, prevus)["resultat"]["jours_decomptes"]
    return appel("decompte_jours_cp", du, reprise, ctx.jours_travailles)["resultat"]["jours_decomptes"]
def episodes_maladie(ctx):
    """Episodes d'absence de l'enfant malade avec certificat : jours prevus
    consecutifs (sans jour prevu entre deux)."""
    if "episodes" in ctx.cache:
        return ctx.cache["episodes"]
    jours = sorted(d for d, j in ctx.jours.items() if j.get("abs") == "malade_certif" and ctx.prevu(d) > 0)
    # T-103 (C1 a C5) : B classe chaque absence d'apres les dates du certificat (jours[].certifDu, certifAu) et
    # compte les limites par periode de 12 mois (absences_enfant_malade_art105). Jours deja retenus avant le suivi :
    # contrat.balances.maladieDeduits (nombre) et maladieDeduitsLongue (booleen), a la date contrat.suivi_depuis.
    certs = {}
    for d in jours:
        j = ctx.jours[d]
        cle = (j.get("certifDu"), j.get("certifAu"))
        certs[cle] = {"du": cle[0] and d_(cle[0]), "au": cle[1] and d_(cle[1])}
    bal = ctx.k.get("balances") or {}
    deja = None
    if bal.get("maladieDeduits"):
        deja = {"jours": bal["maladieDeduits"], "longue": bal.get("maladieDeduitsLongue")}
    res = {}
    try:
        r = appel("absences_enfant_malade_art105", ctx.debut, list(certs.values()), jours, deja_retenus=deja,
                  date_debut_suivi=d_(ctx.k.get("suivi_depuis", ctx.k["debut"])))
        for d in jours:
            res[d] = ("ok", r["resultat"]["jours"][d.isoformat()] == "retenu")
    except Refus as e:
        for d in jours:
            res[d] = ("refus", e)
    ctx.cache["episodes"] = res
    return res


def _episodes_maladie_t042(ctx, jours):
    """Ancien calcul (avant T-103), garde pour l'historique ; n'est plus appele."""
    eps = []
    for d in jours:
        if eps:
            prec = eps[-1][-1]
            x = prec + timedelta(days=1)
            lie = True
            while x < d:
                if ctx.prevu(x) > 0:
                    lie = False
                    break
                x += timedelta(days=1)
            if lie:
                eps[-1].append(d)
                continue
        eps.append([d])
    res = {}
    cumul = 0
    for ep in eps:
        jc = (ep[-1] - ep[0]).days + 1
        try:
            r = appel("absence_enfant_malade", len(ep), jc, len(ep), justificatif=True,
                      cumul_anterieur_12_mois_glissants=cumul, cumul_anterieur_depuis_anniversaire=cumul)
            n = r["resultat"]["jours_deductibles"]
            for i, d in enumerate(ep):
                res[d] = ("ok", i < n)
            cumul += n
        except Refus as e:
            for d in ep:
                res[d] = ("refus", e)
    ctx.cache["episodes"] = res
    return res


A_CONFIRMER = ("A77-FERIE-LOCAL", "A77-FERIE-VOISIN", "A77-MAINTIEN-LOCAL")


def qualifier_jour(ctx, d):
    """Renvoie (nature, deductible, minutes_travaillees) ou leve Refus.
    nature : hors, travaille, absence, ferie_chome, ferie_travaille, cp,
    ferie_local_travaille (T-077 : comme un jour travaille, majoration a confirmer),
    a_confirmer (T-077 : B ne dit ni paye ni retenu ; deductible porte alors le refus de B)."""
    try:
        return _qualifier_jour(ctx, d)
    except Refus as e:
        if e.code in A_CONFIRMER:
            return "a_confirmer", e, 0
        raise


def _qualifier_jour(ctx, d):
    prevu = ctx.prevu(d)
    j = ctx.jours.get(d) or {}
    if not ctx.dans_contrat(d):
        return "hors", False, 0
    if ctx.dernier_travaille == "incoherent":
        raise Refus("ERREUR-SAISIE", "qualifier_jour", {"message": "dernier jour travaille hors du contrat ou apres la fin"})
    if ctx.dispense(d):
        # T-074 : jour paye comme s'il avait ete travaille (CCN 64.2, 66, 122 ; F16842), sans travail effectif : pas
        # d'entretien ni de repas (CCN 114.1, 114.2 ; CASF L423-18). Compte pour les CP et l'anciennete (CCN 64.2).
        # T-103 (H7) : une absence (de l'AM ou de l'enfant) pendant le preavis dispense ne reduit pas l'indemnite :
        # CCN 64.2 (indemnite « jusqu'a la date prevue de fin du contrat », egale a la remuneration « correspondant a
        # la duree du preavis »). Le jour reste « dispense ». Restent hors comparateur : CP, presence saisie.
        if j.get("pres") or j.get("ferie_travaille") or ctx.conge(d) == "cp":
            raise Refus("HORS-COMPARATEUR", "qualifier_jour", {"motif": "evenement saisi un jour de preavis dispense"})
        if prevu == 0:
            return "hors", False, 0
        if est_ferie(d):
            raise Refus("PREAVIS-FERIE", "qualifier_jour", {"date": d.isoformat()})
        return "dispense", False, 0
    if prevu == 0:
        if j.get("pres"):
            if est_ferie(d):
                return "ferie_travaille", False, ctx.travail_jour(d)
            if ctx.ferie_local(d):
                return "ferie_local_travaille", False, ctx.travail_jour(d)
            return "travaille", False, ctx.travail_jour(d)
        return "hors", False, 0
    c = ctx.conge(d)
    if c == "cp":
        if len(ctx.historique) > 1:
            # T-072 (T-052) : jours pris dans la periode y, acquis du 1er juin y-1 au 31 mai y (CCN 48.1.1.1).
            # Type de l'acquisition different du type du jour pris : B refuse (AVENANT-CP-A-CONFIRMER).
            y = d.year if d.month >= 6 else d.year - 1
            types = ctx.types_entre(max(date(y - 1, 6, 1), ctx.debut), date(y, 5, 31)) or [ctx.type]
            appel("conges_apres_changement_type", types, ctx.type)
        if ctx.type == "complete":
            if droits_cp_suffisants(ctx, d):
                return "cp", False, 0  # R-CP-07 : salaire mensualise maintenu
            r = appel("qualifier_absence", "conge_complementaire_non_remunere", ctx.type)
            return "absence", r["resultat"]["deductible"], 0
        raise Refus("SANS-REGLE-CP-SEMAINE-PROGRAMMEE", "qualifier_jour")
    if c == "evenement":
        ev = jour_evenement(ctx, d)
        if ev is not None:
            return "absence", ev, 0
        c = None  # T-103 (C7) : ferie chome pendant le conge : suit les regles du ferie ci-dessous
    if c:
        r = appel("qualifier_absence", _TYPE_AM[c], ctx.type, region=ctx.region)
        return "absence", r["resultat"]["deductible"], 0
    jna = [x + timedelta(days=i) for x in ctx.sans_accueil for i in range(7)] if ctx.type == "incomplete" else []
    if ctx.ferie_local(d):
        if j.get("ferie_travaille") or j.get("pres"):
            return "ferie_local_travaille", False, ctx.travail_jour(d)
        # T-077 (R3.1) : B refuse (A77-FERIE-LOCAL) ; sinon le jour n'est pas un jour habituellement travaille.
        r = appel("ferie_chome", d, ctx.jours_travailles, jours_non_accueil=jna, region=ctx.region)
        return "hors", False, 0
    if ctx.pv and est_ferie(d) and not (j.get("ferie_travaille") or j.get("pres")):
        # T-076 : ferie avec un planning variable, lecture F1 (R-PV-12) ; jours de travail lus sur le planning.
        jna = [x + timedelta(days=i) for x in ctx.sans_accueil for i in range(7)] if ctx.type == "incomplete" else []
        prevus = ctx.jours_prevus(d - timedelta(days=21), d + timedelta(days=21))
        r = appel("ferie_chome_planning_variable", d, prevus, jours_non_accueil=jna)
        res = r["resultat"]
        if res.get("jours_condition"):
            av, ap = (d_(x) for x in res["jours_condition"])
            r = appel("ferie_chome_planning_variable", d, prevus, presence_veille=statut_presence(ctx, av),
                      presence_lendemain=statut_presence(ctx, ap), jours_non_accueil=jna)
            res = r["resultat"]
        return "ferie_chome", not res["remuneration_maintenue"], 0
    if est_ferie(d) and not (j.get("ferie_travaille") or j.get("pres")):
        try:
            r = appel("ferie_chome", d, ctx.jours_travailles, jours_non_accueil=jna, region=ctx.region)
            cond = r["resultat"].get("jours_condition")
        except Refus as e:
            if e.code != "A77-FERIE-VOISIN":
                raise
            cond = e.details["jours_condition"]
        res = r["resultat"] if not cond else None
        if cond:
            av, ap = (d_(x) for x in cond)
            r = appel("ferie_chome", d, ctx.jours_travailles, presence_veille=statut_presence(ctx, av),
                      presence_lendemain=statut_presence(ctx, ap), jours_non_accueil=jna, region=ctx.region)
            res = r["resultat"]
        return "ferie_chome", not res["remuneration_maintenue"], 0
    if est_ferie(d):
        return "ferie_travaille", False, ctx.travail_jour(d)
    a = j.get("abs")
    if a == "parents":
        r = appel("qualifier_absence", "enfant_non_prevue", ctx.type)
        return "absence", r["resultat"]["deductible"], 0
    if a == "malade":
        r = appel("absence_enfant_malade", 1, 1, 1, justificatif=False)
        return "absence", r["resultat"]["jours_deductibles"] > 0, 0
    if a == "malade_certif":
        st, v = episodes_maladie(ctx)[d]
        if st == "refus":
            raise v
        return "absence", v, 0
    if a == "sans_solde_enfant":
        # T-039 : remuneree (CCN 105 al. 1, CASF L423-20, service-public F12812).
        r = appel("qualifier_absence", "enfant_sans_solde", ctx.type)
        return "absence", r["resultat"]["deductible"], 0
    return "travaille", False, ctx.travail_jour(d)


# ------------------------------------------------------------------ mois

def mensualise(ctx):
    if "mens" not in ctx.cache:
        try:
            if ctx.pv:
                # T-076 (R-PV-03, P-PV-1) : heures mensualisees du contrat ; lecture L1 ou L2 donnee par B.
                def mins(pl):
                    return {j: sum(b - a for a, b in p) for j, p in pl.items()}
                cyc = None
                if ctx.pv_cycle is not None:
                    cyc = [mins(pl) for pl in ctx.pv_cycle]
                r = appel("mensualisation_planning_variable", ctx.semaines, str(ctx.k["heures_mensualisees"]),
                          ctx.taux, cycle=cyc)
                ctx.pv_lecture = r["resultat"]["lecture"]
                ctx.pv_base = r["resultat"]["base_hebdo_minutes"]
                ctx.pv_base_contrat = r["resultat"].get("base_contrat_minutes")  # D16 (S2)
            elif ctx.cdd and ctx.type == "complete":
                r = appel("mensualisation_cdd", ctx.hebdo, ctx.taux)  # T-076, R-CDD-04
            else:
                r = appel("mensualisation", ctx.semaines, ctx.hebdo, ctx.taux)
            ctx.cache["mens"] = r["resultat"]["salaire_mensualise_centimes"]
        except Refus as e:
            ctx.cache["mens"] = e
    v = ctx.cache["mens"]
    if isinstance(v, Refus):
        raise v
    return v


def derive(e, f):
    """Refus derive d'un refus a lectures : memes code et details, valeurs transformees par f."""
    det = dict(e.details)
    if "lectures_valeurs" in det:
        det["lectures_valeurs"] = sorted({f(x) for x in det["lectures_valeurs"]})
    return Refus(e.code, e.etape, det)


def mois_b(ctx, m):
    """Sorties d'un mois. Chaque sortie : valeur ou Refus."""
    if isinstance(ctx, _CtxRefus):
        return {n: ctx.refus for n in _CLES_MOIS}
    key = ("mois", m)
    if key in ctx.cache:
        return ctx.cache[key]
    out = {}
    a, b = premier(m), dernier(m)
    jours = list(jours_entre(a, b))

    def garde(nom, f):
        try:
            out[nom] = f()
        except Refus as e:
            out[nom] = e

    # Qualification de chaque jour
    qual = {}
    refus_jour = None
    for d in jours:
        try:
            qual[d] = qualifier_jour(ctx, d)
        except Refus as e:
            qual[d] = e
            refus_jour = refus_jour or e

    garde("salaire_mensualise", lambda: mensualise(ctx))

    a_conf = []  # T-077 : jours a confirmer du mois [(date, unites, Refus)]

    def deduction():
        mens = mensualise(ctx)
        unites = 0
        entree = ctx.debut > a
        sortie = ctx.fin is not None and ctx.fin < b
        if entree:
            # T-035a (MB3) : fiches DREETS Occitanie du 19/01/2023, « Embauche et fin de
            # contrat en cours de mois » : deduction de l'art. 111 (R-EMB-01).
            r = appel("qualifier_absence", "embauche_en_cours_de_mois", ctx.type)
            if r["resultat"]["deductible"]:
                for d in jours:
                    if d < ctx.debut:
                        x = ctx.prevu_hors_dates(d)
                        if x:
                            unites += x if ctx.type == "complete" else 1
        for d in jours:
            if d < ctx.debut:
                continue
            q = qual[d]
            if isinstance(q, Refus):
                raise q
            nature, ded, _ = q
            if nature == "a_confirmer":
                a_conf.append((d, ctx.prevu(d) if ctx.type == "complete" else 1, ded))
                continue
            if nature == "absence" and ded or nature == "ferie_chome" and ded:
                unites += ctx.prevu(d) if ctx.type == "complete" else 1
        if sortie:
            r = appel("qualifier_absence", "fin_contrat_en_cours_de_mois", ctx.type)
            if r["resultat"]["deductible"]:
                for d in jours:
                    if d > ctx.fin:
                        x = ctx.prevu_hors_dates(d)
                        if x:
                            unites += x if ctx.type == "complete" else 1
        # T-074 : jour du planning hors du contrat dans une semaine sans accueil (mois d'entree ou de sortie) :
        # B dit s'il se deduit (aujourd'hui : refus SORTIE-SEMAINE-SANS-ACCUEIL, a confirmer).
        _hors_contrat_sans_accueil(ctx, jours)
        def ded_de(u):
            if u == 0:
                return 0
            if ctx.pv:
                # T-076 (R-PV-08) : denominateur sur le planning de chaque semaine du mois.
                lundis = sorted({lundi(d) for d in jours})
                def plan_lu(lu):
                    # D6 (decisions, section 4) : en S2, une semaine sans accueil suit la regle du planning fixe
                    # (art. 111 ; T-040 : comptee avec le planning du contrat, champ `planning`).
                    if ctx.pv_semaines is not None and ctx.type == "incomplete" and lu in ctx.sans_accueil:
                        return dict(ctx.plan_min)
                    return {j: sum(y - x for x, y in p) for j, p in ctx.semaine_pv(lu).items()}
                plans = {lu: plan_lu(lu) for lu in lundis}
                p = appel("prevu_du_mois_planning_variable", a.year, a.month, plans, ctx.type)
            else:
                plan0 = {j: v for j, v in ctx.plan_min.items()}
                contient = ctx.type == "incomplete" and any(lundi(d) in ctx.sans_accueil for d in jours)
                p = appel("prevu_du_mois", a.year, a.month, plan0, ctx.type, contient_semaine_non_accueil=contient)
            prevu = p["resultat"]["prevu_minutes"] if ctx.type == "complete" else p["resultat"]["prevu_jours"]
            r = appel("deduction_absence", ctx.type, mens, u, prevu)
            return r["resultat"]["deduction_centimes"]

        if not a_conf:
            return ded_de(unites)
        # T-077 (R3.1, R3.3, R4) : chaque jour a confirmer est paye ou retenu selon la lecture. Valeurs possibles de la
        # deduction : toutes les combinaisons par code de B (meme lecture pour tous les jours d'un meme code).
        groupes = {}
        for d, u, e in a_conf:
            groupes.setdefault(e.code, []).append((d, u))
        codes = list(groupes)
        valeurs = set()
        for n in range(len(codes) + 1):
            for sel in combinations(codes, n):
                valeurs.add(ded_de(unites + sum(u for c in sel for _, u in groupes[c])))
        if len(valeurs) == 1:
            return valeurs.pop()
        premier_refus = a_conf[0][2]
        sans = ded_de(unites)
        details = {"lectures_valeurs": sorted(valeurs), "codes": codes,
                   "jours_a_confirmer": [{"date": d.isoformat(), "code": e.code, "lectures": e.details.get("lectures")}
                                         for d, _, e in a_conf],
                   "montant_a_confirmer_centimes": ded_de(unites + sum(u for _, u, _ in a_conf)) - sans,
                   "note": "Deduction de l'art. 111 sans les jours a confirmer, puis avec. Pour A77-MAINTIEN-LOCAL, la "
                           "valeur sans retenue est avant deduction des IJ (lecture A)."}
        raise Refus(premier_refus.code, "deduction", dict(details, deduction_certaine_centimes=sans))

    def ij_du_mois():
        # T-103 (C9) : conge de deuil du mois : salaire maintenu sous deduction des IJ de la CPAM (CCN 48.1.3.1.3).
        # Montant saisi par conge (absences_am[].ijSecu, centimes) ; un conge a cheval sur deux mois : la repartition
        # des IJ n'est pas un fait de la situation, refus visible.
        # T-103 (R3) : Alsace-Moselle, maladie de l'AM ou de son enfant : salaire maintenu moins les IJ saisies
        # (absences_am[].ijSecu, centimes) ; B refuse sans elles (R3-IJ-MANQUANTES).
        tot = 0
        for l in ctx.conges:
            deuil = l["type"] == "evenement" and l.get("nature") == "deuil"
            local = ctx.region == "alsace_moselle" and l["type"] in ("am_malade", "am_enfant_malade")
            if not (deuil or local) or l["au"] < a or l["du"] > b:
                continue
            if l["du"] < a or l["au"] > b:
                raise Refus("HORS-COMPARATEUR", "ij", {"motif": "absence avec IJ a cheval sur deux mois"})
            if deuil:
                tot += appel("conge_deuil", l["du"], l.get("ijSecu"))["resultat"]["deduction_ij_centimes"]
            else:
                tot += appel("maintien_droit_local", l.get("ijSecu"))["resultat"]["deduction_ij_centimes"]
        return tot

    garde("deduction", lambda: deduction() + ij_du_mois())

    def base():
        ded = out["deduction"]
        if isinstance(ded, Refus):
            raise derive(ded, lambda x: mensualise(ctx) - x)
        return mensualise(ctx) - ded

    garde("salaire_base_mois", base)

    # Heures en plus par semaine civile
    hc_minutes = [0]  # T-076 (N1) : minutes de HC payees dans le mois (part sure), pour la regularisation L2

    def heures():
        hc = hm = hn = 0  # verif-1 (B-4) : hn = heures normales qui compensent une retenue
        hc_haut = 0  # T-076 : plus grande lecture des HC (D1, D4)
        d16 = [0, 0]  # T-076, D16 : HC du mois, lecture 1 (planning remis) et lecture 2 (duree du contrat)
        semaines = sorted({lundi(d) for d in jours})
        for lu in semaines:
            sem = [lu + timedelta(days=i) for i in range(7)]
            extra = 0
            reelles = 0
            absence = False
            contrat_min = 0
            mai = payees = 0  # T-076, D1 : heures prevues non travaillees mais payees (1er mai ; autres)
            cp_min = 0  # T-103 (H1) : heures prevues des jours de conge paye de la semaine
            retenue = False   # T-076, D2 : absence deduite (art. 111) dans la semaine
            ret_min = 0  # verif-1 (B-4) : heures prevues retenues de la semaine
            p_h9 = 0  # verif-1 (B-3) : heures prevues des absences payees hors CP et 1er mai
            for d in sem:
                pv = ctx.prevu(d)
                contrat_min += pv
                if d < a or d > b:
                    q = qualifier_jour(ctx, d)
                else:
                    q = qual[d]
                if isinstance(q, Refus):
                    if q.code in REFUS_BLOQUANTS:
                        raise q
                    # Jour non travaille dont la paie est refusee par B : c'est bien une absence dans la semaine.
                    q = ("absence", None, 0)
                nature, ded, mt = q
                if nature in ("travaille", "ferie_travaille", "ferie_local_travaille"):
                    reelles += mt
                    extra += max(0, mt - pv)
                elif pv > 0:
                    absence = True
                    if nature == "cp":
                        cp_min += pv
                    if ded is None or ded:
                        retenue = True
                        ret_min += pv
                    elif nature == "ferie_chome" and d.month == 5 and d.day == 1:
                        mai += pv
                    else:
                        payees += pv
                        if nature != "cp":
                            p_h9 += pv
            if ctx.pv:
                # T-076 (R-PV-04, R-PV-05) : HC sur le prevu de la semaine (L1) ou sur la base du contrat (L2).
                mensualise(ctx)
                kw = {}
                if ctx.pv_lecture == "L1":
                    ref, haut = contrat_min, reelles + cp_min + mai  # T-103 (H1, D1)
                    kw["absence_dans_semaine"] = absence
                    if ctx.pv_base_contrat is not None:
                        # D16 : planning remis, seconde reference = duree hebdomadaire du contrat.
                        kw["base_contrat_minutes"] = ctx.pv_base_contrat
                        ref = min(ref, Fraction(ctx.pv_base_contrat))
                else:
                    # D1, D2, D4 (decisions, section 4) : faits comptes ici, regle appliquee par B.
                    ref, haut = Fraction(ctx.pv_base), reelles + mai + cp_min  # T-103 (H1 ; H2 revu, H3)
                    n_in = sum(1 for d in sem if ctx.prevu(d) > 0)
                    n_sem = sum(1 for d in sem if ctx.prevu_hors_dates(d) > 0)
                    if n_in != n_sem:
                        kw["prorata_base"] = (n_in, n_sem)
                        ref = ref * n_in / n_sem
                    kw.update(absence_dans_semaine=retenue, absence_retenue=retenue, minutes_1er_mai_chome=mai)
                kw["minutes_conges_payes"] = cp_min  # T-103 (H1)
                kw["minutes_payees_non_travaillees"] = p_h9  # verif-1 (B-3)
                kw["minutes_retenues"] = ret_min  # verif-1 (B-4)
                kw["minutes_en_plus_des_jours"] = extra
                if ctx.pv_lecture == "L1":
                    kw["minutes_1er_mai_chome"] = mai
                    if ctx.pv_base_contrat is not None:
                        ref = Fraction(ctx.pv_base_contrat)  # verif-1 (B-5) : reference = duree du contrat
                if sum(calcul_h9(Fraction(ref), Fraction(reelles), Fraction(cp_min), Fraction(mai), Fraction(p_h9),
                                 Fraction(ret_min), Fraction(extra))) == 0:
                    continue
                if lu < a or lu + timedelta(days=6) > b:
                    raise Refus("HORS-COMPARATEUR", "heures", {"motif": "semaine a cheval sur deux mois"})
                r = appel("heures_en_plus_semaine_planning_variable", ctx.pv_lecture, contrat_min, ctx.pv_base,
                          reelles, ctx.taux, ctx.maj_hm, majoration_hc_pourcent=ctx.maj_hc, **kw)
                lo, hi = r["resultat"]["lectures_montant_complementaires"]
                hc_minutes[0] += Fraction(r["resultat"]["minutes_complementaires"])
                hc += lo
                hc_haut += hi - lo
                hm += r["resultat"]["montant_majorees_centimes"]
                hn += r["resultat"]["montant_normales_centimes"]
                continue
            if extra == 0:
                continue
            if lu < a or lu + timedelta(days=6) > b:
                raise Refus("HORS-COMPARATEUR", "heures", {"motif": "semaine a cheval sur deux mois"})
            # T-103 (H1 a H4, H6) : conges payes et 1er mai chome comptes ; autres jours non effectues non comptes ;
            # base = heures prevues de la semaine dans le contrat ; retenue a part. Remplace le refus A-09.
            # verif-1 (B-3, B-4) : absence payee comptee pour la duree du contrat ; retenue compensee d'abord.
            r = appel("heures_en_plus_semaine_h9", contrat_min, reelles, ctx.taux, ctx.maj_hm,
                      majoration_hc_pourcent=ctx.maj_hc, minutes_conges_payes=cp_min, minutes_1er_mai_chome=mai,
                      minutes_payees_non_travaillees=p_h9, minutes_retenues=ret_min, minutes_en_plus_des_jours=extra)
            hc += r["resultat"]["montant_complementaires_centimes"]
            hm += r["resultat"]["montant_majorees_centimes"]
            hn += r["resultat"]["montant_normales_centimes"]
        if d16 != [0, 0]:
            return Lect(hc + min(d16), [hc + d16[0], hc + d16[1]]), hm, hn
        if hc_haut:
            return Lect(hc, [hc, hc + hc_haut]), hm, hn
        return hc, hm, hn

    garde("_heures", heures)
    out["_hc_minutes"] = hc_minutes[0]

    def partie(i):
        v = out["_heures"]
        if isinstance(v, Refus):
            raise v
        return v[i]

    garde("heures_compl_montant", lambda: partie(0))
    garde("heures_maj_montant", lambda: partie(1))

    def accueil(d):
        """T-042f : duree d'accueil reelle du jour (presence de l'enfant), en minutes : la presence saisie dans la
        situation, sinon les heures prevues (l'enfant est la comme prevu). Meme presence que celle donnee a A."""
        j = ctx.jours.get(d) or {}
        if j.get("pres"):
            return sum(minutes(b) - minutes(a_) for a_, b in j["pres"])
        return ctx.prevu(d)

    def ferie_trav():
        maj = 0
        dernier_refus = None
        for d in jours:
            q = qual[d]
            if isinstance(q, Refus):
                if q.code in REFUS_BLOQUANTS[1:]:
                    raise q  # T-076 : planning refuse, ferie travaille inconnu
                continue
            if q[0] == "ferie_travaille":
                appel("ferie_travaille", d)
        for d in jours:
            q = qual[d]
            if isinstance(q, Refus) or q[0] != "ferie_local_travaille":
                continue
            # T-077 (R3.2) : B refuse toujours (A77-FERIE-LOCAL-TRAVAILLE) et donne la majoration de la lecture A.
            try:
                appel("ferie_local_travaille", d, ctx.region, accueil(d), ctx.taux)
            except Refus as e:
                if e.code != "A77-FERIE-LOCAL-TRAVAILLE":
                    raise
                maj += e.details["lectures"]["A"]
                dernier_refus = e
        if dernier_refus is not None:
            raise Refus(dernier_refus.code, "ferie_local_travaille",
                        dict(dernier_refus.details, lectures_valeurs=sorted({0, maj})))
        return 0

    garde("ferie_travaille_montant", ferie_trav)

    def total():
        for n in ("_heures",):
            if isinstance(out[n], Refus):
                raise out[n]
        # T-077 : deduction ou majoration a confirmer -> refus avec les valeurs possibles du total.
        ded, ft = out["deduction"], out["ferie_travaille_montant"]
        for v in (ded, ft):
            if isinstance(v, Refus) and "lectures_valeurs" not in v.details:
                raise v
        deds = ded.details["lectures_valeurs"] if isinstance(ded, Refus) else [ded]
        majs = ft.details["lectures_valeurs"] if isinstance(ft, Refus) else [0]
        tot = set()
        for x in deds:
            r = appel("salaire_du_mois", mensualise(ctx), list(out["_heures"]), x)
            for mj in majs:
                tot.add(r["resultat"]["salaire_brut_mois_centimes"] + mj)
        if len(tot) == 1:
            v = tot.pop()
            lect = getattr(out["_heures"][0], "lectures", None)
            if lect:
                hors_hc = v - int(out["_heures"][0])
                return Lect(v, [hors_hc + lect[0], hors_hc + lect[1]])  # T-076 (D1, D4, D16) : HC en deux lectures
            return v
        e = ded if isinstance(ded, Refus) else ft
        raise Refus(e.code, e.etape, dict(e.details, lectures_valeurs=sorted(tot)))

    garde("salaire_mois_hors_cp", total)

    def reel_contrat():
        # T-076, CDD point P1 : heures reellement effectuees dans la limite du prevu de chaque jour (les heures en
        # plus sont payees a part). Fait du calendrier.
        n = 0
        for d in jours:
            q = qual[d]
            if isinstance(q, Refus):
                raise q
            if q[0] in ("travaille", "ferie_travaille"):
                n += min(q[2], ctx.prevu(d))
            elif ctx.prevu(d) > 0 and q[0] in ("ferie_chome", "absence", "cp") and not q[1]:
                # D7 : heures payees par un autre texte (ferie chome CCN 47, absence remuneree de l'enfant CASF
                # L423-20 et CCN 105) ; seules les absences non payees de l'AM sont retirees.
                n += ctx.prevu(d)
        return n

    garde("_reel_contrat", reel_contrat)

    # Indemnites
    def jours_effectifs():
        res = []
        for d in jours:
            q = qual[d]
            if isinstance(q, Refus):
                if q.code in REFUS_BLOQUANTS:
                    raise q  # T-076 : planning inconnu ou refuse : le jour n'est pas qualifie, rien n'est mis a 0
                continue  # jour d'absence ou ferie chome : pas de travail effectif (R-ABS-10)
            if q[0] in ("travaille", "ferie_travaille", "ferie_local_travaille") and q[2] > 0:
                res.append((d, q[2]))
        return res

    def jour_b(d, mt):
        # T-042f (MB5, T-040e) : duree_minutes = temps de travail (art. 99) ; duree_accueil_minutes = presence reelle.
        return {"duree_minutes": mt, "duree_accueil_minutes": accueil(d), "travail_effectif": True}

    def entretien():
        # Montant HORAIRE au contrat (CCN art. 114.1 « par heure de travail ») : B le recoit tel quel.
        js = jours_effectifs()
        if ctx.k.get("entretien_horaire") is not None:
            r = appel("indemnite_entretien_mois", [jour_b(d, mt) for d, mt in js],
                      ctx.k["entretien_horaire"], a)
            return r["resultat"]["indemnite_centimes"]
        # T-103 (M2, M3) : tarif PAR JOUR au contrat (contrat.entretien_jour, centimes par journee). B le recoit tel
        # quel (montant_journalier_contrat_centimes) : du pour chaque journee de travail effectif, quelle que soit sa
        # duree, jour hors planning compris ; minimum de 114.1 sur la duree de travail de l'art. 99. Remplace le refus
        # ENTRETIEN-TARIF-JOUR de T-042c.
        if not js:
            return 0
        r = appel("indemnite_entretien_mois", [jour_b(d, mt) for d, mt in js], None, a,
                  montant_journalier_contrat_centimes=ctx.k.get("entretien_jour", 0))
        return r["resultat"]["indemnite_centimes"]

    garde("entretien", entretien)

    def repas():
        js = jours_effectifs()
        n = 0
        for d, _ in js:
            j = ctx.jours.get(d) or {}
            n += j.get("repas", ctx.k.get("repas_par_jour", 0))
        r = appel("indemnite_repas_mois", n, ctx.k.get("repas_prix", 0))
        return r["resultat"]["indemnite_centimes"]

    garde("repas", repas)

    def km():
        # T-027 : un trajet par jour saisi ; partage si plusieurs familles ont demande le trajet (fait saisi).
        trajets = []
        for d in jours:
            j = ctx.jours.get(d) or {}
            if j.get("km"):
                if j.get("km_partage") is None:
                    # Fait manquant : d'autres familles ont-elles demande le trajet ? (CCN art. 113)
                    raise Refus("KM-PARTAGE-NON-SAISI", "indemnite_kilometrique_mois")
                trajets.append({"date": d, "km": str(j["km"]),
                                "employeurs_demandeurs": 2 if j.get("km_partage") else 1,
                                "enfants_de_cet_employeur": 1,
                                "enfants_transportes": j.get("km_enfants") or 1})
        if not trajets:
            return 0
        if ctx.k.get("km_cv") is None:
            raise Refus("KM-PUISSANCE-INCONNUE", "indemnite_kilometrique_mois")
        r = appel("indemnite_kilometrique_mois", trajets, ctx.k.get("km_taux", 0), ctx.k["km_cv"],
                  electrique=ctx.k.get("km_electrique"))
        return r["resultat"]["indemnite_centimes"]

    garde("km", km)
    if isinstance(out["_heures"], Refus) and out["_heures"].code == "PV-L2-ABSENCE-HC":
        # T-076, D2 (N2) : le mois n'est pas calcule ; aucune sortie partielle « ok ».
        out = {n: (out["_heures"] if not n.startswith("_") else v) for n, v in out.items()}
    ctx.cache[key] = out
    return out


# ------------------------------------------------------------------ conges payes

def periode(y):
    return date(y, 6, 1), date(y + 1, 5, 31)


def acquisition_b(ctx, y):
    key = ("acq", y)
    if key in ctx.cache:
        return ctx.cache[key]
    p0, p1 = periode(y)
    a = max(p0, ctx.debut)
    b = min(p1, ctx.fin) if ctx.fin else p1
    res = {}
    if a > b:  # T-103 : periode sans jour de contrat (etait limite au planning variable et au CDD, T-076)
        # T-076 : periode de reference sans aucun jour de contrat : aucun jour acquis (ni jours pour enfants).
        res = {"jours_acquis": 0, "jours_enfants": 0, "jours_acquis_hors_enfants": 0}
        ctx.cache[key] = res
        return res
    try:
        malade = [d for d in jours_entre(a, b) if ctx.conge(d) == "am_malade"]
        non_assimile = [d for d in jours_entre(a, b) if ctx.conge(d) in ("sans_solde", "am_enfant_malade")]
        complete_periode = a == p0 and b == p1 and ctx.type == "complete" and not malade and not non_assimile
        if True:
            # T-103 (C10, C11) : B compte lui-meme mois complets, semaines et jours (Cass. soc. 10/01/1980 ; CCN
            # 48.1.1.2) a partir des faits : bornes, absences non assimilees, arret maladie, semaines sans accueil.
            sa = sorted(x for x in ctx.sans_accueil if x + timedelta(days=6) >= a and x <= b) \
                if ctx.type == "incomplete" else []
            cpam = None if ctx.k.get("semaines_cp_am") is None else [d_(x) for x in ctx.k["semaines_cp_am"] if d_(x) in sa]
            kw_cp = {}
            if cpam:
                # verif-1 (B-2) : droits acquis sur la periode precedente (pris pendant celle-ci), calcules par B.
                prec = acquisition_b(ctx, y - 1)["jours_acquis"]
                if isinstance(prec, Refus):
                    raise prec
                kw_cp["droits_cp_disponibles"] = prec
            if not ctx.pv:
                kw_cp["jours_travail_semaine"] = sorted(ctx.jours_travailles)  # verif-1 (B-1), decompte journalier
            r = appel("acquisition_cp_periode", ctx.type, a, b, jours_non_assimiles=non_assimile,
                      jours_arret_maladie=malade, semaines_sans_accueil=sa, semaines_cp_am=cpam, **kw_cp)
        elif complete_periode:
            r = appel("acquisition_cp", "complete", periode_complete=True)
        else:
            mois_list = list(mois_entre(a, b))
            if ctx.type == "complete":
                # mois civils entiers de travail (sans maladie ni absence non assimilee)
                mois_n = sum(1 for m in mois_list
                             if premier(m) >= a and dernier(m) <= b
                             and not any(premier(m) <= d <= dernier(m) for d in malade + non_assimile))
                sem = Fraction((b - a).days + 1 - len(malade) - len(non_assimile), 7)
            else:
                # semaines d'accueil programmees et mois civils contenant de l'accueil
                lundis = {lundi(d) for d in jours_entre(a, b) if ctx.prevu(d) > 0}
                sem = Fraction(len([x for x in lundis if x >= a and x + timedelta(days=6) <= b]))
                mois_n = sum(1 for m in mois_list if any(ctx.prevu(d) > 0 for d in jours_entre(premier(m), dernier(m))))
            jours_trav = sum(1 for d in jours_entre(a, b) if ctx.prevu(d) > 0 and ctx.conge(d) not in ("am_malade", "sans_solde", "am_enfant_malade"))
            kw = {}
            if malade:
                mm = sum(1 for m in mois_entre(a, b) if all(ctx.conge(d) == "am_malade" for d in jours_entre(premier(m), dernier(m))))
                kw = dict(mois_arret_maladie=mm, semaines_arret_maladie=str(Fraction(len(malade), 7)),
                          date_fin_periode=b)
            if ctx.pv:
                # T-076 (R-PV-09, CCN 48.1.1.2) : nombre de jours par semaine variable ; B recoit mois et semaines.
                r = appel("acquisition_cp", ctx.type, mois=mois_n, semaines=str(sem), **kw)
            else:
                r = appel("acquisition_cp", ctx.type, mois=mois_n, semaines=str(sem), jours=jours_trav,
                          jours_par_semaine=len(ctx.jours_travailles), **kw)
        ja = r["resultat"]["jours_acquis"]
        e = appel("jours_enfants_a_charge", ja, ctx.k.get("age_am", 35), ctx.k.get("enfants_a_charge", 0),
                  periode_atteint_31_mai=(b == p1))
        res = {"jours_acquis": e["resultat"]["total"], "jours_enfants": e["resultat"]["jours_supplementaires"],
               "jours_acquis_hors_enfants": ja}
    except Refus as ex:
        res = {"jours_acquis": ex, "jours_enfants": ex, "jours_acquis_hors_enfants": ex}
    ctx.cache[key] = res
    return res


def heures_prevues_periode(ctx, a, b):
    """Planning variable : heures prevues et semaines prevues travaillees des semaines dont le lundi est dans [a, b]
    (faits du planning ; servent a la lecture C1 de P-PV-5)."""
    hp = n = 0
    lu = lundi(a) if lundi(a) >= a else lundi(a) + timedelta(days=7)
    while lu <= b:
        h = sum(ctx.prevu(lu + timedelta(days=i)) for i in range(7))
        hp += h
        n += 1 if h > 0 else 0
        lu += timedelta(days=7)
    return hp, n


def salaires_periode(ctx, a, b, avec_cp=True):
    total = 0
    for m in mois_entre(a, b):
        if not any(ctx.dans_contrat(d) for d in jours_entre(premier(m), dernier(m))):
            continue
        v = mois_b(ctx, m)["salaire_mois_hors_cp"]
        if isinstance(v, Refus):
            raise v
        total += v
    return total


def icp_periode(ctx, y, a, b):
    """Indemnites de CP selon les deux lectures de A-28 : versees pendant la
    periode [a, b] (complement de juin en annee complete, indemnites en annee
    incomplete), et indemnite de la periode precedente. Valeurs donnees par B."""
    pendant = 0
    for m in mois_entre(a, b):
        if not any(ctx.dans_contrat(d) for d in jours_entre(premier(m), dernier(m))):
            continue
        cm = cp_mois_b(ctx, m)
        for k in ("cp_indemnite_mois", "cp_complement_mois"):
            if isinstance(cm[k], Refus):
                raise cm[k]
            pendant += cm[k]
    prec = 0
    if date(y - 1, 6, 1) <= (ctx.fin or date(9999, 1, 1)) and ctx.debut <= date(y, 5, 31):
        pi = indemnite_b(ctx, y - 1)["indemnite_cp"]
        if isinstance(pi, Refus):
            raise pi
        prec = pi
    return pendant, prec


def indemnite_b(ctx, y):
    key = ("ind", y)
    if key in ctx.cache:
        return ctx.cache[key]
    p0, p1 = periode(y)
    a = max(p0, ctx.debut)
    b = min(p1, ctx.fin) if ctx.fin else p1
    try:
        acq = acquisition_b(ctx, y)
        j = acq["jours_acquis"]
        if isinstance(j, Refus):
            raise j
        if j == 0:
            res = {"indemnite_cp": 0, "maintien_cp": 0, "ind": None}
        elif ctx.pv:
            # T-076 (R-PV-10, P-PV-5) : maintien en deux lectures C1 / C2, compare au dixieme par B.
            sal = salaires_periode(ctx, a, b)
            icp_pendant, icp_prec = icp_periode(ctx, y, a, b)
            hp, n = heures_prevues_periode(ctx, a, b)
            # Lecture C2 : heures prevues des jours de conge pris pour ce droit (periode de prise y+1), seulement si
            # le droit est pris en entier (jours decomptes par B).
            q0, q1 = periode(y + 1)
            pris = jours_c = 0
            for l in sorted([x for x in ctx.conges if x["type"] == "cp" and q0 <= x["du"] <= q1], key=lambda x: x["du"]):
                reprise = l["au"] + timedelta(days=1)
                while ctx.prevu(reprise) == 0 or est_ferie(reprise):
                    reprise += timedelta(days=1)
                pris += decompte_b(ctx, l["du"], reprise)
                jours_c += sum(ctx.prevu(x) for x in jours_entre(l["du"], l["au"]) if not est_ferie(x))
            hc = jours_c if pris == j else None
            r = appel("indemnite_cp_planning_variable", j, ctx.taux, hp, n, hc, sal, icp_pendant, icp_prec,
                      jours_supplementaires=acq["jours_enfants"])
            res = {"indemnite_cp": Lect(r["resultat"]["indemnite_centimes"], r["resultat"]["lectures"]),
                   "maintien_cp": Refus("P-PV-5", "maintien"), "ind": r}
        else:
            sal = salaires_periode(ctx, a, b)
            icp_pendant, icp_prec = icp_periode(ctx, y, a, b)
            r = appel("indemnite_cp", j, ctx.hebdo, ctx.taux, sal, icp_pendant, icp_prec, None, acq["jours_enfants"],
                      type_annee=ctx.type)  # T-103 (C12)
            mc = r["resultat"].get("maintien_centimes")  # T-040d : ARR-01 applique dans B
            res = {"indemnite_cp": r["resultat"]["indemnite_centimes"],
                   "maintien_cp": mc if mc is not None else Refus("MAINTIEN-PLUSIEURS-FORMULES", "maintien"),
                   "ind": r}
    except Refus as ex:
        res = {"indemnite_cp": ex, "maintien_cp": ex, "ind": ex}
    ctx.cache[key] = res
    return res


def cp_mois_b(ctx, m):
    d = premier(m)
    y = d.year if d.month >= 6 else d.year - 1
    prev = y - 1
    out = {}
    ind = indemnite_b(ctx, prev)
    if ctx.type == "complete":
        out["cp_indemnite_mois"] = 0
        try:
            if d.month != 6:
                out["cp_complement_mois"] = 0
            else:
                if isinstance(ind["ind"], Refus):
                    raise ind["ind"]
                if ind["ind"] is None:
                    out["cp_complement_mois"] = 0
                else:
                    r = appel("complement_cp_planning_variable" if ctx.pv else "complement_cp_annee_complete",
                              ind["ind"])
                    out["cp_complement_mois"] = r["resultat"]["complement_centimes"]
        except Refus as ex:
            out["cp_complement_mois"] = ex
        return out
    out["cp_complement_mois"] = 0
    try:
        if isinstance(ind["indemnite_cp"], Refus):
            raise ind["indemnite_cp"]
        mode = {"juin": "juin", "principale": "prise_principale", "fur": "fur_et_a_mesure"}[ctx.k.get("cp_mode", "juin")]
        kw = {}
        if mode == "prise_principale":
            p0, p1 = periode(y)
            best = None
            for l in ctx.conges:
                if l["type"] != "cp" or l["au"] < p0 or l["du"] > p1:
                    continue
                n = sum(1 for x in jours_entre(l["du"], l["au"]) if x.weekday() <= 5 and not est_ferie(x))
                if best is None or n > best[1]:
                    best = (l["du"], n)
            kw["mois_prise_principale"] = best[0].month if best else 6
        mens = mensualise(ctx)
        r = appel("paiement_cp_annee_incomplete", mode, ind["indemnite_cp"], mens, d.month, **kw)
        out["cp_indemnite_mois"] = r["resultat"]["montant_cp_du_mois_centimes"]
        lect = getattr(ind["indemnite_cp"], "lectures", None)
        if lect and out["cp_indemnite_mois"]:
            out["cp_indemnite_mois"] = Lect(out["cp_indemnite_mois"], lect)  # T-076 : lectures C1 / C2
    except Refus as ex:
        out["cp_indemnite_mois"] = ex
    return out


# ------------------------------------------------------------------ fin de contrat

# T-050c : part du net dans le brut utilisee par A pour estimer le brut (src/engine/rates.ts, NET_BRUT = 7810, la meme
# pour toutes les periodes). Arrondi de Math.round (demi vers le haut). Sert seulement a l'assiette du 1/80.
NET_SUR_BRUT_A = 7810  # metropole ; T-077 (R1) : part par region et par mois, donnee par B (brut_depuis_net).


def _brut_comme_a(net, ctx=None, mois=None):
    """Brut estime depuis le net (R1), mois de salaire « mois » (AAAA-MM). La part vient de B (regions.py)."""
    region = ctx.region if ctx else "metropole"
    d = premier(mois) if mois else date(2026, 1, 1)
    return appel("brut_depuis_net", net, d, region)["resultat"]["brut_estime_centimes"]

def _unite(ctx, d):
    """Unite de l'art. 111 pour un jour du planning (minutes en annee complete, 1 jour en annee incomplete ;
    0 hors planning et en semaine sans accueil), comme dans la deduction de mois_b."""
    x = ctx.plan_min.get(d.weekday(), 0)
    if ctx.type == "incomplete" and lundi(d) in ctx.sans_accueil:
        x = 0
    if not x:
        return 0
    return x if ctx.type == "complete" else 1

def _hors_contrat_sans_accueil(ctx, jours):
    if ctx.type != "incomplete":
        return
    for d in jours:
        if (d < ctx.debut or (ctx.fin is not None and d > ctx.fin)) and lundi(d) in ctx.sans_accueil \
                and ctx.plan_min.get(d.weekday(), 0):
            appel("qualifier_absence", "hors_contrat_semaine_non_accueil", ctx.type)

def icp_b(ctx):
    """T-074 : indemnite de preavis des jours dispenses, demandee a B (indemnite_preavis_dispense). L'adaptateur
    ne fait que compter les jours du calendrier. Renvoie (total, detail par mois, lectures) ; leve Refus."""
    if "icp" in ctx.cache:
        v = ctx.cache["icp"]
        if isinstance(v, Refus):
            raise v
        return v
    try:
        mens = mensualise(ctx)
        mois_l = []
        noms = list(mois_entre(ctx.dernier_travaille + timedelta(days=1), ctx.fin))
        for m in noms:
            a, b = premier(m), dernier(m)
            jours = list(jours_entre(a, b))
            for d in jours:
                q = qualifier_jour(ctx, d)  # leve PREAVIS-FERIE ou HORS-COMPARATEUR
            disp = [d for d in jours if ctx.dispense(d) and ctx.prevu(d) > 0]
            payes_hors_dispense = [d for d in jours if ctx.dans_contrat(d) and not ctx.dispense(d) and ctx.prevu(d) > 0]
            sna = ctx.type == "incomplete" and any(ctx.dispense(d) and lundi(d) in ctx.sans_accueil
                                                   and ctx.plan_min.get(d.weekday(), 0) for d in jours)
            contient = ctx.type == "incomplete" and any(lundi(d) in ctx.sans_accueil for d in jours)
            p = appel("prevu_du_mois", a.year, a.month, dict(ctx.plan_min), ctx.type,
                      contient_semaine_non_accueil=contient)
            prevu = p["resultat"]["prevu_minutes"] if ctx.type == "complete" else p["resultat"]["prevu_jours"]
            _hors_contrat_sans_accueil(ctx, jours)  # meme regle que la deduction du mois
            non_payes = sum(_unite(ctx, d) for d in jours if d < ctx.debut or d > ctx.fin)
            mois_l.append({"salaire_mensualise_centimes": mens, "prevu_mois": prevu, "non_payes": non_payes,
                           "mixte": bool(payes_hors_dispense),
                           "prevu_dispense": sum(_unite(ctx, d) for d in disp),
                           "minutes_dispense": sum(ctx.prevu(d) for d in disp),
                           "semaine_sans_accueil_dans_dispense": sna})
        r = appel("indemnite_preavis_dispense", ctx.type, mois_l, ctx.taux)
        v = (r["resultat"]["indemnite_centimes"], dict(zip(noms, r["resultat"]["detail_centimes"])),
             [r["resultat"]["indemnite_centimes"]])
    except Refus as e:
        ctx.cache["icp"] = e
        raise
    ctx.cache["icp"] = v
    return v

def indemnite_deces_b(ctx, deces, dernier_jour):
    """verif-1 (B-6) : indemnite egale au preavis apres le deces de l'enfant (CCN 119.4.2, 122, 64.2), calculee par B
    (indemnite_preavis_dispense) comme un preavis dispense du lendemain du deces au dernier jour de la periode :
    remuneration que l'AM aurait percue (64.2 : « remuneration brute correspondant a la duree du preavis »), feries
    compris. L'adaptateur ne fait que compter les jours prevus du calendrier. Renvoie {mois : centimes}."""
    mens = mensualise(ctx)

    def u(d):
        x = ctx.prevu_hors_dates(d)
        if not x:
            return 0
        return x if ctx.type == "complete" else 1

    noms = list(mois_entre(deces + timedelta(days=1), dernier_jour))
    mois_l = []
    for m in noms:
        a, b = premier(m), dernier(m)
        jours = list(jours_entre(a, b))
        if ctx.pv:
            lundis = sorted({lundi(d) for d in jours})
            plans = {lu: {j: sum(y - x for x, y in p) for j, p in ctx.semaine_pv(lu).items()} for lu in lundis}
            p = appel("prevu_du_mois_planning_variable", a.year, a.month, plans, ctx.type)
        else:
            contient = ctx.type == "incomplete" and any(lundi(d) in ctx.sans_accueil for d in jours)
            p = appel("prevu_du_mois", a.year, a.month, dict(ctx.plan_min), ctx.type,
                      contient_semaine_non_accueil=contient)
        prevu = p["resultat"]["prevu_minutes"] if ctx.type == "complete" else p["resultat"]["prevu_jours"]
        periode = [d for d in jours if deces < d <= dernier_jour]
        mois_l.append({"salaire_mensualise_centimes": mens, "prevu_mois": prevu,
                       "non_payes": sum(u(d) for d in jours if d < ctx.debut or d > dernier_jour),
                       "mixte": any(ctx.debut <= d <= deces and u(d) for d in jours),
                       "prevu_dispense": sum(u(d) for d in periode),
                       "minutes_dispense": sum(ctx.prevu_hors_dates(d) for d in periode),
                       "semaine_sans_accueil_dans_dispense": ctx.type == "incomplete" and any(
                           lundi(d) in ctx.sans_accueil and ctx.plan_jour(d) for d in periode)})
    r = appel("indemnite_preavis_dispense", ctx.type, mois_l, ctx.taux)
    return dict(zip(noms, r["resultat"]["detail_centimes"]))


def fin_dispense_employeur(ctx, k, out, auteur, motif_b, env):
    """T-074 : fin de contrat avec preavis dispense en tout ou partie par l'employeur (CCN art. 64, 64.2, 66, 122 ;
    regles/t074-preavis-dispense.md). Date de fin = date prevue de fin du preavis (fait de la situation)."""
    fin = ctx.fin
    if not isinstance(ctx.dernier_travaille, date):
        e = Refus("ERREUR-SAISIE", "fin", {"message": "dernier jour travaille incoherent"})
        for cle in ("indemnite_rupture", "iccp", "regularisation_fin", "indemnite_preavis"):
            out[cle] = e
        return out
    # Indemnite de preavis (sortie « indemnite_preavis »).
    icp_lectures = None
    try:
        total, par_mois, _ = icp_b(ctx)
        out["indemnite_preavis"] = total
        icp_lectures = [total]
    except Refus as e:
        out["indemnite_preavis"] = e
        par_mois = None
    # Regularisation (annee incomplete), avant l'ICCP et l'indemnite de rupture (T-050b).
    try:
        if ctx.type == "complete":
            out["regularisation_fin"] = 0
        else:
            if icp_lectures is None:
                raise out["indemnite_preavis"]
            ecarts = []
            debut_annee = ctx.debut
            while True:
                fin_annee = date(debut_annee.year + 1, debut_annee.month, debut_annee.day) - timedelta(days=1)
                derniere = fin_annee >= fin
                b = fin if derniere else fin_annee
                if not derniere and ctx.dernier_travaille < fin_annee:
                    raise Refus("HORS-COMPARATEUR", "regularisation", {"motif": "preavis dispense a cheval sur la date anniversaire"})
                verse = 0
                eff = fer = absr = hcm = disp = 0
                for m in mois_entre(debut_annee, b):
                    v = mois_b(ctx, m)["salaire_base_mois"]
                    if isinstance(v, Refus):
                        raise v
                    verse += v
                for d in jours_entre(debut_annee, b):
                    nature, ded, mt = qualifier_jour(ctx, d)
                    pv = ctx.prevu(d)
                    if nature == "travaille":
                        eff += min(mt, pv) if pv else 0
                        hcm += max(0, mt - pv)
                    elif nature == "ferie_chome" and not ded:
                        fer += pv
                    elif nature == "absence" and not ded:
                        absr += pv
                    elif nature == "ferie_travaille":
                        eff += pv
                    elif nature == "dispense":
                        disp += pv
                comp = {"feries_chomes_payes": {"minutes": fer, "incluses": False},
                        "absences_remunerees": {"minutes": absr, "incluses": False},
                        "heures_complementaires": {"minutes": hcm, "incluses": False}}
                if derniere:
                    r = appel("regularisation_finale_preavis_dispense", ecarts, verse, ctx.taux, eff, disp,
                              icp_lectures, comp)
                    out["regularisation_fin"] = r["resultat"]["versement_centimes"]
                    break
                r = appel("regularisation_annuelle", "incomplete", verse, ctx.taux, eff, comp)
                ecarts.append(r["resultat"]["ecart_centimes"])
                debut_annee = fin_annee + timedelta(days=1)
    except Refus as e:
        out["regularisation_fin"] = e
    # ICCP : meme calcul que la fin ordinaire ; les jours dispenses comptent dans l'acquisition (CCN 64.2) et leur
    # paie dans la base du dixieme (CCN 48.1.1.5 ; regles/t074, point 4 : pas de 10 % en plus).
    _iccp_b(ctx, out, motif_b, fin)
    # Indemnite de rupture : 9 mois a l'envoi et a la fin (D-1) ; avec et sans l'ICP (A-45, envoi 1 question 4).
    try:
        essai = B.indemnite_rupture(motif_b, auteur, ctx.debut, env, 0, date_fin_contrat=fin)
        if essai["statut"] == "non_gere":
            raise Refus(essai["code"], "indemnite_rupture", essai.get("details"))
        if essai["statut"] in ("ok", "provisoire") and essai["resultat"].get("raison"):
            out["indemnite_rupture"] = essai["resultat"]["indemnite_centimes"]
            return out
        sal = sal_hors_icp = 0
        icp = 0
        for m in mois_entre(ctx.debut, fin):
            if not any(ctx.dans_contrat(d) for d in jours_entre(premier(m), dernier(m))):
                continue
            v = mois_b(ctx, m)["salaire_mois_hors_cp"]
            if isinstance(v, Refus):
                raise v
            sal += _brut_comme_a(v)
            if par_mois is not None:
                sal_hors_icp += _brut_comme_a(v - par_mois.get(m, 0))
            cm = cp_mois_b(ctx, m)
            for cle in ("cp_indemnite_mois", "cp_complement_mois"):
                if isinstance(cm[cle], Refus):
                    raise cm[cle]
            icp += _brut_comme_a(cm["cp_indemnite_mois"] + cm["cp_complement_mois"])
        a_confirmer = []
        if par_mois is None:
            a_confirmer.append("indemnite_preavis (" + out["indemnite_preavis"].code + ")")
            sal_hors_icp = sal
        iccp_v = out["iccp"] if not isinstance(out["iccp"], Refus) else None
        reg_v = out["regularisation_fin"]
        if iccp_v is None:
            a_confirmer.append("iccp (" + out["iccp"].code + ")")
            iccp_v = 0
        if isinstance(reg_v, Refus):
            a_confirmer.append("regularisation (" + reg_v.code + ")")
            reg_v = 0
        reg_brut = _brut_comme_a(reg_v)
        iccp_brut = _brut_comme_a(iccp_v + reg_v) - reg_brut
        r = appel("indemnite_rupture", motif_b, auteur, ctx.debut, env, sal_hors_icp, iccp_centimes=iccp_brut,
                  icp_centimes=icp, indemnite_preavis_centimes=sal - sal_hors_icp, regularisation_centimes=reg_brut,
                  sommes_a_confirmer=a_confirmer, date_fin_contrat=fin)
        out["indemnite_rupture"] = r["resultat"]["indemnite_centimes"]
        if k.get("comparer_assiette"):
            out["assiette_rupture"] = r["resultat"]["assiette_centimes"]
    except Refus as e:
        out["indemnite_rupture"] = e
    return out

def _iccp_b(ctx, out, motif_b, fin):
    """ICCP de fin (code de fin_b, mis en fonction pour T-074, sans changement ; T-076 : planning variable)."""
    try:
        y = fin.year if fin.month >= 6 else fin.year - 1
        periodes = []
        periodes_annees = []  # T-076
        dernier_yy = None
        for yy in (y - 1, y):
            p0, p1 = periode(yy)
            if ctx.debut > p1:
                continue
            acq = acquisition_b(ctx, yy)
            ja = acq["jours_acquis"]
            if isinstance(ja, Refus):
                raise ja
            a = max(p0, ctx.debut)
            b = min(p1, fin)
            payes = 0
            if yy == y - 1:
                if ctx.type == "complete":
                    for l in ctx.conges:
                        if l["type"] == "cp" and l["du"] >= date(y, 6, 1) and l["du"] <= fin:
                            # T-077 (R3.4) : decompte dans les deux lectures (feries locaux) ; egales hors region.
                            na, nb = decompte_conge(ctx, l, borne=fin + timedelta(days=60))
                            if na != nb:
                                raise Refus("A77-DECOMPTE-CP", "decompte_jours_cp", {"lectures": {"A": na, "B": nb}})
                            payes += na
                    payes = min(payes, ja)
                else:
                    if ctx.k.get("cp_mode", "juin") == "juin" and fin >= date(y, 6, 1):
                        payes = ja
                    else:
                        raise Refus("HORS-COMPARATEUR", "iccp", {"motif": "modalite de paiement autre que juin"})
            icp_pendant, icp_prec = icp_periode(ctx, yy, a, b)
            periodes_annees.append(yy)
            periodes.append({"jours_acquis": ja, "jours_payes": payes,
                             "salaires_bruts_periode_centimes": salaires_periode(ctx, a, b),
                             "icp_versee_pendant_periode_centimes": icp_pendant,
                             "icp_annee_precedente_centimes": icp_prec,
                             "jours_supplementaires": acq["jours_enfants"]})
            dernier_yy = yy
        if periodes and dernier_yy == y:
            rf = out["regularisation_fin"]
            if isinstance(rf, Refus):
                periodes[-1]["regularisation_a_confirmer"] = True
            else:
                periodes[-1]["regularisation_due_centimes"] = rf
        if ctx.pv:
            # T-076 (B2 ; R-PV-13, P-PV-5) : maintien sur la duree habituelle moyenne de chaque periode (C1).
            for yy, pj in zip(periodes_annees, periodes):
                p0, p1 = periode(yy)
                pj["heures_prevues_periode_minutes"], pj["semaines_prevues_travaillees"] = \
                    heures_prevues_periode(ctx, max(p0, ctx.debut), min(p1, fin))
            r = appel("iccp_planning_variable", ctx.type, motif_b, periodes, ctx.taux)
        else:
            r = appel("iccp", ctx.type, motif_b, periodes, ctx.hebdo, ctx.taux)
        out["iccp"] = r["resultat"]["iccp_centimes"]
    except Refus as e:
        out["iccp"] = e

def regularisation_b(ctx, fin):
    """Regularisation definitive (annee incomplete, R-FIN-11 ; CCN 124), demandee a B. Leve Refus."""
    if ctx.type == "complete":
        return 0
    else:
        ecarts = []
        debut_annee = ctx.debut
        while True:
            fin_annee = date(debut_annee.year + 1, debut_annee.month, debut_annee.day) - timedelta(days=1)
            derniere = fin_annee >= fin
            b = fin if derniere else fin_annee
            verse = 0
            eff = fer = absr = hcm = 0
            l2 = ctx.pv and (mensualise(ctx) is not None) and ctx.pv_lecture == "L2"
            hc_payees = Fraction(0)
            for m in mois_entre(debut_annee, b):
                v = mois_b(ctx, m)["salaire_base_mois"]
                if isinstance(v, Refus):
                    raise v
                verse += v
                if l2:
                    # T-076 (B3, N1) : CCN 109.2 compare les salaires mensualises verses « aux salaires qui auraient du
                    # etre verses en application du contrat de travail, au titre des heures reellement effectuees ».
                    # En L2, les heures prevues au-dela de la base sont payees chaque mois en HC, a leur taux et avec
                    # leur majoration (CCN 110.2) : elles sortent des deux cotes. Verse = mensualise ; du = heures
                    # effectuees hors HC deja payees, au taux horaire. La majoration n'est ni comptee ni reprise.
                    h = mois_b(ctx, m)["heures_compl_montant"]
                    if isinstance(h, Refus):
                        raise h
                    hc_payees += mois_b(ctx, m)["_hc_minutes"]
            for d in jours_entre(debut_annee, b):
                q = qualifier_jour(ctx, d)
                nature, ded, mt = q
                if nature == "a_confirmer":
                    raise ded  # T-077 : jour ni paye ni retenu, composantes de la regularisation inconnues
                pv = ctx.prevu(d)
                if nature in ("travaille", "ferie_local_travaille"):
                    eff += min(mt, pv) if pv else 0
                    hcm += max(0, mt - pv)
                elif nature == "ferie_chome" and not ded:
                    fer += pv
                elif nature == "absence" and not ded:
                    absr += pv
                elif nature == "ferie_travaille":
                    eff += pv
            if l2:
                # Heures prevues au-dela de la base, deja payees en HC : retirees des heures dues (N1). Les heures
                # faites au-dela du prevu (hcm) restent la composante habituelle (A-06 si elle change le resultat).
                eff -= min(eff, hc_payees - hcm) if hc_payees > hcm else 0
                eff = str(eff) if isinstance(eff, Fraction) else eff
            comp = {"feries_chomes_payes": {"minutes": fer, "incluses": False},
                    "absences_remunerees": {"minutes": absr, "incluses": False},
                    "heures_complementaires": {"minutes": hcm, "incluses": False}}
            if derniere:
                r = appel("regularisation_finale", "incomplete", ecarts, verse, ctx.taux, eff, comp)
                return r["resultat"]["versement_centimes"]
            r = appel("regularisation_annuelle", "incomplete", verse, ctx.taux, eff, comp)
            ecarts.append(r["resultat"]["ecart_centimes"])
            debut_annee = fin_annee + timedelta(days=1)

def fin_b(ctx, k):
    out = {}
    auteur = "am" if k["motif"] == "demission" else "employeur"
    motif_b = "deces_enfant" if k["motif"] == "deces" else "normal"
    env = d_(k["notification"])
    pres = d_(k.get("presentation", k["notification"]))
    try:
        r = appel("duree_preavis", auteur, ctx.debut, env, pres, motif=motif_b)
        out["preavis"] = r["resultat"]["preavis"]
        # T-103 (F1) : dernier jour du preavis (jour de la premiere presentation non compte) ; (F8) deces de
        # l'enfant : dernier jour de la periode egale au preavis, comptee depuis le deces (date de fin du contrat).
        if out["preavis"] is None:
            out["date_fin_preavis"] = None
        elif motif_b == "deces_enfant":
            try:
                out["date_fin_preavis"] = appel("periode_indemnite_deces", env, out["preavis"])[  # env : deces
                    "resultat"]["dernier_jour"].isoformat()
            except Refus as e2:
                out["date_fin_preavis"] = e2
        elif r["resultat"]["date_fin_preavis"] is None:
            out["date_fin_preavis"] = Refus(r["resultat"]["code_date_fin_preavis"], "duree_preavis")
        else:
            out["date_fin_preavis"] = r["resultat"]["date_fin_preavis"].isoformat()
    except Refus as e:
        out["preavis"] = e
        out["date_fin_preavis"] = e
    # La date de fin est un fait donne par la situation (dernier jour du contrat).
    fin = ctx.fin
    # T-042c (M11, T-045) : preavis non execute. B n'a pas de parametre d'inexecution ; son entree est la date de fin
    # du contrat. Pour la dispense demandee par l'AM et acceptee, le contrat finit au dernier jour travaille (CCN
    # art. 64.2, al. 2) : c'est exactement l'entree de B si les deux dates concordent. Tout autre cas : refus visible.
    inex = k.get("inexecution")
    if inex and inex.get("demandeur") == "employeur":
        # T-074 : dispense par l'employeur ; la date de fin de la situation est la date prevue de fin du preavis.
        return fin_dispense_employeur(ctx, k, out, auteur, motif_b, env)
    if inex and not (inex.get("demandeur") == "am_acceptee" and d_(inex["dernier_jour_travaille"]) == fin):
        e = Refus("INEXECUTION-NON-GEREE", "fin", {"inexecution": inex})
        for cle in ("indemnite_rupture", "iccp", "regularisation_fin"):
            out[cle] = e
        return out
    # Regularisation (annee incomplete) : calculee en premier, car elle entre dans la base du dixieme de
    # l'ICCP et dans l'assiette du 1/80 (T-050b).
    try:
        out["regularisation_fin"] = regularisation_b(ctx, fin)
    except Refus as e:
        out["regularisation_fin"] = e
    # ICCP
    _iccp_b(ctx, out, motif_b, fin)
    # Indemnite de rupture. Appel d'essai sans montants : si B conclut ou refuse
    # sans avoir besoin des salaires (non due, moins de 9 mois, A-47...), sa
    # reponse vaut ; sinon on lui donne les salaires du contrat.
    try:
        # T-103 (F3) : 9 mois apprecies a la fin du contrat (CCN 60, 64.2) : date de fin donnee a B.
        essai = B.indemnite_rupture(motif_b, auteur, ctx.debut, env, 0, date_fin_contrat=fin)
        if essai["statut"] == "non_gere":
            raise Refus(essai["code"], "indemnite_rupture", essai.get("details"))
        if essai["statut"] in ("ok", "provisoire") and essai["resultat"].get("raison"):
            out["indemnite_rupture"] = essai["resultat"]["indemnite_centimes"]
            raise StopIteration
        # T-050c : l'assiette du 1/80 est en BRUT (CCN art. 121.1). Le taux de la situation est lu en net par A
        # (Contract.rateNet) et en brut par B. Les deux moteurs donnent donc les memes montants mensuels, mais A
        # convertit l'assiette en brut (src/engine/fin.ts, netToBrut). L'adaptateur fait la meme conversion avant de
        # donner les montants a B (_brut_comme_a), mois par mois comme A, pour comparer la composition de l'assiette
        # (A-45), le 1/80 et l'arrondi, et non la convention net/brut du comparateur.
        sal = 0
        icp = 0
        for m in mois_entre(ctx.debut, fin):
            if not any(ctx.dans_contrat(d) for d in jours_entre(premier(m), dernier(m))):
                continue
            v = mois_b(ctx, m)["salaire_mois_hors_cp"]
            if isinstance(v, Refus):
                raise v
            sal += _brut_comme_a(v, ctx, m)
            # CP payes dans le mois (annee incomplete) et complement de juin (annee complete), comme A
            # (cpForMonth : indemnite + complement, convertis le dernier jour du mois).
            cm = cp_mois_b(ctx, m)
            for cle in ("cp_indemnite_mois", "cp_complement_mois"):
                if isinstance(cm[cle], Refus):
                    raise cm[cle]
            icp += _brut_comme_a(cm["cp_indemnite_mois"] + cm["cp_complement_mois"], ctx, m)
        iccp_v = out["iccp"] if not isinstance(out["iccp"], Refus) else None
        # T-050b (A-45) : ICCP, CP payes et regularisation de fin entrent dans l'assiette (CCN art. 121.1, 124).
        # Une somme que B ne calcule pas est passee « a confirmer » : B refuse au lieu d'une assiette incomplete.
        reg_v = out["regularisation_fin"]
        a_confirmer = []
        if iccp_v is None:
            a_confirmer.append("iccp (" + out["iccp"].code + ")")
            iccp_v = 0
        if isinstance(reg_v, Refus):
            a_confirmer.append("regularisation (" + reg_v.code + ")")
            reg_v = 0
        # A convertit l'ICCP et la regularisation ensemble, au dernier jour du dernier mois (assietteFinNet).
        mf = mois_de(fin)
        reg_brut = _brut_comme_a(reg_v, ctx, mf)
        iccp_brut = _brut_comme_a(iccp_v + reg_v, ctx, mf) - reg_brut
        # verif-1 (B-6) : deces de l'enfant : l'indemnite « egale a l'indemnite compensatrice de preavis definie a
        # l'article 122 » (CCN 119.4.2) est soumise a cotisations (64.2) ; 121.1 n'exclut que les sommes non soumises
        # et 119.4.2 calcule l'indemnite de rupture « de la meme maniere » qu'au retrait : elle entre dans le 1/80.
        # Montant : celui d'un preavis dispense du lendemain du deces au dernier jour de la periode (122 : retenue de
        # l'art. 111 si la periode finit en cours de mois).
        pre_deces = 0
        if motif_b == "deces_enfant":
            if isinstance(out.get("preavis"), Refus):
                raise out["preavis"]
            if out.get("preavis"):
                dj = appel("periode_indemnite_deces", env, out["preavis"])["resultat"]["dernier_jour"]
                pre_deces = sum(_brut_comme_a(v, ctx, m) for m, v in indemnite_deces_b(ctx, env, dj).items())
        r = appel("indemnite_rupture", motif_b, auteur, ctx.debut, env, sal, iccp_centimes=iccp_brut, icp_centimes=icp,
                  indemnite_preavis_centimes=pre_deces,
                  regularisation_centimes=reg_brut, sommes_a_confirmer=a_confirmer, date_fin_contrat=fin)
        out["indemnite_rupture"] = r["resultat"]["indemnite_centimes"]
        if k.get("comparer_assiette"):
            out["assiette_rupture"] = r["resultat"]["assiette_centimes"]
    except StopIteration:
        pass
    except Refus as e:
        out["indemnite_rupture"] = e
    return out

def rupture_bulletins_b(s, ctx, k, res):
    """T-072 (T-054) : indemnite de rupture avec le total des bulletins saisi. Faits donnes a B : le total et son
    dernier mois ; pour chaque date de fin possible (B, dates_fin_preavis_possibles, si le preavis est execute et que
    la date de fin de la situation est l'une d'elles), les salaires de chaque mois, l'ICCP et la regularisation
    calcules par B pour cette date (convertis en brut comme A, T-050c). B decide de l'assiette."""
    bl = k["bulletins"]
    auteur = "am" if k["motif"] == "demission" else "employeur"
    motif_b = "deces_enfant" if k["motif"] == "deces" else "normal"
    env = d_(k["notification"])
    pres = d_(k.get("presentation", k["notification"]))
    execute = (s["contrat"].get("rupture") or {}).get("preavis") == "execute" and not k.get("inexecution")
    dates = [ctx.fin]
    if execute:
        pv = res.get("preavis")
        if isinstance(pv, Refus):
            raise pv
        if pv:
            possibles = appel("dates_fin_preavis_possibles", pres, pv)["resultat"]["dates"]
            if ctx.fin in possibles:
                dates = possibles
    variantes = []
    for f in dates:
        c2 = ctx if f == ctx.fin else Ctx(dict(s, contrat=dict(s["contrat"], fin=f.isoformat())))
        o2 = res if f == ctx.fin else fin_b(c2, k)
        sal = {}
        for m in mois_entre(c2.debut, f):
            if not any(c2.dans_contrat(d) for d in jours_entre(premier(m), dernier(m))):
                continue
            cle = premier(m).isoformat()[:7]
            v = mois_b(c2, m)["salaire_mois_hors_cp"]
            cm = cp_mois_b(c2, m)
            parts = [v, cm["cp_indemnite_mois"], cm["cp_complement_mois"]]
            sal[cle] = None if any(isinstance(x, Refus) for x in parts) else \
                _brut_comme_a(v) + _brut_comme_a(parts[1] + parts[2])
        iccp_v, reg_v = o2.get("iccp"), o2.get("regularisation_fin")
        iccp_v = None if isinstance(iccp_v, Refus) else iccp_v
        reg_v = None if isinstance(reg_v, Refus) else reg_v
        reg_brut = None if reg_v is None else _brut_comme_a(reg_v)
        if iccp_v is None:
            iccp_brut = None
        elif reg_v is None:
            iccp_brut = _brut_comme_a(iccp_v)
        else:
            iccp_brut = _brut_comme_a(iccp_v + reg_v) - reg_brut
        variantes.append({"date_fin": f, "salaires_mois_centimes": sal, "iccp_centimes": iccp_brut,
                          "regularisation_centimes": reg_brut,
                          # Preavis execute : paye comme salaire des mois. Sinon (deces : indemnite egale au preavis,
                          # CCN 119.4.2 ; preavis non execute) : montant non calcule ici, a confirmer.
                          "indemnite_preavis_centimes": 0 if execute else None})
    r = appel("indemnite_rupture_bulletins", motif_b, auteur, ctx.debut, env, variantes,
              total_bulletins_centimes=bl.get("total"), total_jusqua=bl.get("jusqua"),
              bruts_lus_centimes=bl.get("par_mois"))
    return r["resultat"]

# ------------------------------------------------------------------ CDD (T-076, decisions section 2)

def cdd_p1(ctx):
    """Point P1 : CDD a terme precis de moins d'un mois (B decide, R-CDD-05)."""
    if "p1" not in ctx.cache:
        try:
            if ctx.k.get("cdd_terme_imprecis"):
                ctx.cache["p1"] = False
            else:
                ctx.cache["p1"] = appel("cdd_moins_d_un_mois", ctx.debut,
                                        d_(ctx.k["cdd_terme"]))["resultat"]["moins_d_un_mois"]
        except Refus as e:
            ctx.cache["p1"] = e
    v = ctx.cache["p1"]
    if isinstance(v, Refus):
        raise v
    return v

def cdd_p2(ctx):
    """Point P2 : CDD dont le contrat prevoit des semaines sans accueil (contrat saisi en 46 semaines ou moins)."""
    return ctx.type == "incomplete"

def _lect(v1, v2):
    for v in (v1, v2):
        if isinstance(v, Refus):
            raise v
    return Lect(min(v1, v2), [int(v1), int(v2)])

def mois_cdd(ctx, m):
    """Sorties d'un mois de CDD : comme un CDI (R-CDD-02, R-CDD-04), avec les lectures de P1 ou de P2."""
    key = ("mois_cdd", m)
    if key in ctx.cache:
        return ctx.cache[key]
    out = dict(mois_b(ctx, m))
    noms = ("salaire_base_mois", "salaire_mois_hors_cp")
    try:
        p1 = cdd_p1(ctx)
        appel("verifier_cas_cdd", ctx.pv, p1, cdd_p2(ctx))  # D15, D3
        # D18 : mois travaille apres le terme sans CDI enregistre (L1243-11).
        apres = [d for d in jours_entre(premier(m), dernier(m)) if ctx.dans_contrat(d) and d > d_(ctx.k["cdd_terme"])]
        if apres:
            appel("controle_dates_cdd", "terme", max(apres), d_(ctx.k["cdd_terme"]))
    except Refus as e:
        for n in list(out):
            if not n.startswith("_"):
                out[n] = e  # N2 : mois refuse, aucune sortie partielle « ok »
        ctx.cache[key] = out
        return out
    if p1:
        try:
            for n in ("salaire_base_mois", "deduction", "_reel_contrat"):
                if isinstance(out[n], Refus):
                    raise out[n]
            # T-103 (F11) : lecture 1 seule (CCN 108.1, 111 ; L1242-14) : salaire mensualise moins la deduction.
            r = appel("salaire_mois_cdd_moins_d_un_mois", mensualise(ctx), out["deduction"], ctx.taux,
                      out["_reel_contrat"])
            out["salaire_base_mois"] = r["resultat"]["valeur_centimes"]
        except Refus as e:
            for n in noms:
                out[n] = e
    # T-103 (F12) : semaines sans accueil d'un CDD : mode 46 semaines seul (CCN 97.1, 109.2) ; plus de lecture 52.
    ctx.cache[key] = out
    return out

def fin_cdd_b(ctx, k):
    """Fin de CDD (R-CDD-06 a R-CDD-10, ordre R-CDD-09) : dernier mois, regularisation, BrutCDD, IFC, ICCP.
    Chaque lecture de P1 ou P2 est calculee jusqu'au bout ; P3 et P4 sont donnes par B. Sortie : part sure
    (`valeur`) et [plus petite, plus grande] des lectures (`lectures`)."""
    out = {}
    fc = k["fin_cdd"]
    fin = ctx.fin
    try:
        r = appel("preavis_et_rupture_cdd", fc)
        out["preavis"] = r["resultat"]["preavis_centimes"]
        out["indemnite_rupture"] = r["resultat"]["indemnite_rupture_centimes"]
    except Refus as e:
        out["preavis"] = out["indemnite_rupture"] = e
    try:
        p1 = cdd_p1(ctx)
        p2 = cdd_p2(ctx)
        appel("verifier_cas_cdd", ctx.pv, p1, p2)  # D3
        appel("controle_dates_cdd", fc, fin, d_(ctx.k["cdd_terme"]))  # D9
        if fc == "essai":  # D19 : duree maximale d'essai (L1242-10), sur la duree initialement prevue
            appel("controle_essai_cdd", ctx.debut, d_(ctx.k.get("cdd_terme_initial") or ctx.k["cdd_terme"]), fin)
    except Refus as e:
        for cle in ("preavis", "indemnite_rupture", "ifc", "iccp", "regularisation_fin", "assiette_ifc",
                    "salaire_dernier_mois") + (("solde_fin_cdd",) if ctx.type == "incomplete" else ()):
            out[cle] = e
        return out
    mois_contrat = [m for m in mois_entre(ctx.debut, fin)]
    # T-103 (F11, F12) : une seule lecture du salaire (mensualise ; mode 46 semaines).
    variantes = [(ctx, lambda m: mois_cdd(ctx, m)["salaire_mois_hors_cp"])]
    res = []
    for cv, sal_mois in variantes:
        v = {}
        try:
            sal = {}
            for m in mois_contrat:
                x = mois_cdd(ctx, m)["salaire_mois_hors_cp"]  # refus du mois : propage
                if isinstance(x, Refus):
                    raise x
                x = sal_mois(m)
                if isinstance(x, Refus):
                    raise x
                sal[m] = int(x)
            cp = 0
            # CP verses pendant le contrat : 46 semaines ou moins (CCN 102.1.2.2), ou conges pris en 52 semaines.
            cp_verses = cv.type == "incomplete" or any(l["type"] == "cp" for l in cv.conges)
            for m in (mois_contrat if cp_verses else []):
                cm = cp_mois_b(cv, m)
                for cle in ("cp_indemnite_mois", "cp_complement_mois"):
                    if isinstance(cm[cle], Refus):
                        raise cm[cle]
                    cp += cm[cle]
            # D8 : CDD suivi d'un CDI : pas de regularisation de fin (CCN 124 : fin du contrat seulement).
            reg = regularisation_b(cv, fin) if cv.type == "incomplete" and fc != "suite_cdi" else 0
            v["reg"] = reg
            v["total"] = sum(sal.values()) + reg
            brut = appel("assiette_ifc", list(sal.values()), cp, reg)["resultat"]["brut_cdd_centimes"]
            v["brut"] = brut
            ifc = appel("indemnite_fin_cdd", brut, fc)["resultat"]["indemnite_centimes"]
            v["ifc_sure"] = ifc
            # ICCP (R-CDD-10) : periodes de reference touchees par le contrat.
            y = fin.year if fin.month >= 6 else fin.year - 1
            periodes = []
            for yy in (y - 1, y):
                p0, p1_ = periode(yy)
                if ctx.debut > p1_:
                    continue
                a, b = max(p0, ctx.debut), min(p1_, fin)
                acq = acquisition_b(cv, yy)
                ja = acq["jours_acquis"]
                pj = {"salaires_bruts_periode_centimes": sum(s_ for m, s_ in sal.items()
                                                            if a <= premier(m) <= b or a <= dernier(m) <= b)}
                pend = sum(int(cp_mois_b(cv, m)[c_]) for m in (mois_entre(a, b) if cp_verses else [])
                           for c_ in ("cp_indemnite_mois", "cp_complement_mois"))
                pj["icp_versee_pendant_periode_centimes"] = pend
                if isinstance(ja, Refus):
                    pj["jours_acquis"], pj["code_jours"] = None, ja.code
                else:
                    pj["jours_acquis"] = ja
                # Jours deja payes : faits du contrat (conges pris en 52 semaines, paiement de juin en 46 semaines).
                q0 = date(yy + 1, 6, 1)
                if cv.type == "complete":
                    payes = sum(decompte_b(cv, l["du"], l["au"] + timedelta(days=1)) for l in cv.conges
                                if l["type"] == "cp" and q0 <= l["du"] <= fin)
                elif fin >= q0:
                    if isinstance(ja, Refus):
                        raise ja  # jours payes en juin inconnus : rien n'est suppose
                    payes = ja
                else:
                    payes = 0
                pj["jours_payes"] = payes
                pj["jours_supplementaires"] = 0 if isinstance(ja, Refus) else acq["jours_enfants"]
                periodes.append(pj)
            if periodes:
                periodes[-1]["regularisation_due_centimes"] = reg
            # T-103 (F9, F10) : ICCP = plus haut du maintien et du dixieme ; IFC sans l'ICCP dans sa base.
            v["ifc"] = ifc
            try:
                v["iccp"] = appel("iccp_cdd", fc, periodes, ifc, brut, cv.hebdo, cv.taux)["resultat"]["iccp_centimes"]
            except Refus as e:
                v["iccp"] = e
        except Refus as e:
            v = {"refus": e}
        res.append(v)

    v = res[0]
    for nom, cle in (("ifc", "ifc"), ("iccp", "iccp"), ("regularisation_fin", "reg"), ("assiette_ifc", "brut")):
        out[nom] = v["refus"] if "refus" in v else v[cle]
    out["salaire_dernier_mois"] = mois_cdd(ctx, mois_de(fin))["salaire_mois_hors_cp"]
    if p1 or p2:
        # D11 : solde de fin = total - verse (une seule lecture depuis T-103, F11 et F12).
        try:
            if "refus" in v:
                raise v["refus"]
            verse = sum(int(mois_cdd(ctx, m)["salaire_mois_hors_cp"]) for m in mois_contrat)
            r = appel("solde_fin_cdd", [v["total"], v["total"]], verse, fc)
            out["solde_fin_cdd"] = r["resultat"]["solde_centimes"]
        except Refus as e:
            out["solde_fin_cdd"] = e
    return out


# ------------------------------------------------------------------ execution

def _resoudre(v, valeurs):
    if isinstance(v, dict) and set(v) == {"date"}:
        return d_(v["date"])
    if isinstance(v, dict) and set(v) == {"ens"}:
        return set(v["ens"])
    if isinstance(v, dict) and set(v) == {"ref"}:
        return valeurs[v["ref"]]
    if isinstance(v, list):
        return [_resoudre(x, valeurs) for x in v]
    if isinstance(v, dict):
        return {k: _resoudre(x, valeurs) for k, x in v.items()}
    return v


def _extraire(res, chemin):
    v = res
    for c in chemin.split("."):
        v = v[int(c)] if isinstance(v, list) else v[c]
    return v


def appels_explicites(s):
    """Appels recopies de moteur/B/tests/test_cas_officiels.py."""
    out = {}
    valeurs = {}
    for ap in s["b_appels"]:
        args = _resoudre(ap.get("args", []), valeurs)
        kwargs = _resoudre(ap.get("kwargs", {}), valeurs)
        try:
            r = getattr(B, ap["fonction"])(*args, **kwargs)
        except Exception as e:  # erreur de l'adaptateur
            out[ap["sortie"]] = {"statut": "erreur", "note": repr(e)}
            continue
        if ap.get("garder"):
            valeurs[ap["garder"]] = r
        cache = ap.get("interne")
        if r["statut"] in ("ok", "provisoire"):
            v = _extraire(r["resultat"], ap["cle"])
            if ap.get("transformer") == "entier":
                v = int(v)
            valeurs[ap["sortie"]] = v
            if not cache:
                out[ap["sortie"]] = {"statut": "ok", "valeur": v}
        elif r["statut"] == "non_gere":
            if not cache:
                out[ap["sortie"]] = {"statut": "non_gere", "code": r["code"], "etape": ap["fonction"],
                                     "details": r.get("details")}
        else:
            out[ap["sortie"]] = {"statut": "erreur", "note": r.get("message")}
    return out


def _sortie(v, etape=None):
    if isinstance(v, Refus):
        if v.code == "ERREUR-SAISIE":
            return {"statut": "erreur", "note": f"{v.etape} : {v.details}"}
        return {"statut": "non_gere", "code": v.code, "etape": v.etape, "details": v.details}
    if isinstance(v, Lect):
        s = {"statut": "ok", "valeur": int(v)}
        if v.lectures is not None:
            s["lectures"] = v.lectures
        else:
            s["note"] = "lecture 2 non calculee (voir le refus de B dans le detail)"
        return s
    return {"statut": "ok", "valeur": v}


def controle_km_b(k):
    """Controle du taux seul (CCN art. 57), traduit dans les niveaux du moteur A :
    conforme pour toutes les tranches -> ok ; hors bornes pour toutes -> alerte ;
    selon la tranche (A-38) -> a_verifier."""
    r = B.indemnite_kilometrique(1, k["taux"], d_(k["date"]), k["cv"], electrique=None)  # motorisation inconnue de A
    if r["statut"] in ("ok", "provisoire"):
        return "ok"
    if r["statut"] == "non_gere" and r["code"] in ("KM-SOUS-PLANCHER", "KM-SUR-PLAFOND"):
        return "alerte"
    if r["statut"] == "non_gere" and r["code"] in ("A-38", "KM-ELECTRIQUE-INCONNU"):
        return "a_verifier"
    if r["statut"] == "non_gere":
        return Refus(r["code"], "indemnite_kilometrique", r.get("details"))
    return Refus("ERREUR-SAISIE", "indemnite_kilometrique", {"message": r.get("message")})


_CLES_MOIS = ("salaire_mensualise", "salaire_base_mois", "heures_compl_montant", "heures_maj_montant",
              "ferie_travaille_montant", "salaire_mois_hors_cp", "entretien", "repas", "km")


class _CtxRefus:
    """Contexte d'un mois que B refuse en entier (avenant en cours de mois)."""

    def __init__(self, refus):
        self.refus = refus


def ctx_mois(s, m, ctx=None):
    """T-072 (T-052) : contrat en vigueur pour le mois m. Avenants : faits de la situation (date d'effet, type
    d'annee, semaines, semaines sans accueil). B verifie que chaque avenant du mois prend effet le 1er (CCN 109.1,
    verifier_date_effet_avenant) ; les conditions du dernier avenant en vigueur s'appliquent au mois entier. Les types
    d'annee anterieurs servent aux conges (conges_apres_changement_type)."""
    av = s["contrat"].get("avenants") or []
    if not av:
        return ctx or Ctx(s)
    a0, b0 = premier(m), dernier(m)
    for a in av:
        du = d_(a["du"])
        if a0 <= du <= b0:
            try:
                appel("verifier_date_effet_avenant", du)
            except Refus as e:
                return _CtxRefus(e)
    k = dict(s["contrat"])
    k.pop("avenants")
    avant = sorted((a for a in av if d_(a["du"]) <= a0), key=lambda a: a["du"])
    for a in avant:
        for cle in ("type_annee", "semaines", "semaines_sans_accueil"):
            if cle in a:
                k[cle] = a[cle]
    s2 = dict(s, contrat=k)
    ctx = Ctx(s2)
    ctx.historique = [(ctx.debut, s["contrat"]["type_annee"])] + [(d_(a["du"]), a.get("type_annee")) for a in avant]
    return ctx


def composition(s):
    ctx = Ctx(s)
    out = {}
    for k in s["calculs"]:
        pre = f"{k['id']}." if k.get("id") else ""
        t = k["type"]
        if t == "mois":
            cm = ctx_mois(s, k["mois"], ctx)
            # T-076 : CDD, lectures P1 / P2 (mois_cdd) ; T-072 : contrat du mois (avenants)
            src = mois_cdd(cm, k["mois"]) if getattr(cm, "cdd", False) else mois_b(cm, k["mois"])
            res = {n: v for n, v in src.items() if not n.startswith("_") and n != "deduction"}
        elif t == "cp_acquisition":
            res = acquisition_b(ctx, k["periode"])
        elif t == "cp_indemnite":
            r = indemnite_b(ctx, k["periode"])
            res = {"indemnite_cp": r["indemnite_cp"], "maintien_cp": r["maintien_cp"]}
        elif t == "cp_mois":
            res = cp_mois_b(ctx, k["mois"])
        elif t == "fin" and k.get("motif") == "fin_cdd":
            res = fin_cdd_b(ctx, k)  # T-076, R-CDD-06 a R-CDD-10
        elif t == "fin":
            res = fin_b(ctx, k)
            # T-072 (T-054) : total des bruts des bulletins saisi (C-008) : B le lit (indemnite_rupture_bulletins).
            if k.get("bulletins"):
                try:
                    r = rupture_bulletins_b(s, ctx, k, res)
                    res["indemnite_rupture"] = r["indemnite_centimes"]
                    if k.get("comparer_assiette") and "assiette_centimes" in r:
                        res["assiette_rupture"] = r["assiette_centimes"]
                except Refus as e:
                    res["indemnite_rupture"] = e
                    if k.get("comparer_assiette"):
                        res["assiette_rupture"] = e
        elif t == "cp_decompte":
            try:
                if ctx.pv:
                    res = {"jours_decomptes": decompte_b(ctx, d_(k["du"]), d_(k["reprise"]))}  # T-076 : R-PV-09
                else:
                    du_, rep_ = d_(k["du"]), d_(k["reprise"])
                    # T-103 (C15, C16) : arret maladie saisi pendant le conge ; fin du contrat avant la reprise.
                    arret = [x for x in jours_entre(du_, rep_ - timedelta(days=1))
                             if any(c["type"] == "am_malade" and c["du"] <= x <= c["au"] for c in ctx.conges)]
                    fin_k = ctx.fin if ctx.fin is not None and du_ <= ctx.fin < rep_ - timedelta(days=1) else None
                    r = appel("decompte_jours_cp", du_, rep_, ctx.jours_travailles, region=ctx.region,
                              jours_arret_maladie=arret, date_fin_contrat=fin_k)
                    res = {"jours_decomptes": r["resultat"]["jours_decomptes"]}
            except Refus as e:
                if e.code == "A77-DECOMPTE-CP":
                    l = e.details["lectures"]
                    e = Refus(e.code, e.etape, dict(e.details, lectures_valeurs=sorted({l["A"], l["B"]})))
                res = {"jours_decomptes": e}
        elif t == "ferie":
            try:
                nature, ded, _ = qualifier_jour(ctx, d_(k["date"]))
                if nature == "a_confirmer":
                    res = {"ferie_paye": Refus(ded.code, ded.etape, dict(ded.details, lectures_valeurs=[False, True]))}
                else:
                    res = {"ferie_paye": not ded} if nature == "ferie_chome" else {"ferie_paye": Refus("HORS-COMPARATEUR", "ferie")}
            except Refus as e:
                res = {"ferie_paye": e}
        elif t == "brut_depuis_net":
            # T-077 (R1) : brut estime depuis le net, part de la region et du mois (B).
            try:
                res = {"brut_estime": appel("brut_depuis_net", k["net"], d_(k["date"]), ctx.region)["resultat"]["brut_estime_centimes"]}
            except Refus as e:
                res = {"brut_estime": e}
        elif t == "minimum_conventionnel":
            # T-077 (R2) : minimum brut (grille ; 0,281 x SMIC de la region) et repere net Urssaf de la region.
            res = {}
            try:
                res["minimum_brut"] = appel("minimum_horaire_brut", d_(k["date"]), region=ctx.region)["resultat"]["minimum_centimes"]
            except Refus as e:
                res["minimum_brut"] = e
            try:
                res["minimum_net"] = appel("repere_net_minimum", d_(k["date"]), ctx.region)["resultat"]["repere_net_centimes"]
            except Refus as e:
                res["minimum_net"] = e
        elif t == "km_controle":
            res = {"km_controle": controle_km_b(k)}
        elif t == "evt_duree":
            try:
                r = appel("conge_evenement_familial", NATURES_EVT[k["nature"]], d_(k["date"]))
                res = {"evt_duree": r["resultat"]["jours_ouvrables_remuneres"]}
            except Refus as e:
                res = {"evt_duree": e}
        else:
            raise ValueError(t)
        if s["contrat"].get("avenants") and t != "mois":
            # T-072 : B ne lit les avenants que pour le calcul d'un mois. Autres calculs : refus visible.
            res = {n: Refus("AVENANT-NON-GERE", t, {"avenants": s["contrat"]["avenants"]}) for n in res}
        for n, v in res.items():
            if k.get("sorties") and n not in k["sorties"]:
                continue
            out[pre + n] = _sortie(v)
    return out


def executer(s):
    if "b_appels" in s:
        return appels_explicites(s)
    return composition(s)


if __name__ == "__main__":
    import json
    sits = json.load(open(sys.argv[1], encoding="utf-8"))
    print(json.dumps({s["id"]: executer(s) for s in sits}, ensure_ascii=False, default=str))
