/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.19',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW DECOR FIX',
  stage: 'RICH ADMIN INDEX BACKGROUND SINGLE SCROLL',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.19 - RICH ADMIN INDEX BACKGROUND SINGLE SCROLL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
