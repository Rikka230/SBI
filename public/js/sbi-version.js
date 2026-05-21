/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.145',
  branch: 'main',
  channel: 'P2I.33 STUDENT PROGRAM READ + TEACHER EDIT FIX',
  stage: 'STUDENT PROMOTION COURSEPLAN RELAXED + TEACHER EDITOR HISTORY FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.145 - Student program list and teacher editor fixed'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
