/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.79',
  branch: 'main',
  channel: 'P2I.5-A TEACHER SHARED COURSE ACCESS',
  stage: 'TEACHER COURSES BY SHARED FORMATION',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.79 - P2I.5-A TEACHER SHARED COURSE ACCESS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
