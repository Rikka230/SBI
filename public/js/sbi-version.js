/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.88',
  branch: 'main',
  channel: 'P2I.5-A TEACHER COURSES PJAX SOFT MOUNT',
  stage: 'TEACHER COURSES ROUTE SOFT MOUNT NO HARD RELOAD',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.88 - TEACHER COURSES PJAX SOFT MOUNT'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
