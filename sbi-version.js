/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.143',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2F.1',
  stage: 'PRIVATE P2F.1 STORAGE COURSE MEDIA ACCESS',
  updatedAt: '2026-05-13',
  label: 'SBI 8.0P.143 - PRIVATE P2F.1 STORAGE COURSE MEDIA ACCESS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
