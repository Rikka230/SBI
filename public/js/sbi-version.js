/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.152',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2G.6',
  stage: 'PRIVATE P2G.6 PUBLIC QUALITY ACCORDION',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.152 - PRIVATE P2G.6 PUBLIC QUALITY ACCORDION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
