/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.159',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-B.1',
  stage: 'PRIVATE P2H.2-B.1 ACCOUNT STATUS DISPLAY FIX',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.159 - PRIVATE P2H.2-B.1 ACCOUNT STATUS DISPLAY FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
