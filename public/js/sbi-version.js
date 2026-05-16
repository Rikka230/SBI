/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.16',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW DECOR FIX',
  stage: 'FULL WIDTH MAIN DECOR FIX',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.16 - FULL WIDTH MAIN DECOR FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
