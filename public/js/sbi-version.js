/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.97',
  branch: 'main',
  channel: 'P2I.5-G PROMOTION PLANNING MULTI LAYERS V1',
  stage: 'TIMELINE MULTI LAYERS COURSES ASSIGNMENTS EXAMS LIVES BUFFERS',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.97 - PROMOTION PLANNING MULTI LAYERS V1'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
