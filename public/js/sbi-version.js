/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.35',
  branch: 'main',
  channel: 'ADMIN GLOBAL AUDIT LOG',
  stage: 'AUDIT LOG FILTER UI AND PROFILE NAV FIX',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.35 - AUDIT LOG FILTER UI AND PROFILE NAV FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
