/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.155',
  branch: 'main',
  channel: 'P2I.43 STUDENT PROGRAM ORDER STATUS',
  stage: 'STUDENT COURSE PROGRAM ORDER AND STATUS CLEANUP',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.155 - Student program order and status cleanup'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
