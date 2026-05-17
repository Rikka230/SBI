/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.72',
  branch: 'main',
  channel: 'P2I.5 STUDENT DOCUMENT REVIEW',
  stage: 'ADMIN DOCUMENT REVIEW AND PROFILE LINK FIX',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.72 - STUDENT DOCUMENT REVIEW'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
