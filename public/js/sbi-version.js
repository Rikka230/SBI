/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.137',
  branch: 'main',
  channel: 'P2I.24 LIBRARY UX REBUILD',
  stage: 'COURSE LIBRARIES WITH PROMOTION PLANNING DATES AND PRIORITIES',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.137 - Course libraries promotion planning dates and priorities'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
