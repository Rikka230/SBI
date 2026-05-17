/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.58',
  branch: 'main',
  channel: 'P2I.1 PROMOTIONS COHORTES BASELINE',
  stage: 'PROMOTIONS COHORTES ADMIN PAGE USER ASSIGNMENT',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.58 - PROMOTIONS COHORTES BASELINE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
