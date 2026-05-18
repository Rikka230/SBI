/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.95',
  branch: 'main',
  channel: 'P2I.5-E CURRICULUM TEMPLATES V1',
  stage: 'PROMOTION PLANNING REUSABLE CURRICULUM TEMPLATES',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.95 - CURRICULUM TEMPLATES V1'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
