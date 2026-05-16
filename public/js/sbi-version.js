/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.0',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-E.4 INDEX BOOT',
  stage: 'PRIVATE ADMIN INDEX BOOT FROM COMPONENTS',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.167.0 - ADMIN INDEX BOOT FROM COMPONENTS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
