/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.36',
  branch: 'main',
  channel: 'ADMIN GLOBAL AUDIT LOG',
  stage: 'AUDIT LOG PROFILE RESOLUTION AND PERFORMANCE',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.36 - AUDIT LOG PROFILE RESOLUTION AND PERFORMANCE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
