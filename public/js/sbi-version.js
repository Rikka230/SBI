/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.139',
  branch: 'main',
  channel: 'P2I.27 PROMOTION CONTEXT SELECTOR',
  stage: 'TEACHER PROMOTION DATE SELECTOR + STUDENT PROMOTION COURSE VIEW BRIDGE',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.139 - Promotion context selector for course libraries'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
