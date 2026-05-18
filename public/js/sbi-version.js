/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.93',
  branch: 'main',
  channel: 'P2I.5-D PROMOTION PLANNING PLACEHOLDERS',
  stage: 'PROMOTION PLANNING PLACEHOLDER COURSES AND PEDAGOGICAL BUFFERS',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.93 - PROMOTION PLANNING PLACEHOLDERS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
