/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.5',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW FULL DECOR SINGLE SCROLL',
  stage: 'FULL ADMIN DECOR ON SINGLE SCROLL',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.167.5 - FULL ADMIN DECOR SINGLE SCROLL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
