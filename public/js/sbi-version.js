/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.45',
  branch: 'main',
  channel: 'TEACHER PROFILE PJAX VISUAL FIX',
  stage: 'KEEP TEACHER STUDENT PROFILE BACKGROUND LIGHT AFTER COURSES',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.45 - KEEP TEACHER STUDENT PROFILE BACKGROUND LIGHT AFTER COURSES'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
