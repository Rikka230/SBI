/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.91',
  branch: 'main',
  channel: 'P2I.5-C PROMOTION PLANNING OVERLAY V1',
  stage: 'PROMOTIONS PEDAGOGICAL PLANNING OVERLAY V1',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.91 - PROMOTION PLANNING OVERLAY V1'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
