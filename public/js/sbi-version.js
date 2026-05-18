/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.93.1',
  branch: 'main',
  channel: 'P2I.5-D.1 PROMOTION PLANNING AUTO DATES',
  stage: 'AUTO DATE UX AND PLACEHOLDER REPLACEMENT',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.93.1 - PROMOTION PLANNING AUTO DATES'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
