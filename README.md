# Pilote AM

Site installé sur l'écran d'accueil de l'iPhone d'une assistante maternelle : pointage par exception,
carnet de liaison, récapitulatif Pajemploi par enfant, contrôle du bulletin, congés payés, fin de
contrat, abattement fiscal. Aucune donnée ne quitte le téléphone (IndexedDB), pas de compte.

## Commandes

- `npm ci` puis `node build.mjs` : construit le site dans `dist/`.
- `bun test tests` : moteur de paie et lecture des bulletins.
- `npx tsc --noEmit -p .` : vérification des types.
- `python3 tests/e2e/shots.py` : parcours complet et captures (390×844, clair et sombre).
- `python3 tests/e2e/axe.py` : audit d'accessibilité (après `npm install --no-save axe-core`).

## Publication

GitHub Pages via `.github/workflows/pages.yml` (Réglages du dépôt › Pages › Source : GitHub Actions).
Tout hébergement statique en HTTPS convient : il suffit de servir le dossier `dist/`.

## Taux

Les taux réglementaires sont datés dans `src/engine/rates.ts` : une revalorisation = une ligne de plus.
