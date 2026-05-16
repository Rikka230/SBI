/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.4',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW SINGLE SCROLL FIX',
  stage: 'ADMIN DOUBLE SCROLL FIX',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.167.4 - ADMIN DOUBLE SCROLL FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
