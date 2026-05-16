/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.30',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW EMAIL QUALITY UX',
  stage: 'ACCOUNT LIST HEIGHT FIX CSS ONLY',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.30 - ACCOUNT LIST HEIGHT FIX CSS ONLY'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
