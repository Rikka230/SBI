/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.71',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT REQUESTS',
  stage: 'REQUEST DOCUMENTS FROM STUDENTS',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.71 - STUDENT DOCUMENT REQUESTS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
