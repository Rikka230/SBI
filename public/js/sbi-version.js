/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.18',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW EMERGENCY ROLLBACK',
  stage: 'CACHE-BUST ROLLBACK TO SAFE ADMIN DISPLAY',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.18 - CACHE-BUST ROLLBACK TO SAFE ADMIN DISPLAY'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
