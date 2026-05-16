/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.166.9',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-E.4 INIT FIX',
  stage: 'PRIVATE ADMIN INIT AFTER PROFILE REFRESH',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.166.9 - ADMIN INIT AFTER PROFILE REFRESH'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
