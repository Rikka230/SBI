/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.38',
  branch: 'main',
  channel: 'ADMIN GLOBAL AUDIT LOG',
  stage: 'MANUAL AUDIT LOG LOAD WITH LONG CACHE',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.38 - MANUAL AUDIT LOG LOAD WITH LONG CACHE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
