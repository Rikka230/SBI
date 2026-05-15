/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.157',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-A.2',
  stage: 'PRIVATE P2H.2-A.2 RESTORE ACCOUNTS COUNTERS',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.157 - PRIVATE P2H.2-A.2 RESTORE ACCOUNTS COUNTERS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
