/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.143',
  branch: 'main',
  channel: 'P2I.31 STUDENT CRASH + TEACHER SELECT FIX',
  stage: 'STUDENT COURSE LIST SORT GUARD + TEACHER PROMOTION SELECT PJAX STABILITY',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.143 - Student empty page and teacher selector stability fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
