/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.158',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-B',
  stage: 'PRIVATE P2H.2-B ACCOUNT STATUS FIELDS',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.158 - PRIVATE P2H.2-B ACCOUNT STATUS FIELDS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
