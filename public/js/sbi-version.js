/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.132',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2A',
  stage: 'PRIVATE P2A.1 ADMIN FUNCTIONS REGION FIX',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.132 - PRIVATE P2A.1 ADMIN FUNCTIONS REGION FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
