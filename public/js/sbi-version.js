/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.202',
  branch: 'main',
  channel: 'STUDENT COURSES',
  stage: 'PRIORITY LOAD CACHE',
  updatedAt: '2026-05-27',
  label: 'SBI 8.0P.167.202 - student course priority loading'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
