/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.156',
  branch: 'main',
  channel: 'P2I.44 STUDENT PROGRAM QA ORDER HIDE DONE',
  stage: 'STUDENT PROGRAM ORDER AND HIDE COMPLETED',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.156 - Student program order and hide completed'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
