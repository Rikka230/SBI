/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.181',
  branch: 'main',
  channel: 'DEPOT MEMORY CLEANUP',
  stage: 'REMOVE OBSOLETE PATCH AND PREVIEW ARTIFACTS',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.181 - Depot and memory cleanup'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
