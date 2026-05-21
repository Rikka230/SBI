/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.150',
  branch: 'main',
  channel: 'P2I.38 STUDENT PROGRAM RENDER FIX',
  stage: 'STUDENT PROGRAM RENDER REGRESSION FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.150 - Student program render fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
