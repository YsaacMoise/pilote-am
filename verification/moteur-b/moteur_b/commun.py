"""Outils communs du moteur B (Calculateur Arvela, tache T-007).

Principes appliques partout :
- Les montants sont en centimes entiers. Les calculs intermediaires sont faits
  en nombres rationnels exacts (fractions.Fraction). Aucun nombre a virgule
  flottante n'est accepte pour l'argent, les heures ou les taux.
- Aucune regle d'arrondi monetaire n'est ecrite dans regles-v0.md ni dans
  contre-verification-v0.md (voir SUS-01, SUS-07, A-03, A-36). Jusqu'a T-040c,
  le moteur refusait (ARR-01). Depuis T-040d : centime le plus proche, decision
  ARR-01 du DG du 18/11/2026, trace dans details.arrondis_arr01 avec la valeur
  exacte (voir vers_centimes).
- Toute ambiguite non tranchee (A-xx, SUS-xx), toute regle douteuse et tout cas
  exclu produisent un refus explicite « non gere ».
"""

from fractions import Fraction
from datetime import date
import functools

# Derniere date de verification des baremes (contre-verification T-005 du 18/11/2026).
DATE_DERNIERE_VERIFICATION = date(2026, 11, 18)

# Date d'application par defaut de la CCN IDCC 3239 (regles-v0, « Comment lire »).
DATE_APPLICATION_CCN = date(2022, 1, 1)


class NonGere(Exception):
    """Refus explicite : le cas n'est pas gere par le moteur B."""

    def __init__(self, code, regles=(), precision=None, details=None):
        super().__init__(code)
        self.code = code
        self.regles = list(regles)
        self.precision = precision
        self.details = details or {}


class ErreurSaisie(Exception):
    """Donnee d'entree invalide (type, signe, valeur contraire a une regle)."""

    def __init__(self, message, regles=()):
        super().__init__(message)
        self.message = message
        self.regles = list(regles)


# Registre des motifs de refus. Chaque code renvoie a regles-v0.md,
# contre-verification-v0.md ou cas-officiels-v0.md (liste des suspects).
QUOI_FAIRE_DEFAUT = (
    "Cas non gere par Arvela. Faites ce calcul avec le simulateur officiel "
    "Pajemploi ou demandez une reponse ecrite a la DDETS. La direction du projet "
    "doit trancher ce point (tache T-015)."
)

CODES = {
    "ARR-01": "Code leve par T-040d (centime le plus proche, decision ARR-01 du DG du 18/11/2026 dans l'attente de la DDETS) ; garde pour l'historique.",
    "A-01": "Accueil de 47 a 51 semaines : aucun texte ne le classe en annee complete ou incomplete.",
    "A-02": "Formule ecrite en brut par la CCN et en net par l'Urssaf : le moteur B ne calcule qu'en brut.",
    "A-04": "Horaires variables d'une semaine a l'autre : la formule de mensualisation n'est pas adaptee.",
    "A-05": "Semaine partiellement travaillee : comptage dans les « semaines programmees » non defini.",
    "A-06": "« Heures reellement effectuees » non defini pour la regularisation (heures complementaires, feries chomes payes, absences remunerees).",
    "A-08": "Adaptation en annee incomplete : deduction en jours (CCN art. 111) ou en heures (Urssaf).",
    "A-09": "Semaine avec absence et heures en plus : compensation ou non, non ecrit.",
    "A-13": "Contrat de plus de 45 heures : majoration dans le mensualise ou a part, non ecrit.",
    "A-15": "« Jour d'absence » non defini (jour calendaire, jour d'accueil, demi-journee).",
    "A-16": "Periode d'appreciation : « 12 mois glissants » contre « a compter de la date anniversaire ».",
    "A-17": "Lien entre la limite de 5 jours et celle de 14 jours calendaires consecutifs non ecrit.",
    "A-18": "Nombre de longues absences possibles par periode non ecrit.",
    "A-19": "Code leve par T-040 (CCN art. 111, dernier alinea : semaines de non-accueil au denominateur) ; garde pour l'historique et le preavis (R-FIN-05).",
    "A-20": "Code leve par T-040 (CCN art. 111 : salaire du nul) ; garde pour l'historique.",
    "A-21": "Absence de quelques heures en annee incomplete : la formule ne compte que des jours.",
    "A-23": "Periode equivalente (mois, 4 semaines, jours) : les methodes donnent des resultats differents et aucun texte ne dit laquelle retenir.",
    "A-25": "Conges complementaires non payes en annee complete : mode de deduction non ecrit.",
    "A-26": "Formule du maintien de salaire non donnee par la CCN ; les formules possibles donnent des resultats differents ici.",
    "A-28": "Assiette du dixieme : indemnite de CP « versee pendant la periode » (CCN) ou « de l'annee precedente » (CASF).",
    "A-29": "Annee complete : moment et forme du complement quand le dixieme depasse le maintien non ecrits.",
    "A-30": "Paiement « au fur et a mesure » : repartition de l'indemnite annuelle par jour pris non definie.",
    "A-31": "Code leve par T-040 (lundi de Pentecote ferie ordinaire : CCN art. 47.2, C. trav. L3133-1, 6°) ; garde pour l'historique.",
    "A-32": "Condition de presence autour du ferie quand l'absence vient de l'enfant ou de l'employeur.",
    "A-33": "Ferie travaille : majoration en plus du mensualise ou paiement complet en plus.",
    "A-34": "Conversion du brut vers le net : regle incomplete (assiette CSG/CRDS, arrondis Pajemploi, reduction sur heures en plus).",
    "A-35": "Code leve par T-040b (minimum proportionnel a la duree, plancher 2,65 EUR : CCN 114.1, CASF D423-7, Urssaf, DREETS BFC) ; garde pour l'historique.",
    "A-36": "Code leve par T-040c (arrondi au centime le plus proche, decision ARR-01 du DG du 18/11/2026 dans l'attente de la DDETS) ; garde pour l'historique.",
    "A-37": "Bareme fiscal kilometrique non verifie (code leve par T-027 : CGI ann. IV art. 6 B relu).",
    "A-38": "Tranche kilometrique : cumul sur l'annee, le contrat ou l'employeur, non defini ; le controle du taux depend ici de la tranche.",
    "A-43": "Anciennete mesuree a l'envoi, preavis compte a la presentation : les deux dates donnent des durees differentes.",
    "A-45": "Assiette du 1/80 : l'ICCP, les CP payes et la regularisation y entrent (T-050b, CCN art. 121.1 et 124) ; restent non tranches l'indemnite de preavis (T-074 : CCN 64.2 relu, question 4 de l'envoi 1 sans reponse ; refus seulement si le montant change) et une regularisation negative.",
    "D-1": "T-074 : 9 mois d'accueil pour l'indemnite de rupture appreciees a la date d'envoi de la lettre (F16842) ou a la date de fin du contrat, preavis dispense compris (CCN 60, 64.2) : non tranche (question D-1).",
    "D-2": "T-074 : regularisation de fin d'annee incomplete avec preavis dispense par l'employeur : jours dispenses comptes comme dus et payes (a) ou regularisation arretee au dernier jour travaille, ICP a part (b) ; non tranche (question D-2).",
    "P-1": "T-074 : part de l'indemnite de preavis dans un mois paye en partie en salaire (proportion de l'art. 111 ou heures x taux) : non ecrite (question P-1).",
    "SORTIE-SEMAINE-SANS-ACCUEIL": "Annee incomplete, mois d'embauche ou de fin : jours du planning hors du contrat dans une semaine sans accueil. Ils comptent au denominateur de l'art. 111 (dernier alinea) ; leur deduction au numerateur n'est ecrite nulle part et change le salaire du mois (a confirmer).",
    "PREAVIS-FERIE": "T-074 : jour ferie sur un jour d'accueil prevu pendant le preavis dispense : paiement non ecrit (aucun texte lu ne le traite).",
    "ASSIETTE-A-CONFIRMER": "Une somme de l'assiette (ICCP ou regularisation de fin) n'est pas calculee : le montant qui en depend n'est pas donne (T-050b).",
    "A-47": "Deces de l'enfant avant 9 mois d'accueil (levee par T-035a : indemnite due, CCN 119.4.2, F16842 ; code garde pour l'historique).",
    "A-48": "Retrait d'agrement : qui supporte l'ICCP, non tranche.",
    "A-49": "ICCP en cas de faute lourde : regle R-FIN-09 douteuse, exclusion a valider par la direction.",
    "A-50": "Dixieme de l'ICCP : ICCP de la periode precedente dans la base (SUS-04) et repartition quand des jours sont deja payes, non tranchees. La regularisation de fin, elle, entre dans la base (T-050b).",
    "A-52": "Hausse du SMIC annoncee au 1er decembre 2026 sans texte publie au 18/11/2026 : SMIC, minimum legal et MG inconnus.",
    "A-54": "Titre AM-AP obtenu dans le mois : date de prise d'effet de la majoration non ecrite.",
    "A-55": "Majoration pour difficultes particulieres : mode d'application et minimum non etablis.",
    "SUS-11": "Acquisition des CP en annee incomplete : divergence majeure entre sources (methode par mois contre methode en semaines ou jours).",
    "R-MENS-10": "Regle douteuse : lissage sur 12 mois du CDD de remplacement sans texte fondateur.",
    "R-PAJ-04": "Regle douteuse : passage au net non etabli.",
    "R-ABS-06": "Evenement familial sans nature precisee : la duree du conge depend de l'evenement (utiliser conge_evenement_familial).",
    "EVT-OUVRES-2021": "Deces d'un enfant de moins de 25 ans avant le 21/07/2023 : la loi compte « sept jours ouvres », la CCN 9 jours ouvrables ; comparaison d'unites non ecrite.",
    "EVT-VERSION": "Evenement familial : les versions applicables de la CCN ou de la loi donnent des durees differentes a cette date.",
    "EVT-FERIE": "Jour ferie pendant un conge pour evenement familial : le texte ne dit pas s'il compte comme jour ouvrable.",
    "EVT-HORS-DROIT": "Jour d'absence au-dela de la duree du conge pour evenement familial : a qualifier autrement (conge sans solde, CP, etc.).",
    "KM-SUR-PLAFOND": "Taux kilometrique contractuel superieur au bareme fiscal (CCN art. 57) : le contrat doit etre corrige.",
    "KM-ELECTRIQUE-INCONNU": "Motorisation du vehicule inconnue : le plafond fiscal est majore de 20 % pour un vehicule electrique (CGI ann. IV art. 6 B, II) et le controle en depend.",
    "KM-PUISSANCE-INCONNUE": "Puissance administrative du vehicule inconnue : les baremes ne peuvent pas etre lus.",
    "KM-PARTAGE-AM": "Trajet demande par un seul employeur et fait aussi pour les enfants de l'AM : partage non prevu par l'art. 113, non tranche.",
    "PREAVIS-DEMISSION-3-12": "Demission, enfant accueilli de 3 mois a moins d'un an : CASF L423-26 (1 mois, sauf si l'employeur accepte d'abreger) contre CCN art. 120 (15 jours calendaires). Question posee a la DDETS (questions-ddets-v2, n° 2).",
    "M-05": "Evenement familial indemnise par la Securite sociale : maintien sous deduction des indemnites journalieres, montants hors moteur.",
    "M-06": "Conge complementaire de deuil : indemnise par la Securite sociale (C. trav. L3142-2, CSS L331-9) ; salaire maintenu sous deduction des indemnites journalieres (CCN 48.1.3.1.3), montants hors moteur.",
    "CP-SUPP": "Jours supplementaires (enfants, fractionnement) : effet sur le dixieme non ecrit, et le resultat en depend ici.",
    "CP-ARRONDI-PARTS": "Arrondi des jours de CP : arrondir chaque part (travail, maladie) ou le total, non ecrit, et le resultat en depend ici.",
    "CP-REPORT": "Report des CP non pris pour maladie : section du Code du travail non applicable telle quelle aux AM (CASF L423-2, 11°), non relue.",
    "R-CP-02-DATE": "Maladie et CP avant le 24 avril 2024 : regime retroactif et forclusion non geres.",
    "R-CP-08-PRISE": "Prise principale des conges sur deux mois : mois de versement non ecrit.",
    "R-JF-02-LIMITE": "Jour ferie pendant une semaine de non-accueil en annee incomplete : cas limite non tranche (R-JF-02).",
    "ENTRETIEN-DUREE-ACCUEIL-OU-TRAVAIL": "Code leve par T-103 (M1) : duree de travail de l art. 99 (CCN 114.1 « par heure de travail », KALIARTI000043942300) ; garde pour l historique.",

    "C3-DATES-CERTIFICAT": "T-103 (C3) : enfant malade : dates du certificat (du ... au ...) obligatoires ; elles fixent l'absence courte ou de 14 jours (CCN 105).",
    "C5-ORIGINE-MANQUANTE": "T-103 (C5) : jours d'enfant malade deja retenus avant le suivi : venaient-ils d'absences courtes ou d'une absence de 14 jours ? Reponse a saisir au contrat.",
    "C8-REPOS-HEBDO-MANQUANT": "T-103 (C8) : le planning prevoit le dimanche : jour de repos hebdomadaire du contrat (CCN 46) a saisir.",
    "C9-IJ-MANQUANTES": "T-103 (C9) : conge de deuil : montant des indemnites journalieres de la CPAM a saisir (salaire maintenu sous deduction, CCN 48.1.3.1.3).",
    "C11-SEMAINES-CP-AM": "T-103 (C11, reserve de B) : annee incomplete : parmi les semaines sans accueil, lesquelles sont les conges payes de l'AM (assimiles a du travail effectif, C. trav. L3141-5 1°, CCN 48.1.1.3) ? Donnee a saisir.",
    "R3-IJ-MANQUANTES": "T-103 (R3) : Alsace-Moselle, maladie de l'AM ou de son enfant : salaire maintenu moins les indemnites journalieres ; montant des indemnites journalieres a saisir (L1226-23).",
    "C17-SAISIE-CONTRADICTOIRE": "T-103 (C17) : deux absences saisies sur le meme jour (dont un conge paye) : choisir celle a garder.",
    "ENTRETIEN-SOUS-MINIMUM":"Montant contractuel d'entretien inferieur au minimum conventionnel : le contrat doit etre corrige.",
    "KM-SOUS-PLANCHER": "Taux kilometrique contractuel inferieur au bareme de l'administration : le contrat doit etre corrige.",
    "FIN-DATE-A-CONFIRMER": "T-072 : l'assiette du 1/80 change selon la date de fin du preavis (jour de depart compte ou non, CCN 64.1 et 120, non ecrit) : indemnite a confirmer.",
    "AVENANT-CP-A-CONFIRMER": "T-072 : conges acquis sous un type d'annee (complete ou incomplete) et pris apres un avenant qui change ce type : aucun texte ne dit comment les payer (CCN 102.1.2.1, 102.1.2.2, 48.1.1.5). Montant a confirmer : ni paye ni retenu.",
    "AVENANT-EN-COURS-DE-MOIS": "T-072 : avenant qui prend effet apres le 1er du mois : partage du salaire mensualise du mois non ecrit (CCN 109.1).",
    "PREAVIS-DATE-FIN": "Date de fin du preavis : methode de calcul non ecrite (R-FIN-03).",
    "LIMITE-ANCIENNETE": "Anciennete exactement a un seuil (3 mois, 9 mois, 1 an) : cas limite non tranche par le texte.",
    "DATE-MOIS": "Calcul en mois depuis un 29, 30 ou 31 : methode non ecrite.",
    "BAREME-ABSENT": "Aucun bareme verifie pour cette date.",
    "HORS-CCN": "Date anterieure au 1er janvier 2022 : la CCN IDCC 3239 ne s'applique pas encore.",
    "EXCLU-ALSACE-MOSELLE": "Code leve par T-077 (Alsace-Moselle ouverte, regles R0 a R4) ; garde pour l'historique.",
    "EXCLU-HORS-METROPOLE": "Outre-mer hors Mayotte : exclu (T-077 n'ouvre que Mayotte).",
    "A77-FERIE-LOCAL": "Ferie local (26 decembre, Vendredi saint en Alsace-Moselle ; 27 avril a Mayotte) non travaille un jour prevu : ferie de l'art. 47.2 (lecture A) ou jour ordinaire (lecture B), question DDETS (T-077, R3.1). Jour a confirmer, ni paye ni retenu.",
    "A77-FERIE-LOCAL-TRAVAILLE": "Ferie local travaille : majoration de 10 % (lecture A, CCN 47.2) ou aucune (lecture B), question DDETS (T-077, R3.2).",
    "A77-FERIE-VOISIN": "Ferie national dont le jour de travail voisin est un ferie local : condition de l'art. 47.2 differente selon la lecture (T-077, R3.3).",
    "A77-DECOMPTE-CP": "Conge paye qui contient un ferie local : decompte des jours ouvrables different d'un jour selon la lecture (T-077, R3.4).",
    "A77-MAINTIEN-LOCAL": "Alsace-Moselle, maladie de l'AM ou enfant de l'AM malade : maintien du droit local moins les IJ (C. trav. L1226-23, lecture A) ou retenue (CCN annexe 3 art. 3.1, lecture B), question DDETS (T-077, R4).",
    "A77-TITRE-MAYOTTE": "Majoration de 4 % du titre AM-AP a Mayotte : l'Urssaf l'ecarte (« Non concerne »), aucun texte lu ne l'ecarte (T-077, R2).",
    "REPERE-NET-ABSENT": "Aucun repere net Urssaf du minimum avant le 01/01/2025 (T-077, R2).",
    "EXCLU-OCCASIONNEL": "Accueil occasionnel exclu de la version 0.",
    "EXCLU-ALTERNEES": "Semaines alternees exclues de la version 0.",
    "EXCLU-MATERNITE": "Maternite, paternite, adoption et conges de naissance exclus de la version 0.",
    "EXCLU-AT": "Accident du travail, maladie professionnelle, accident de trajet exclus de la version 0.",
    "EXCLU-INAPTITUDE": "Inaptitude exclue de la version 0.",
    "EXCLU-RETRAITE": "Depart a la retraite exclu (indemnite versee par l'Ircem).",
    "EXCLU-DECES-PARTIE": "Deces de l'employeur ou de l'AM exclu de la version 0.",
    "EXCLU-CDD-ANTICIPE": "Rupture anticipee du CDD exclue de la version 0.",
    "EXCLU-SAISONNIER": "CDD saisonnier ou d'usage : disposition conventionnelle plus favorable non verifiee.",
    # T-076 (planning variable, CDD) : regles/t076-planning-variable.md, regles/t076-cdd.md, regles/t076-decisions-direction.md.
    "PV-SEMAINE-SANS-PLANNING": "Planning variable : semaine sans planning saisi ; le mois n'est pas calcule (CCN 111 et 48.1.1.3 renvoient au planning, P-PV-4). Saisir le planning de cette semaine.",
    "PV-SEMAINE-PREVUE-PLUS-45H": "Planning variable : semaine prevue au-dela de 45 h ; place de la majoration des heures prevues non tranchee (P-PV-3, A-13), passage 2.",
    "PV-C2-DROIT-NON-PRIS": "Planning variable : lecture C2 du maintien (heures prevues des jours de conge) inconnue tant que le droit n'est pas pris en entier (P-PV-5).",
    "P-PV-5": "Planning variable : base du maintien des CP (C1 moyenne de la periode, C2 heures des jours de conge) ; les deux lectures different ici.",
    "CDD-FIN-NON-GEREE": "Fin de CDD non geree (force majeure, inaptitude, jeune en vacances, saisonnier ou d'usage) : R-CDD-08, R-CDD-13.",
    "PV-L2-ABSENCE-HC": "Planning variable, base L2 : absence deduite dans une semaine prevue au-dela de la base ; combinaison de la deduction de l'art. 111 et de la perte des HC non ecrite (D2, passage 2).",
    "CDD-PASSAGE-2": "CDD a planning variable avec semaines sans accueil, ou CDD de moins d'un mois avec semaines sans accueil : passage 2 (D3).",
    "CDD-DATE-FIN": "Fin anticipee de CDD a la date du terme ou apres : au terme, choisis Terme (D9).",
    "CDD-DEVENU-CDI": "Travail apres le terme du CDD sans CDI signe : le contrat devient un CDI (C. trav. L1243-11, D9).",
    "CDD-ESSAI-DEPASSE": "Fin pendant la periode d'essai apres la duree maximale d'essai du CDD (C. trav. L1242-10, D19).",
    "CDD-ESSAI-LIMITE": "Fin d'essai du CDD entre les deux lectures de la duree maximale (semaines entieres ou entamees, L1242-10, D19).",
    "CDD-PLANCHER-L1242-16": "CDD avec CP payes pendant le contrat : plancher de C. trav. L1242-16 (dixieme de toute la duree du contrat) non applique tel quel.",
}


def resultat_ok(regles, resultat, provisoire=False, notes=None):
    """Resultat valide. Statut « provisoire » si un bareme utilise est date
    apres DATE_DERNIERE_VERIFICATION."""
    sortie = {
        "statut": "provisoire" if provisoire else "ok",
        "regles": list(regles),
        "resultat": resultat,
    }
    if provisoire:
        sortie["avertissement"] = (
            "Resultat provisoire : bareme non verifie apres le "
            + DATE_DERNIERE_VERIFICATION.strftime("%d/%m/%Y")
            + "."
        )
    if notes:
        sortie["notes"] = list(notes)
    return sortie


def resultat_non_gere(exc, regles_fonction):
    regles = list(regles_fonction)
    for r in exc.regles:
        if r not in regles:
            regles.append(r)
    sortie = {
        "statut": "non_gere",
        "code": exc.code,
        "regles": regles,
        "motif": CODES.get(exc.code, exc.code),
        "quoi_faire": QUOI_FAIRE_DEFAUT,
    }
    if exc.precision:
        sortie["precision"] = exc.precision
    if exc.details:
        sortie["details"] = exc.details
    return sortie


def resultat_erreur(exc, regles_fonction):
    return {
        "statut": "erreur_saisie",
        "regles": list(regles_fonction) + [r for r in exc.regles if r not in regles_fonction],
        "message": exc.message,
    }


def api(*regles):
    """Decorateur des fonctions publiques : convertit les refus et erreurs en
    dictionnaires de sortie. Les fonctions decorees renvoient deja un dict."""

    def deco(f):
        @functools.wraps(f)
        def enveloppe(*args, **kwargs):
            _PILE_ARRONDIS.append([])
            try:
                sortie = f(*args, **kwargs)
            except NonGere as e:
                return resultat_non_gere(e, regles)
            except ErreurSaisie as e:
                return resultat_erreur(e, regles)
            finally:
                arrondis = _PILE_ARRONDIS.pop()
                if _PILE_ARRONDIS:
                    _PILE_ARRONDIS[-1].extend(arrondis)
            if arrondis and isinstance(sortie, dict) and sortie.get("statut") in ("ok", "provisoire"):
                sortie.setdefault("details", {})["arrondis_arr01"] = arrondis
            return sortie

        enveloppe.regles = list(regles)
        enveloppe.interne = f
        return enveloppe

    return deco


def exact(valeur, nom):
    """Convertit une entree en Fraction exacte. Refuse les float et bool.
    Accepte int, Fraction, ou une chaine decimale ecrite ("12.5", "40/3")."""
    if isinstance(valeur, bool) or valeur is None:
        raise ErreurSaisie(f"{nom} : valeur manquante ou invalide.")
    if isinstance(valeur, float):
        raise ErreurSaisie(f"{nom} : nombre a virgule flottante refuse (utiliser un entier ou une chaine exacte).")
    if isinstance(valeur, (int, Fraction)):
        return Fraction(valeur)
    if isinstance(valeur, str):
        try:
            return Fraction(valeur.replace(",", "."))
        except (ValueError, ZeroDivisionError):
            raise ErreurSaisie(f"{nom} : chaine non numerique « {valeur} ».")
    raise ErreurSaisie(f"{nom} : type non accepte ({type(valeur).__name__}).")


def entier(valeur, nom, minimum=0):
    if isinstance(valeur, bool) or not isinstance(valeur, int):
        raise ErreurSaisie(f"{nom} : un entier est attendu.")
    if valeur < minimum:
        raise ErreurSaisie(f"{nom} : doit etre superieur ou egal a {minimum}.")
    return valeur


def positif(valeur, nom):
    v = exact(valeur, nom)
    if v < 0:
        raise ErreurSaisie(f"{nom} : doit etre positif ou nul.")
    return v


# T-040d (MB5) : decision ARR-01 du DG du 18/11/2026 (03-JOURNAL.md, l. 117 : « arrondi
# au centime : arrondi au plus proche garde, avec une phrase [...] jusqu'a la reponse de
# la DDETS » ; l. 164 : etendue a l'arrondi jour par jour des km). Tout montant exact non
# entier en centimes est arrondi au centime le plus proche (demi-centime : vers le haut
# en valeur absolue). Chaque arrondi est trace dans la sortie (cle details.arrondis_arr01)
# avec la valeur exacte non arrondie. Les arrondis d'heures ou de jours (A-03) ne sont
# pas concernes : ils ne passent pas par cette fonction.
MENTION_ARR01 = ("arrondi au centime le plus proche, decision ARR-01 du DG du 18/11/2026 "
                 "dans l'attente de la DDETS")
_PILE_ARRONDIS = []


def arrondi_arr01(m):
    """Centime le plus proche ; demi-centime arrondi en s'eloignant de zero."""
    m = Fraction(m)
    a = abs(m)
    r = a.numerator * 2 + a.denominator
    v = r // (2 * a.denominator)
    return v if m >= 0 else -v


def vers_centimes(montant_exact, quoi, regles=()):
    """Montant exact (Fraction, en centimes) vers entier. Montant non entier :
    centime le plus proche (decision ARR-01, T-040d), trace dans la sortie."""
    m = Fraction(montant_exact)
    if m.denominator != 1:
        v = arrondi_arr01(m)
        if _PILE_ARRONDIS:
            _PILE_ARRONDIS[-1].append({
                "element": quoi,
                "valeur_exacte_centimes": str(m),
                "arrondi_centimes": v,
                "mention": MENTION_ARR01,
            })
        return v
    return int(m)


def texte_fraction(f):
    f = Fraction(f)
    return str(f.numerator) if f.denominator == 1 else f"{f.numerator}/{f.denominator}"


def verifier_date_ccn(d, regles=()):
    """La CCN IDCC 3239 s'applique a partir du 1er janvier 2022 (regles-v0)."""
    if d is None:
        return
    if not isinstance(d, date):
        raise ErreurSaisie("date : un objet datetime.date est attendu.")
    if d < DATE_APPLICATION_CCN:
        raise NonGere("HORS-CCN", regles, precision=f"Date {d.isoformat()}.")


def type_annee_valide(type_annee):
    if type_annee not in ("complete", "incomplete"):
        raise ErreurSaisie("type_annee : « complete » (52 semaines) ou « incomplete » (46 semaines ou moins).")
    return type_annee
