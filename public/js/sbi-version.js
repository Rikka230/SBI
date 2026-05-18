/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.77',
  branch: 'main',
  channel: 'P2I.4 AUDIT REMOTE SEARCH',
  stage: 'ADMIN AUDIT GLOBAL SEARCH',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.77 - ADMIN AUDIT REMOTE SEARCH'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
