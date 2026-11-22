"""Comparateur des moteurs A et B (tache T-008).

Lance : python3 comparer.py  (depuis ce dossier, ou avec un chemin absolu)
1. regenere les situations (generer_situations.py) ;
2. construit l'adaptateur du moteur A avec esbuild (moteur A non modifie) ;
3. execute A (Node) et B (Python) sur chaque situation ;
4. classe chaque sortie :
   F1 : les deux calculent, egaux au centime ;
   F2 : les deux calculent, differents ;
   F3 : A calcule, B refuse (code d'ambiguite ou de refus de B) ;
   F4 : B calcule, A refuse ou n'a pas la fonction ;
   N  : aucun des deux ne calcule (hors famille).
   Une sortie dont la difference vient d'une etape que B refuse ailleurs
   (champ « propage_de » de la situation) est classee F3 « propage ».
5. ecrit resultats/resultats.json et resultats/synthese.md.
Aucun resultat de reference n'est calcule ici.
"""

import json
import math
import os
import subprocess
import sys
from collections import Counter, defaultdict
from fractions import Fraction

ICI = os.path.dirname(os.path.abspath(__file__))
# Racine du moteur A, lue seulement (T-027 : /home/claude/correctifs-t019 par defaut).
A_RACINE = os.environ.get("ARVELA_A_RACINE", "/home/claude/correctifs-t019")
sys.path.insert(0, ICI)
import adaptateur_b  # noqa: E402


# T-042b (C-3 de V5) : le code compile de A est construit HORS de l'arborescence du projet, pour que les agents
# du moteur B ne puissent pas le lire. Dossier reglable par ARVELA_BUILD_A (defaut : /tmp/arvela-comparateur-build-a).
import tempfile
# Direction 18/11/2026 : un dossier neuf par lancement, sinon deux comparaisons simultanees
# s'ecrasent le code compile de A et l'une compare une autre version de A que celle demandee.
BUILD = os.environ.get("ARVELA_BUILD_A") or tempfile.mkdtemp(prefix="arvela-comparateur-build-a-")


def construire_a():
    os.makedirs(BUILD, exist_ok=True)
    # L'adaptateur porte la racine fictive __A_RACINE__ : on en ecrit une copie avec la vraie racine.
    src = open(os.path.join(ICI, "adaptateur_a.ts"), encoding="utf-8").read().replace("__A_RACINE__", A_RACINE)
    copie = os.path.join(BUILD, "adaptateur_a.ts")
    with open(copie, "w", encoding="utf-8") as f:
        f.write(src)
    subprocess.run([os.path.join(A_RACINE, "node_modules", ".bin", "esbuild"), copie,
                    "--bundle", "--platform=node", "--format=esm", "--log-level=warning",
                    "--outfile=" + os.path.join(BUILD, "adaptateur_a.mjs")], check=True)


def executer_a(fichier):
    r = subprocess.run(["node", os.path.join(BUILD, "adaptateur_a.mjs"), fichier], check=True,
                       capture_output=True, text=True)
    return json.loads(r.stdout)


def nombre(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return Fraction(v)
    if isinstance(v, float):
        return v
    if isinstance(v, str):
        try:
            return Fraction(v)
        except ValueError:
            return None
    return None


def egaux(a, b):
    na, nb = nombre(a), nombre(b)
    if na is not None and nb is not None:
        return abs(float(na) - float(nb)) < 1e-6
    return a == b


DOMAINES = [
    ("salaire_mensualise", "mensualisation"), ("heures_mensualisees", "mensualisation"),
    ("minutes_mensualisees", "mensualisation"), ("semaines_programmees", "mensualisation"),
    ("salaire_base_mois", "absences et déductions"), ("deduction", "absences et déductions"),
    ("salaire_du_mois", "heures en plus"), ("salaire_du", "absences et déductions"), ("prevu_", "absences et déductions"),
    ("deductible", "absences et déductions"),
    ("heures_", "heures en plus"), ("montant_h", "heures en plus"), ("salaire_du_mois", "heures en plus"),
    ("ferie", "jours fériés"),
    ("salaire_mois_hors_cp", "salaire total du mois"),
    ("entretien", "indemnités"), ("minimum_9h", "indemnités"), ("minimum_1", "indemnités"),
    ("minimum_6h", "indemnités"), ("repas", "indemnités"), ("km", "indemnités"), ("evt_", "événements familiaux"),
    ("jours_acquis", "congés payés"), ("jours_enfants", "congés payés"), ("total", "congés payés"),
    ("fractionnement", "congés payés"), ("jours_semaine", "congés payés"), ("jours_decomptes", "congés payés"),
    ("maintien", "congés payés"), ("indemnite_cp", "congés payés"), ("indemnite", "congés payés"),
    ("cp_", "congés payés"), ("complement", "congés payés"),
    ("regularisation", "régularisation"),
    ("preavis", "fin de contrat"), ("date_fin", "fin de contrat"), ("indemnite_rupture", "fin de contrat"),
    ("iccp", "fin de contrat"), ("precarite", "fin de contrat"), ("jours_a_indemniser", "fin de contrat"),
    ("minimum_", "brut et net"), ("conversion", "brut et net"),
]


def domaine(cle):
    nom = cle.split(".")[-1]
    for pref, d in DOMAINES:
        if nom.startswith(pref):
            return d
    return "autre"


def lectures(cle, a_sorties, b_sortie, a_val):
    """A est-il dans une des lectures que B enumere ? None si non applicable."""
    det = b_sortie.get("details") or {}
    code = b_sortie.get("code")
    etape = b_sortie.get("etape")
    if code == "ARR-01" and "valeur_exacte_centimes" in det:
        x = Fraction(det["valeur_exacte_centimes"])
        lect = {math.floor(x), math.ceil(x)}
        nom = cle.split(".")[-1]
        if etape == "mensualisation" and nom == "salaire_mensualise":
            return a_val in lect, sorted(lect)
        if etape == "deduction_absence" and nom in ("deduction", "salaire_base_mois", "salaire_du"):
            pre = cle[: -len(nom)]
            ded = a_sorties.get(pre + "deduction", {}).get("valeur")
            if ded is None:
                return None
            return ded in lect, sorted(lect)
        if nom == cle and etape in ("deduction_absence", "mensualisation") and b_sortie.get("details"):
            return a_val in lect, sorted(lect)
        return None
    # T-077 (MB7) : le moteur B donne les valeurs possibles d'une sortie à confirmer (fériés locaux, maintien du droit local).
    if "lectures_valeurs" in det:
        lect = set(det["lectures_valeurs"])
        return a_val in lect, sorted(lect, key=str)
    if code in ("A-23", "SUS-11") and "resultats_par_methode" in det and cle.split(".")[-1] in ("jours_acquis", "jours_acquis_hors_enfants"):
        lect = set(det["resultats_par_methode"].values())
        return a_val in lect, sorted(lect)
    if code in ("A-35",) and "candidats_exacts_centimes" in det:
        lect = set()
        for c in det["candidats_exacts_centimes"]:
            x = Fraction(c)
            lect |= {math.floor(x), math.ceil(x)}
        return a_val in lect, sorted(lect)
    if code == "A-36" and "valeur_exacte_centimes" in det:
        x = Fraction(det["valeur_exacte_centimes"])
        lect = {math.floor(x), math.ceil(x)}
        return a_val in lect, sorted(lect)
    return None


def classer(situations, res_a, res_b):
    lignes = []
    for s in situations:
        sa = res_a.get(s["id"], {})
        sb = res_b.get(s["id"], {})
        propage = s.get("propage_de", {})
        # Le jeu de sorties comparees est celui de B (sorties auxiliaires de A ignorees),
        # plus les erreurs eventuelles de l'adaptateur A.
        cles = list(sb) + [c for c in sa if c.endswith(".erreur") and c not in sb]
        for cle in cles:
            a = sa.get(cle, {"statut": "absent", "note": "sortie non produite par l'adaptateur A"})
            b = sb.get(cle, {"statut": "absent", "note": "sortie non produite par l'adaptateur B"})
            a_calc = a["statut"] == "ok"
            b_calc = b["statut"] == "ok"
            ligne = {"situation": s["id"], "origine": s["origine"], "cas": s.get("cas"), "theme": s.get("theme"),
                     "cle": cle, "domaine": domaine(cle), "a": a, "b": b}
            if b["statut"] == "erreur" or a.get("statut") == "refus" and cle.endswith(".erreur"):
                fam = "ERREUR"
            elif a_calc and b_calc:
                if egaux(a["valeur"], b["valeur"]):
                    fam = "F1"
                elif cle in propage:
                    fam = "F3"
                    ligne["code"] = "propagé : " + propage[cle]
                else:
                    fam = "F2"
            elif a_calc and b["statut"] == "non_gere":
                fam = "F3"
                ligne["code"] = b["code"]
                lec = lectures(cle, sa, b, a["valeur"])
                if lec is not None:
                    ligne["dans_lectures"] = lec[0]
                    ligne["lectures"] = lec[1]
            elif a.get("non_comparable"):
                fam = "N"
                ligne["code"] = "non comparable" + (f" (B : {b['code']})" if b.get("code") else "")
            elif b_calc and not a_calc:
                fam = "F4"
            else:
                fam = "N"
                if b["statut"] == "non_gere":
                    ligne["code"] = b["code"]
            ligne["famille"] = fam
            marques = s.get("marques", {})
            if cle in marques or "*" in marques:
                ligne["marque"] = marques.get(cle, marques.get("*"))
            att = s.get("attendu_officiel", {})
            nom = cle.split(".")[-1]
            if nom in att:
                ligne["attendu"] = att[nom]
                if a_calc:
                    ligne["a_egal_officiel"] = egaux(a["valeur"], att[nom])
                if b_calc:
                    ligne["b_egal_officiel"] = egaux(b["valeur"], att[nom])
            lignes.append(ligne)
    return lignes


def euros(v):
    if isinstance(v, bool) or v is None:
        return str(v)
    if isinstance(v, (int, float)):
        return f"{v}"
    return json.dumps(v, ensure_ascii=False)


def synthese(lignes):
    out = []
    fams = ["F1", "F2", "F3", "F4", "N", "ERREUR"]
    for origine in ("officiel", "grille", None):
        sel = [l for l in lignes if origine is None or l["origine"] == origine]
        titre = {"officiel": "Cas officiels", "grille": "Grille générée", None: "Total"}[origine]
        out.append(f"### {titre} ({len(sel)} sorties comparées)\n")
        out.append("| Domaine | " + " | ".join(fams) + " |")
        out.append("|---|" + "---|" * len(fams))
        par = defaultdict(Counter)
        for l in sel:
            par[l["domaine"]][l["famille"]] += 1
        tot = Counter()
        for d in sorted(par):
            out.append(f"| {d} | " + " | ".join(str(par[d][f]) for f in fams) + " |")
            tot.update(par[d])
        out.append("| **Total** | " + " | ".join(f"**{tot[f]}**" for f in fams) + " |\n")
    out.append("### Codes des F3 (toutes origines)\n")
    out.append("| Code | Sorties | Situations | Hors de toutes les lectures de B |")
    out.append("|---|---|---|---|")
    c = Counter(l["code"] for l in lignes if l["famille"] == "F3")
    sits = defaultdict(set)
    hors = Counter()
    for l in lignes:
        if l["famille"] == "F3":
            sits[l["code"]].add(l["situation"])
            if l.get("dans_lectures") is False:
                hors[l["code"]] += 1
    for code, n in c.most_common():
        out.append(f"| {code} | {n} | {len(sits[code])} | {hors[code]} |")
    out.append("\n### F2 (détail)\n")
    out.append("| Situation | Sortie | A | B | Officiel |")
    out.append("|---|---|---|---|---|")
    for l in lignes:
        if l["famille"] == "F2":
            out.append(f"| {l['situation']} | {l['cle']} | {euros(l['a'].get('valeur'))} | {euros(l['b'].get('valeur'))} | {euros(l.get('attendu', ''))} |")
    out.append("\n### F4 (détail)\n")
    out.append("| Situation | Sortie | B | Note A |")
    out.append("|---|---|---|---|")
    for l in lignes:
        if l["famille"] == "F4":
            out.append(f"| {l['situation']} | {l['cle']} | {euros(l['b'].get('valeur'))} | {l['a'].get('note', '')} |")
    out.append("\n### Cas officiels : A et B face au résultat officiel\n")
    out.append("| Situation | Sortie | Officiel | A | B | Famille |")
    out.append("|---|---|---|---|---|---|")
    for l in lignes:
        if l["origine"] == "officiel":
            av = euros(l["a"].get("valeur")) if l["a"]["statut"] == "ok" else f"({l['a']['statut']})"
            bv = euros(l["b"].get("valeur")) if l["b"]["statut"] == "ok" else f"({l['b'].get('code', l['b']['statut'])})"
            out.append(f"| {l['situation']} | {l['cle']} | {euros(l.get('attendu', ''))} | {av} | {bv} | {l['famille']} |")
    # T-042b : sorties marquees (hors verrou 2, montant horaire d'entretien, preavis non execute).
    marq = defaultdict(Counter)
    for l in lignes:
        if l.get("marque"):
            marq[l["marque"]][l["famille"]] += 1
    if marq:
        out.append("\n### Sorties marquées (T-042b à T-042d)\n")
        out.append("Entretien à tarif par jour : sur un jour qui dure exactement le planning, B reçoit le montant horaire "
                   "tarif × 60 / durée prévue, simple conversion d'unité qui donne la même valeur sous les deux lectures "
                   "(décision de la direction, T-042c) ; sur un jour d'une autre durée, rien n'est converti.\n")
        out.append("| Marque | " + " | ".join(fams) + " |")
        out.append("|---|" + "---|" * len(fams))
        for m in sorted(marq):
            out.append(f"| {m} | " + " | ".join(str(marq[m][f]) for f in fams) + " |")
    erreurs = [l for l in lignes if l["famille"] == "ERREUR"]
    if erreurs:
        out.append("\n### Erreurs d'adaptateur\n")
        for l in erreurs:
            out.append(f"- {l['situation']} {l['cle']} : A {l['a']} ; B {l['b']}")
    return "\n".join(out) + "\n"


def main():
    subprocess.run([sys.executable, os.path.join(ICI, "generer_situations.py")], check=True)
    construire_a()
    situations = []
    res_a = {}
    for nom in ("officiels.json", "grille.json"):
        f = os.path.join(ICI, "situations", nom)
        sits = json.load(open(f, encoding="utf-8"))
        situations += sits
        res_a.update(executer_a(f))
    res_b = {s["id"]: adaptateur_b.executer(s) for s in situations}
    lignes = classer(situations, res_a, res_b)
    os.makedirs(os.path.join(ICI, "resultats"), exist_ok=True)
    with open(os.path.join(ICI, "resultats", "resultats.json"), "w", encoding="utf-8") as f:
        json.dump(lignes, f, ensure_ascii=False, indent=1, default=str)
    with open(os.path.join(ICI, "resultats", "synthese.md"), "w", encoding="utf-8") as f:
        f.write("# Synthèse générée par comparer.py (T-008)\n\n" + synthese(lignes))
    c = Counter(l["famille"] for l in lignes)
    print(f"{len(situations)} situations, {len(lignes)} sorties : " + ", ".join(f"{k} {v}" for k, v in sorted(c.items())))


if __name__ == "__main__":
    main()
