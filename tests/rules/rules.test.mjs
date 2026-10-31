// Matrice des règles de sécurité Firestore (audit C-040), exécutée sur l'émulateur :
//   npx firebase emulators:exec --only firestore --project demo-arvela "node tests/rules/rules.test.mjs"
// Chaque cas dit ce qui doit être accepté ou refusé. Le script s'arrête en erreur au premier écart.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, collectionGroup, query, serverTimestamp, Timestamp,
} from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-arvela',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
});

const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const anon = env.unauthenticatedContext().firestore();
const bon = (k = 'c1') => ({ s: 'contracts', k, v: '{"child":"Léo"}', t: serverTimestamp(), d: 'appareil-1' });

// Une donnée existante d'Alice, posée hors règles
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'users/alice/data/contracts~c0'), { s: 'contracts', k: 'c0', v: 'x', t: Timestamp.now() });
  await setDoc(doc(ctx.firestore(), 'users/alice'), { cree: true });
});

const cas = [
  ['1. Alice lit sa donnée', () => assertSucceeds(getDoc(doc(alice, 'users/alice/data/contracts~c0')))],
  ['2. Alice liste sa collection', () => assertSucceeds(getDocs(collection(alice, 'users/alice/data')))],
  ['3. Alice crée un document valide', () => assertSucceeds(setDoc(doc(alice, 'users/alice/data/contracts~c1'), bon()))],
  ['4. Alice met à jour un document valide', () => assertSucceeds(setDoc(doc(alice, 'users/alice/data/contracts~c1'), bon()))],
  ['5. Alice supprime sa donnée', () => assertSucceeds(deleteDoc(doc(alice, 'users/alice/data/contracts~c1')))],
  ['6. Alice écrit sans le champ d (facultatif)', () => assertSucceeds(setDoc(doc(alice, 'users/alice/data/kv~settings'), { s: 'kv', k: 'settings', v: null, t: serverTimestamp() }))],
  ['7. Anonyme lit : refusé', () => assertFails(getDoc(doc(anon, 'users/alice/data/contracts~c0')))],
  ['8. Anonyme écrit : refusé', () => assertFails(setDoc(doc(anon, 'users/alice/data/contracts~c9'), bon('c9')))],
  ['9. Anonyme liste : refusé', () => assertFails(getDocs(collection(anon, 'users/alice/data')))],
  ['10. Bob lit la donnée d’Alice : refusé', () => assertFails(getDoc(doc(bob, 'users/alice/data/contracts~c0')))],
  ['11. Bob liste la collection d’Alice : refusé', () => assertFails(getDocs(collection(bob, 'users/alice/data')))],
  ['12. Bob écrit chez Alice : refusé', () => assertFails(setDoc(doc(bob, 'users/alice/data/contracts~c9'), bon('c9')))],
  ['13. Bob met à jour chez Alice : refusé', () => assertFails(updateDoc(doc(bob, 'users/alice/data/contracts~c0'), { v: 'pirate', t: serverTimestamp() }))],
  ['14. Bob supprime chez Alice : refusé', () => assertFails(deleteDoc(doc(bob, 'users/alice/data/contracts~c0')))],
  ['15. Lecture du document users/alice lui-même : refusée', () => assertFails(getDoc(doc(alice, 'users/alice')))],
  ['16. Liste de la collection users : refusée', () => assertFails(getDocs(collection(alice, 'users')))],
  ['17. Requête de groupe de collections data : refusée', () => assertFails(getDocs(query(collectionGroup(alice, 'data'))))],
  ['18. Champ en trop : refusé', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~c2'), { ...bon('c2'), x: 1 }))],
  ['19. Champ s manquant : refusé', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~c2'), { k: 'c2', v: 'x', t: serverTimestamp() }))],
  ['20. Magasin inconnu (usage) : refusé', () => assertFails(setDoc(doc(alice, 'users/alice/data/usage~u1'), { ...bon('u1'), s: 'usage' }))],
  ['21. Clé vide : refusée', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~vide'), { ...bon(''), k: '' }))],
  ['22. Clé de 301 caractères : refusée', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~long'), { ...bon('x'.repeat(301)) }))],
  ['23. Valeur de 500 001 caractères : refusée', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~gros'), { ...bon('gros'), v: 'x'.repeat(500001) }))],
  ['24. Valeur non texte : refusée', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~num'), { ...bon('num'), v: 42 }))],
  ['25. Horodatage antidaté : refusé', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~c3'), { ...bon('c3'), t: Timestamp.fromDate(new Date('2020-01-01')) }))],
  ['26. Identifiant d’appareil de 65 caractères : refusé', () => assertFails(setDoc(doc(alice, 'users/alice/data/contracts~c4'), { ...bon('c4'), d: 'x'.repeat(65) }))],
  ['27. Écriture ailleurs que sous users/{uid}/data : refusée', () => assertFails(setDoc(doc(alice, 'autre/alice'), { a: 1 }))],
];

let ok = 0;
for (const [nom, f] of cas) {
  try {
    await f();
    ok++;
    console.log(`OK   ${nom}`);
  } catch (e) {
    console.log(`ÉCHEC ${nom} : ${e?.message ?? e}`);
  }
}
await env.cleanup();
console.log(`\n${ok} cas sur ${cas.length} conformes.`);
process.exit(ok === cas.length ? 0 : 1);
