/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.134',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2B',
  stage: 'PRIVATE P2B ADMIN UPDATE USER WORKFLOW',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.134 - PRIVATE P2B ADMIN UPDATE USER WORKFLOW'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
