"""Calendrier : jours feries (R-JF-01), mois civils, calcul en mois.

Le calcul de la date de Paques est un calcul astronomique et calendaire
(algorithme de Meeus, calendrier gregorien), pas une regle de paie.
"""

from datetime import date, timedelta
import calendar

from .commun import NonGere, ErreurSaisie


def paques(annee):
    """Dimanche de Paques, calendrier gregorien (algorithme de Meeus/Jones/Butcher)."""
    a = annee % 19
    b, c = divmod(annee, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mois = (h + l - 7 * m + 114) // 31
    jour = ((h + l - 7 * m + 114) % 31) + 1
    return date(annee, mois, jour)


def jours_feries(annee, region="metropole"):
    """R-JF-01 : jours feries ordinaires (CCN art. 47.2, Code du travail L3133-1). Renvoie {date: nom}.
    T-103 (R1, A1) : Alsace-Moselle : memes jours qu'en metropole ; le Vendredi saint et le 26 decembre (L3134-13)
    ne sont pas des feries de l'AM (L3134-1, al. 2 : le chapitre ne s'applique pas « a l'education des enfants »
    ni « aux emplois a domicile par une personne physique » ; CASF L423-2 ne le rend pas applicable).
    T-103 (R4, A2) : Mayotte : le 27 avril s'ajoute (C. trav. L3422-2, 1° : « sont des jours feries » ; CCN 47.2)."""
    p = paques(annee)
    out = {
        date(annee, 1, 1): "1er janvier",
        p + timedelta(days=1): "lundi de Paques",
        date(annee, 5, 1): "1er mai",
        date(annee, 5, 8): "8 mai",
        p + timedelta(days=39): "Ascension",
        p + timedelta(days=50): "lundi de Pentecote",
        date(annee, 7, 14): "14 juillet",
        date(annee, 8, 15): "Assomption",
        date(annee, 11, 1): "Toussaint",
        date(annee, 11, 11): "11 novembre",
        date(annee, 12, 25): "Noel",
    }
    if region == "mayotte":
        out[date(annee, 4, 27)] = "27 avril (abolition de l'esclavage, L3422-2)"
    return out


def est_ferie(d):
    return d in jours_feries(d.year)


def est_lundi_pentecote(d):
    return d == paques(d.year) + timedelta(days=50)


def jours_du_mois(annee, mois):
    n = calendar.monthrange(annee, mois)[1]
    return [date(annee, mois, j) for j in range(1, n + 1)]


def ajouter_mois(d, n):
    """Ajoute n mois en gardant le quantieme. Refus DATE-MOIS si le jour est
    apres le 28 (methode non ecrite pour les fins de mois)."""
    if not isinstance(d, date):
        raise ErreurSaisie("date attendue")
    if d.day > 28:
        raise NonGere("DATE-MOIS", precision=f"Date de depart {d.isoformat()}.")
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, d.day)


def anciennete_atteinte(debut, reference, nb_mois, regles=()):
    """Vrai si au moins nb_mois mois se sont ecoules entre debut et reference.
    Refus LIMITE-ANCIENNETE si la reference tombe le jour du seuil ou la veille
    (comptage inclusif ou exclusif non ecrit)."""
    seuil = ajouter_mois(debut, nb_mois)
    if reference in (seuil, seuil - timedelta(days=1)):
        raise NonGere("LIMITE-ANCIENNETE", list(regles),
                      precision=f"Seuil de {nb_mois} mois atteint le {seuil.isoformat()}, reference {reference.isoformat()}.")
    return reference > seuil
