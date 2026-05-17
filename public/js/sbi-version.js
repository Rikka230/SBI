/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.46',
  branch: 'main',
  channel: 'PROFILE ACTIVITY CONTRAST FIX',
  stage: 'TEACHER STUDENT PROFILE ACTIVITY TEXT CONTRAST',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.46 - TEACHER STUDENT PROFILE ACTIVITY TEXT CONTRAST'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
