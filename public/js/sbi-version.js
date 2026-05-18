/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.85',
  branch: 'main',
  channel: 'P2I.5-A TEACHER COURSE ACCESS INDEX',
  stage: 'DEDICATED TEACHER COURSE ACCESS INDEX FOR LIBRARY',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.85 - P2I.5-A TEACHER COURSE ACCESS INDEX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
