/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.20',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW SAFE ROLLBACK',
  stage: 'ROLLBACK FROM REJECTED RICH GRID',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.20 - ROLLBACK FROM REJECTED RICH GRID'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
