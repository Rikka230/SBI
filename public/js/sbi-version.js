/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.166.1',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-E.2 ROLLBACK ALERTS',
  stage: 'PRIVATE ROLLBACK 8.0P.166 ADMIN ALERTS FREEZE',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.166.1 - ROLLBACK ADMIN ALERTS FREEZE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
