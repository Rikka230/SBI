/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.148',
  branch: 'main',
  channel: 'P2I.36 STUDENT PROGRAM PLAN PRESERVE + OPEN DIRECT',
  stage: 'STUDENT PROGRAM PRESERVES ALL COURSEPLAN ITEMS AND OPENS PLAN COURSES DIRECTLY',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.148 - Student program keeps all planned courses and opens cross-formation items'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
