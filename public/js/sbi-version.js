/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.135',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2C',
  stage: 'PRIVATE P2C ADMIN EMAIL CHANGE WORKFLOW',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.135 - PRIVATE P2C ADMIN EMAIL CHANGE WORKFLOW'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
