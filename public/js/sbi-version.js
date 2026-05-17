/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.65',
  branch: 'main',
  channel: 'P2I.2 STUDENT FOLLOWUP PROFILE BASELINE',
  stage: 'ADMIN STUDENT DETAIL FOLLOWUP BASELINE',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.65 - STUDENT FOLLOWUP PROFILE BASELINE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
