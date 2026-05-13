/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.141',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2E.3',
  stage: 'PRIVATE P2E.3 SERVER FORMATION INDEX SYNC',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.141 - PRIVATE P2E.3 SERVER FORMATION INDEX SYNC'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
