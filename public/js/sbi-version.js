/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.96.1',
  branch: 'main',
  channel: 'P2I.5-F.1 CURRICULUM TEMPLATE SAVE UX',
  stage: 'PROMOTION PLANNING SHARED COURSES SOURCE DISPLAY CONTEXT',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.96.1 - CURRICULUM TEMPLATE SAVE UX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
