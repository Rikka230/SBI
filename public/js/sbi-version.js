/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.89',
  branch: 'main',
  channel: 'P2I.5-B PROMOTION CURRICULUM LINK',
  stage: 'PROMOTION CURRICULUM COURSE PLAN BASELINE',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.89 - PROMOTION CURRICULUM LINK'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
