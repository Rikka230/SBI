/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.92',
  branch: 'main',
  channel: 'P2I.5-C PROMOTION PLANNING OVERLAY FIX',
  stage: 'PROMOTION PLANNING OVERLAY LAYER VIEWPORT FIX',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.92 - PROMOTION PLANNING OVERLAY FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
