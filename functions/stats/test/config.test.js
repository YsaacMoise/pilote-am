// T-127 : réglages de la fonction planifiée tels que l'outil Firebase les lira au déploiement, et envoi à PostHog (faux réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.GCLOUD_PROJECT ??= 'demo-arvela';
const { statsNuit } = await import('../index.js');
const { envoyer, POSTHOG_URL } = await import('../collecte.js');

test('planification : 5 h chaque nuit, heure de Paris, région de Paris, compte de service dédié, sans nouvel essai', () => {
  const e = statsNuit.__endpoint;
  assert.deepEqual(e.region, ['europe-west9']);
  assert.equal(e.scheduleTrigger.schedule, '0 5 * * *');
  assert.equal(e.scheduleTrigger.timeZone, 'Europe/Paris');
  assert.equal(e.scheduleTrigger.retryConfig.retryCount, 0);
  assert.equal(e.serviceAccountEmail, 'arvela-stats@');
  assert.equal(e.maxInstances, 1);
  assert.equal(e.platform, 'gcfv2');
});

test('base de code « stats » dans firebase.json, Node 22, et ignorée par la base « sequestre »', () => {
  const cfg = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8'));
  const stats = cfg.functions.find((f) => f.codebase === 'stats');
  const seq = cfg.functions.find((f) => f.codebase === 'sequestre');
  assert.deepEqual(stats, { source: 'functions/stats', codebase: 'stats', runtime: 'nodejs22', ignore: ['node_modules', '.git', 'test'] });
  assert.equal(seq.source, 'functions');
  assert.ok(seq.ignore.includes('stats') && seq.ignore.includes('node_modules') && seq.ignore.includes('.git'));
  // Node 20 est retiré par Google depuis le 30/10/2026 : plus aucun déploiement possible.
  for (const f of cfg.functions) assert.notEqual(f.runtime, 'nodejs20');
});

test('envoi : une seule requête vers PostHog UE, corps = l’événement ; une erreur arrête la fonction', async () => {
  const appels = [];
  const e = { api_key: 'phc_test', event: 'stats_jour', distinct_id: 'arvela-serveur', properties: { inscrites_total: 1 }, timestamp: 'x' };
  await envoyer(e, async (url, opts) => { appels.push({ url, opts }); return { ok: true, status: 200 }; });
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, POSTHOG_URL);
  assert.equal(POSTHOG_URL, 'https://eu.i.posthog.com/i/v0/e/');
  assert.equal(appels[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(appels[0].opts.body), e);
  await assert.rejects(envoyer(e, async () => ({ ok: false, status: 401 })), /401/);
});
