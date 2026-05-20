/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.125',
  branch: 'main',
  channel: 'P2I.13 COURSE PLAN DATES',
  stage: 'COURSE PAGES READ PROMOTIONS COURSEPLAN DATES',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.125 - Course pages show promotion coursePlan dates'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
