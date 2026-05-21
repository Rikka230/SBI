/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.146',
  branch: 'main',
  channel: 'P2I.34 STUDENT PROGRAM SORT FIX',
  stage: 'STUDENT PROGRAM LIST SORT FIX WITHOUT TEACHER CHANGES',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.146 - Student program list sort fixed'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
