"""Moteur B du Calculateur Arvela (tache T-007) : second moteur de paie,
ecrit a partir de regles/regles-v0.md corrige par
regles/contre-verification-v0.md, sans lecture du moteur actuel.
Python 3, bibliotheque standard. Montants en centimes entiers."""

from .commun import DATE_DERNIERE_VERIFICATION, CODES
from .baremes import baremes_du_jour, minimum_horaire_brut, verifier_taux_horaire
from .mensualisation import (type_annee, semaines_programmees, mensualisation, heures_mensualisees,
                             verifier_date_effet_avenant)
from .heures import temps_de_travail_jour, heures_en_plus_semaine, salaire_du_mois
from .absences import (qualifier_absence, absence_enfant_malade, deduction_absence, prevu_du_mois,
                       ferie_chome, ferie_travaille, ferie_local_travaille)
from .conges import (acquisition_cp, jours_enfants_a_charge, jours_fractionnement, decompte_jours_cp,
                     indemnite_cp, complement_cp_annee_complete, paiement_cp_annee_incomplete,
                     indemnite_cp_prise_partielle, conges_apres_changement_type)
from .indemnites import (minimum_entretien_journalier, verifier_entretien_journalier, indemnite_entretien_mois,
                         indemnite_repas_mois, indemnite_kilometrique, indemnite_kilometrique_mois,
                         duree_travail_art99)
from .fin_contrat import (duree_preavis, indemnite_compensatrice_preavis, indemnite_preavis_dispense,
                          regularisation_finale_preavis_dispense, jours_a_indemniser, iccp,
                          indemnite_rupture, indemnite_rupture_bulletins, dates_fin_preavis_possibles,
                          date_fin_preavis, periode_indemnite_deces,
                          regularisation_annuelle, regularisation_finale,
                          indemnite_precarite_cdd, solde_de_tout_compte)
from .evenements import EVENEMENTS, conge_evenement_familial, jours_conge_evenement
from .perimetre import verifier_perimetre, convertir_brut_net
from .regions import REGIONS, brut_depuis_net, repere_net_minimum, feries_locaux, region_du_departement
from .planning_variable import (semaine_prevue, mensualisation_planning_variable,
                                heures_en_plus_semaine_planning_variable, mois_de_rattachement_semaine,
                                prevu_du_mois_planning_variable, ferie_chome_planning_variable,
                                decompte_jours_cp_planning_variable, indemnite_cp_planning_variable,
                                complement_cp_planning_variable, iccp_planning_variable)
from .cdd import (FINS_CDD, FINS_NON_GEREES, mensualisation_cdd, cdd_moins_d_un_mois,
                  salaire_mois_cdd_moins_d_un_mois, qualifier_semaine_sans_accueil_cdd, deux_lectures_cdd,
                  assiette_ifc, ifc_due, indemnite_fin_cdd, iccp_cdd, preavis_et_rupture_cdd,
                  solde_fin_cdd, controle_dates_cdd, verifier_cas_cdd, controle_essai_cdd)
