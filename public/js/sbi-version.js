/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.47',
  branch: 'main',
  channel: 'PROFILE PJAX CLASS FIX',
  stage: 'KEEP PROFILE PAGE CLASS ADMIN ONLY',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.47 - KEEP PROFILE PAGE CLASS ADMIN ONLY'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
