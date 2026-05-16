/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.6',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW ROLLBACK DECOR',
  stage: 'ROLLBACK FULL DECOR TO SINGLE SCROLL STABLE',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.167.6 - ROLLBACK DECOR TO SINGLE SCROLL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
