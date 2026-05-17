/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.37',
  branch: 'main',
  channel: 'ADMIN GLOBAL AUDIT LOG',
  stage: 'AUDIT LOG LONG CACHE AND FAST PROFILE OPEN',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.37 - AUDIT LOG LONG CACHE AND FAST PROFILE OPEN'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
