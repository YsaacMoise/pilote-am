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
"""

import os
import sys
from datetime import date, timedelta
from fractions import Fraction

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get("ARVELA_B_RACINE", "/home/claude/projet/moteur/B"))  # M6 : copie hors du projet
import moteur_b as B  # noqa: E402
from moteur_b.calendrier import jours_feries  # noqa: E402  (liste des feries R-JF-01, sans regle de paie)


# ------------------------------------------------------------------ outils

class Refus(Exception):
    """Une etape de B a refuse : on propage son code."""

    def __init__(self, code, etape, details=None):
        super().__init__(code)
        self.code = code
        self.etape = etape
        self.details = details or {}


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


def feries(annee):
    return jours_feries(annee)


def est_ferie(d):
    return d in feries(d.year)


# ------------------------------------------------------------------ contexte

class Ctx:
    def __init__(self, s):
        k = s["contrat"]
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

    def dispense(self, d):
        """T-074 : jour du preavis dispense par l'employeur (apres le dernier jour travaille, jusqu'a la fin)."""
        return isinstance(self.dernier_travaille, date) and self.dernier_travaille < d <= self.fin

    def dans_contrat(self, d):
        return d >= self.debut and (self.fin is None or d <= self.fin)

    def prevu(self, d):
        """Minutes prevues ce jour (planning type ; 0 en semaine de non-accueil)."""
        if not self.dans_contrat(d):
            return 0
        if self.type == "incomplete" and lundi(d) in self.sans_accueil:
            return 0
        return self.plan_min.get(d.weekday(), 0)

    def conge(self, d):
        for l in self.conges:
            if l["du"] <= d <= l["au"]:
                return l["type"]
        return None

    def travail_jour(self, d):
        """Minutes de travail du jour (R-HC-04 via B) pour un jour travaille."""
        j = self.jours.get(d)
        p = self.plages.get(d.weekday(), [])
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
    for l in ctx.conges:
        if l["type"] == "evenement" and l["du"] <= d <= l["au"]:
            break
    if not l.get("nature"):
        r = appel("qualifier_absence", "am_evenement_familial", ctx.type)  # refus R-ABS-06
    r = appel("jours_conge_evenement", NATURES_EVT[l["nature"]], l["du"], l["du"], l["au"])
    st = r["resultat"]["jours"][d.isoformat()]
    if st == "remunere":
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
    total = 0
    for l in sorted([x for x in ctx.conges if x["type"] == "cp" and p0 <= x["du"] <= p1], key=lambda x: x["du"]):
        reprise = l["au"] + timedelta(days=1)
        while ctx.prevu(reprise) == 0 or est_ferie(reprise):
            reprise += timedelta(days=1)
        r = appel("decompte_jours_cp", l["du"], reprise, ctx.jours_travailles)
        total += r["resultat"]["jours_decomptes"]
        if l["du"] <= d <= l["au"]:
            return total <= droits
    return True


def episodes_maladie(ctx):
    """Episodes d'absence de l'enfant malade avec certificat : jours prevus
    consecutifs (sans jour prevu entre deux)."""
    if "episodes" in ctx.cache:
        return ctx.cache["episodes"]
    jours = sorted(d for d, j in ctx.jours.items() if j.get("abs") == "malade_certif" and ctx.prevu(d) > 0)
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


def qualifier_jour(ctx, d):
    """Renvoie (nature, deductible, minutes_travaillees) ou leve Refus.
    nature : hors, travaille, absence, ferie_chome, ferie_travaille, cp."""
    prevu = ctx.prevu(d)
    j = ctx.jours.get(d) or {}
    if not ctx.dans_contrat(d):
        return "hors", False, 0
    if ctx.dernier_travaille == "incoherent":
        raise Refus("ERREUR-SAISIE", "qualifier_jour", {"message": "dernier jour travaille hors du contrat ou apres la fin"})
    if ctx.dispense(d):
        # T-074 : jour paye comme s'il avait ete travaille (CCN 64.2, 66, 122 ; F16842), sans travail effectif : pas
        # d'entretien ni de repas (CCN 114.1, 114.2 ; CASF L423-18). Compte pour les CP et l'anciennete (CCN 64.2).
        if j or ctx.conge(d):
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
            return "travaille", False, ctx.travail_jour(d)
        return "hors", False, 0
    c = ctx.conge(d)
    if c == "cp":
        if ctx.type == "complete":
            if droits_cp_suffisants(ctx, d):
                return "cp", False, 0  # R-CP-07 : salaire mensualise maintenu
            r = appel("qualifier_absence", "conge_complementaire_non_remunere", ctx.type)
            return "absence", r["resultat"]["deductible"], 0
        raise Refus("SANS-REGLE-CP-SEMAINE-PROGRAMMEE", "qualifier_jour")
    if c == "evenement":
        return "absence", jour_evenement(ctx, d), 0
    if c:
        r = appel("qualifier_absence", _TYPE_AM[c], ctx.type)
        return "absence", r["resultat"]["deductible"], 0
    if est_ferie(d) and not (j.get("ferie_travaille") or j.get("pres")):
        jna = [x + timedelta(days=i) for x in ctx.sans_accueil for i in range(7)] if ctx.type == "incomplete" else []
        r = appel("ferie_chome", d, ctx.jours_travailles, jours_non_accueil=jna)
        res = r["resultat"]
        if res.get("jours_condition"):
            av, ap = (d_(x) for x in res["jours_condition"])
            r = appel("ferie_chome", d, ctx.jours_travailles, presence_veille=statut_presence(ctx, av),
                      presence_lendemain=statut_presence(ctx, ap), jours_non_accueil=jna)
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
            r = appel("mensualisation", ctx.semaines, ctx.hebdo, ctx.taux)
            ctx.cache["mens"] = r["resultat"]["salaire_mensualise_centimes"]
        except Refus as e:
            ctx.cache["mens"] = e
    v = ctx.cache["mens"]
    if isinstance(v, Refus):
        raise v
    return v


def mois_b(ctx, m):
    """Sorties d'un mois. Chaque sortie : valeur ou Refus."""
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
                        x = ctx.plan_min.get(d.weekday(), 0)
                        if ctx.type == "incomplete" and lundi(d) in ctx.sans_accueil:
                            x = 0
                        if x:
                            unites += x if ctx.type == "complete" else 1
        for d in jours:
            if d < ctx.debut:
                continue
            q = qual[d]
            if isinstance(q, Refus):
                raise q
            nature, ded, _ = q
            if nature == "absence" and ded or nature == "ferie_chome" and ded:
                unites += ctx.prevu(d) if ctx.type == "complete" else 1
        if sortie:
            r = appel("qualifier_absence", "fin_contrat_en_cours_de_mois", ctx.type)
            if r["resultat"]["deductible"]:
                for d in jours:
                    if d > ctx.fin:
                        x = ctx.plan_min.get(d.weekday(), 0)
                        if ctx.type == "incomplete" and lundi(d) in ctx.sans_accueil:
                            x = 0
                        if x:
                            unites += x if ctx.type == "complete" else 1
        if unites == 0:
            return 0
        plan0 = {j: v for j, v in ctx.plan_min.items()}
        contient = ctx.type == "incomplete" and any(lundi(d) in ctx.sans_accueil for d in jours)
        p = appel("prevu_du_mois", a.year, a.month, plan0, ctx.type, contient_semaine_non_accueil=contient)
        prevu = p["resultat"]["prevu_minutes"] if ctx.type == "complete" else p["resultat"]["prevu_jours"]
        r = appel("deduction_absence", ctx.type, mens, unites, prevu)
        return r["resultat"]["deduction_centimes"]

    garde("deduction", deduction)

    def base():
        ded = out["deduction"]
        if isinstance(ded, Refus):
            raise ded
        return mensualise(ctx) - ded

    garde("salaire_base_mois", base)

    # Heures en plus par semaine civile
    def heures():
        hc = hm = 0
        semaines = sorted({lundi(d) for d in jours})
        for lu in semaines:
            sem = [lu + timedelta(days=i) for i in range(7)]
            extra = 0
            reelles = 0
            absence = False
            contrat_min = 0
            for d in sem:
                pv = ctx.prevu(d)
                contrat_min += pv
                if d < a or d > b:
                    q = qualifier_jour(ctx, d)
                else:
                    q = qual[d]
                if isinstance(q, Refus):
                    if q.code == "HORS-COMPARATEUR":
                        raise q
                    # Jour non travaille dont la paie est refusee par B : c'est bien une absence dans la semaine.
                    q = ("absence", None, 0)
                nature, ded, mt = q
                if nature in ("travaille", "ferie_travaille"):
                    reelles += mt
                    extra += max(0, mt - pv)
                elif pv > 0:
                    absence = True
            if extra == 0:
                continue
            if lu < a or lu + timedelta(days=6) > b:
                raise Refus("HORS-COMPARATEUR", "heures", {"motif": "semaine a cheval sur deux mois"})
            r = appel("heures_en_plus_semaine", contrat_min, reelles, ctx.taux, ctx.maj_hm,
                      majoration_hc_pourcent=ctx.maj_hc, absence_dans_semaine=absence)
            hc += r["resultat"]["montant_complementaires_centimes"]
            hm += r["resultat"]["montant_majorees_centimes"]
        return hc, hm

    garde("_heures", heures)

    def partie(i):
        v = out["_heures"]
        if isinstance(v, Refus):
            raise v
        return v[i]

    garde("heures_compl_montant", lambda: partie(0))
    garde("heures_maj_montant", lambda: partie(1))

    def ferie_trav():
        for d in jours:
            q = qual[d]
            if isinstance(q, Refus):
                continue
            if q[0] == "ferie_travaille":
                appel("ferie_travaille", d)
        return 0

    garde("ferie_travaille_montant", ferie_trav)

    def total():
        for n in ("salaire_base_mois", "_heures", "ferie_travaille_montant"):
            if isinstance(out[n], Refus):
                raise out[n]
        r = appel("salaire_du_mois", mensualise(ctx), list(out["_heures"]), out["deduction"])
        return r["resultat"]["salaire_brut_mois_centimes"]

    garde("salaire_mois_hors_cp", total)

    # Indemnites
    def jours_effectifs():
        res = []
        for d in jours:
            q = qual[d]
            if isinstance(q, Refus):
                if q.code == "HORS-COMPARATEUR":
                    raise q
                continue  # jour d'absence ou ferie chome : pas de travail effectif (R-ABS-10)
            if q[0] in ("travaille", "ferie_travaille") and q[2] > 0:
                res.append((d, q[2]))
        return res

    def accueil(d):
        """T-042f : duree d'accueil reelle du jour (presence de l'enfant), en minutes : la presence saisie dans la
        situation, sinon les heures prevues (l'enfant est la comme prevu). Meme presence que celle donnee a A."""
        j = ctx.jours.get(d) or {}
        if j.get("pres"):
            return sum(minutes(b) - minutes(a_) for a_, b in j["pres"])
        return ctx.prevu(d)

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
        # T-042c : tarif PAR JOUR au contrat. B n'a pas d'entree « par jour » (indemnite_entretien_mois ne prend qu'un
        # montant horaire). Un jour qui dure exactement le planning vaut le tarif du jour sous toutes les lectures :
        # B recoit le montant horaire tarif x 60 / duree prevue, qui redonne ce tarif sans choisir de lecture. Un jour
        # d'une autre duree que le planning (heures en plus, jour hors planning) : B refuse visiblement
        # (ENTRETIEN-TARIF-JOUR), sans convertir. Remplace la conversion de T-042 (V5, B-1).
        jour = ctx.k.get("entretien_jour", 0)
        autres = [str(d) for d, mt in js if mt != ctx.prevu(d)]
        if autres:
            raise Refus("ENTRETIEN-TARIF-JOUR", "indemnite_entretien_mois",
                        {"motif": "tarif par jour, jour d'une autre duree que le planning : B n'a pas d'entree par jour",
                         "jours": autres})
        total = 0
        for d, mt in js:
            r = appel("indemnite_entretien_mois", [jour_b(d, mt)],
                      f"{jour * 60}/{mt}", a)
            total += r["resultat"]["indemnite_centimes"]
        return total

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
    try:
        malade = [d for d in jours_entre(a, b) if ctx.conge(d) == "am_malade"]
        non_assimile = [d for d in jours_entre(a, b) if ctx.conge(d) in ("sans_solde", "am_enfant_malade")]
        complete_periode = a == p0 and b == p1 and ctx.type == "complete" and not malade and not non_assimile
        if complete_periode:
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
        else:
            sal = salaires_periode(ctx, a, b)
            icp_pendant, icp_prec = icp_periode(ctx, y, a, b)
            r = appel("indemnite_cp", j, ctx.hebdo, ctx.taux, sal, icp_pendant, icp_prec, None, acq["jours_enfants"])
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
                    r = appel("complement_cp_annee_complete", ind["ind"])
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
    except Refus as ex:
        out["cp_indemnite_mois"] = ex
    return out


# ------------------------------------------------------------------ fin de contrat

# T-050c : part du net dans le brut utilisee par A pour estimer le brut (src/engine/rates.ts, NET_BRUT = 7810, la meme
# pour toutes les periodes). Arrondi de Math.round (demi vers le haut). Sert seulement a l'assiette du 1/80.
NET_SUR_BRUT_A = 7810


def _brut_comme_a(net):
    x = Fraction(net * 10000, NET_SUR_BRUT_A) + Fraction(1, 2)
    return x.numerator // x.denominator


def _unite(ctx, d):
    """Unite de l'art. 111 pour un jour du planning (minutes en annee complete, 1 jour en annee incomplete ;
    0 hors planning et en semaine sans accueil), comme dans la deduction de mois_b."""
    x = ctx.plan_min.get(d.weekday(), 0)
    if ctx.type == "incomplete" and lundi(d) in ctx.sans_accueil:
        x = 0
    if not x:
        return 0
    return x if ctx.type == "complete" else 1


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
        if e.code == "P-1" and e.details.get("lectures_centimes"):
            icp_lectures = list(e.details["lectures_centimes"])
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
    """ICCP de fin (code de fin_b, mis en fonction pour T-074, sans changement)."""
    try:
        y = fin.year if fin.month >= 6 else fin.year - 1
        periodes = []
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
                            reprise = l["au"] + timedelta(days=1)
                            while ctx.prevu(reprise) == 0 or est_ferie(reprise):
                                reprise += timedelta(days=1)
                                if reprise > fin + timedelta(days=60):
                                    break
                            payes += appel("decompte_jours_cp", l["du"], reprise, ctx.jours_travailles)["resultat"]["jours_decomptes"]
                    payes = min(payes, ja)
                else:
                    if ctx.k.get("cp_mode", "juin") == "juin" and fin >= date(y, 6, 1):
                        payes = ja
                    else:
                        raise Refus("HORS-COMPARATEUR", "iccp", {"motif": "modalite de paiement autre que juin"})
            icp_pendant, icp_prec = icp_periode(ctx, yy, a, b)
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
        r = appel("iccp", ctx.type, motif_b, periodes, ctx.hebdo, ctx.taux)
        out["iccp"] = r["resultat"]["iccp_centimes"]
    except Refus as e:
        out["iccp"] = e


def fin_b(ctx, k):
    out = {}
    auteur = "am" if k["motif"] == "demission" else "employeur"
    motif_b = "deces_enfant" if k["motif"] == "deces" else "normal"
    env = d_(k["notification"])
    pres = d_(k.get("presentation", k["notification"]))
    try:
        r = appel("duree_preavis", auteur, ctx.debut, env, pres, motif=motif_b)
        out["preavis"] = r["resultat"]["preavis"]
    except Refus as e:
        out["preavis"] = e
    out["date_fin_preavis"] = Refus("PREAVIS-DATE-FIN", "duree_preavis")
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
        if ctx.type == "complete":
            out["regularisation_fin"] = 0
        else:
            ecarts = []
            debut_annee = ctx.debut
            while True:
                fin_annee = date(debut_annee.year + 1, debut_annee.month, debut_annee.day) - timedelta(days=1)
                derniere = fin_annee >= fin
                b = fin if derniere else fin_annee
                verse = 0
                eff = fer = absr = hcm = 0
                for m in mois_entre(debut_annee, b):
                    v = mois_b(ctx, m)["salaire_base_mois"]
                    if isinstance(v, Refus):
                        raise v
                    verse += v
                for d in jours_entre(debut_annee, b):
                    q = qualifier_jour(ctx, d)
                    nature, ded, mt = q
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
                comp = {"feries_chomes_payes": {"minutes": fer, "incluses": False},
                        "absences_remunerees": {"minutes": absr, "incluses": False},
                        "heures_complementaires": {"minutes": hcm, "incluses": False}}
                if derniere:
                    r = appel("regularisation_finale", "incomplete", ecarts, verse, ctx.taux, eff, comp)
                    out["regularisation_fin"] = r["resultat"]["versement_centimes"]
                    break
                r = appel("regularisation_annuelle", "incomplete", verse, ctx.taux, eff, comp)
                ecarts.append(r["resultat"]["ecart_centimes"])
                debut_annee = fin_annee + timedelta(days=1)
    except Refus as e:
        out["regularisation_fin"] = e
    # ICCP
    _iccp_b(ctx, out, motif_b, fin)
    # Indemnite de rupture. Appel d'essai sans montants : si B conclut ou refuse
    # sans avoir besoin des salaires (non due, moins de 9 mois, A-47...), sa
    # reponse vaut ; sinon on lui donne les salaires du contrat.
    try:
        essai = B.indemnite_rupture(motif_b, auteur, ctx.debut, env, 0)
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
            sal += _brut_comme_a(v)
            # CP payes dans le mois (annee incomplete) et complement de juin (annee complete), comme A
            # (cpForMonth : indemnite + complement, convertis le dernier jour du mois).
            cm = cp_mois_b(ctx, m)
            for cle in ("cp_indemnite_mois", "cp_complement_mois"):
                if isinstance(cm[cle], Refus):
                    raise cm[cle]
            icp += _brut_comme_a(cm["cp_indemnite_mois"] + cm["cp_complement_mois"])
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
        reg_brut = _brut_comme_a(reg_v)
        iccp_brut = _brut_comme_a(iccp_v + reg_v) - reg_brut
        r = appel("indemnite_rupture", motif_b, auteur, ctx.debut, env, sal, iccp_centimes=iccp_brut, icp_centimes=icp,
                  regularisation_centimes=reg_brut, sommes_a_confirmer=a_confirmer)
        out["indemnite_rupture"] = r["resultat"]["indemnite_centimes"]
        if k.get("comparer_assiette"):
            out["assiette_rupture"] = r["resultat"]["assiette_centimes"]
    except StopIteration:
        pass
    except Refus as e:
        out["indemnite_rupture"] = e
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


def composition(s):
    ctx = Ctx(s)
    out = {}
    for k in s["calculs"]:
        pre = f"{k['id']}." if k.get("id") else ""
        t = k["type"]
        if t == "mois":
            res = {n: v for n, v in mois_b(ctx, k["mois"]).items() if not n.startswith("_") and n != "deduction"}
        elif t == "cp_acquisition":
            res = acquisition_b(ctx, k["periode"])
        elif t == "cp_indemnite":
            r = indemnite_b(ctx, k["periode"])
            res = {"indemnite_cp": r["indemnite_cp"], "maintien_cp": r["maintien_cp"]}
        elif t == "cp_mois":
            res = cp_mois_b(ctx, k["mois"])
        elif t == "fin":
            res = fin_b(ctx, k)
        elif t == "cp_decompte":
            try:
                r = appel("decompte_jours_cp", d_(k["du"]), d_(k["reprise"]), ctx.jours_travailles)
                res = {"jours_decomptes": r["resultat"]["jours_decomptes"]}
            except Refus as e:
                res = {"jours_decomptes": e}
        elif t == "ferie":
            try:
                nature, ded, _ = qualifier_jour(ctx, d_(k["date"]))
                res = {"ferie_paye": not ded} if nature == "ferie_chome" else {"ferie_paye": Refus("HORS-COMPARATEUR", "ferie")}
            except Refus as e:
                res = {"ferie_paye": e}
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
