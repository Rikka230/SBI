/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.166.5',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2H.2-E.3 PANEL REAL FIX',
  stage: 'PRIVATE REAL ADMIN RIGHT PANEL FIX',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.166.5 - REAL ADMIN RIGHT PANEL FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
