/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.34',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN GLOBAL AUDIT LOG',
  stage: 'GLOBAL ADMIN AUDIT LOG VIEW',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.34 - GLOBAL ADMIN AUDIT LOG VIEW'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
