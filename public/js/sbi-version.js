/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.150',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2G.4',
  stage: 'PRIVATE P2G.4 PUBLIC COMPLIANCE RENDER FIX',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.150 - PRIVATE P2G.4 PUBLIC COMPLIANCE RENDER FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
