/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.133',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2A',
  stage: 'PRIVATE P2A.2 PASSWORD RESET LINK DOMAIN FIX',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.133 - PRIVATE P2A.2 PASSWORD RESET LINK DOMAIN FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
