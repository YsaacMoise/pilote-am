// T-127 (demande du DG du 26/11/2026) : totaux exacts d'Arvela, comptés chaque nuit à 5 h (heure de Paris) dans Firebase et
// envoyés en un seul événement anonyme `stats_jour` à PostHog (projet 326660, serveurs de l'Union européenne).
// Non déployée par la session : le DG la met en service (docs/stats.md), dans la même séance que la copie scellée (T-125).
//
// Lecture seule : le compte de service de la fonction n'a que des droits de lecture (docs/stats.md, étape « Droits »).
// Le nombre de comptes ne dépend jamais de la mesure d'usage : il vient de Firebase Authentication.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { collecter, envoyer } from './collecte.js';
import { evenement, listeExclus, VERSION } from './calcul.js';

/** Clé publique du projet PostHog (la même que l'app, src/analytics.ts) : elle permet seulement d'envoyer des événements. */
const CLE_POSTHOG = 'phc_o2YzAa4ztXQV3DNa9RQaEiiDZJWBjNY3TsJWEGpYThhD';

/** Comptes de test à ne pas compter : identifiants (uid) séparés par des virgules. Vide au départ. */
const COMPTES_EXCLUS = defineString('STATS_COMPTES_EXCLUS', {
  default: '',
  description: 'Identifiants (uid) des comptes de test à ne pas compter, séparés par des virgules. Laisser vide s’il n’y en a pas.',
});

initializeApp();

export const statsNuit = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'Europe/Paris',
    region: 'europe-west9',
    // Compte de service dédié, en lecture seule (créé par le DG : docs/stats.md).
    serviceAccount: 'arvela-stats@',
    memory: '256MiB',
    timeoutSeconds: 900,
    maxInstances: 1,
    // Pas de nouvel essai automatique : un échec ne doit jamais produire deux événements pour une même nuit.
    retryCount: 0,
  },
  async () => {
    const maintenant = Date.now();
    const totaux = await collecter({ auth: getAuth(), db: getFirestore(), maintenant, exclus: listeExclus(COMPTES_EXCLUS.value()) });
    const e = evenement(totaux, CLE_POSTHOG, maintenant);
    await envoyer(e);
    // Totaux seulement dans le journal (aucun identifiant).
    logger.info('stats_jour envoyé', { version: VERSION, ...e.properties });
  },
);
