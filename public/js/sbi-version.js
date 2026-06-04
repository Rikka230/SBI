/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.312',
  branch: 'refonte-mobile-308-311',
  channel: 'Fix mobile : panneau « info / site en construction » post-connexion validable (cache-bust tracker.js)',
  stage: 'Correctif QA : sur mobile, le panneau d\'information post-connexion (« site en construction », et le gate de première connexion) était trop haut et son bouton de validation passait sous le pli → impossible de valider. Le correctif responsive (carte scrollable + barre d\'action collante) existait déjà dans tracker.js depuis .116/.117 mais n\'était jamais servi aux navigateurs : les 32 pages chargeaient encore tracker.js avec d\'anciens ?v (44 / 97-GPT2.x / 116), donc le cache servait l\'ancien fichier sans le fix. Bump du cache-bust tracker.js?v=8.0P.167.312 sur les 32 pages → le fix se charge enfin.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.312 - Fix mobile : panneau info post-connexion validable (cache-bust tracker.js sur 32 pages)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
