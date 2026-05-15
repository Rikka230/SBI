/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.147',
  branch: 'private-admin-accounts-mail-workflow',
  channel: 'ADMIN MAIL WORKFLOW P2G.1',
  stage: 'PRIVATE P2G.1 PUBLIC FORMATION COMPLIANCE BLOCKS',
  updatedAt: '2026-05-15',
  label: 'SBI 8.0P.147 - PRIVATE P2G.1 PUBLIC FORMATION COMPLIANCE BLOCKS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
