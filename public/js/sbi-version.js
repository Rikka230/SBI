/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.144',
  branch: 'main',
  channel: 'P2I.32 STUDENT EMPTY PAGE + TEACHER FREEZE FIX',
  stage: 'STUDENT COURSE LIST STABILIZATION + SAFE TEACHER PROMOTION SELECTOR',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.144 - Student course list stabilized and teacher selector freeze fixed'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
