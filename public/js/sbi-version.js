/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.41',
  branch: 'main',
  channel: 'ADMIN GLOBAL AUDIT LOG',
  stage: 'DEDICATED AUDIT LOG PJAX ROUTE',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.41 - DEDICATED AUDIT LOG PJAX ROUTE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
