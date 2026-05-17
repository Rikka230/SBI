/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.76',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT REQUEST EXPIRATION',
  stage: 'REQUEST EXPIRATION AND CLEANUP',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.76 - STUDENT DOCUMENT REQUEST EXPIRATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
