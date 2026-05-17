/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.71.2',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT REQUESTS FIXES',
  stage: 'REQUEST PARTIAL UPLOADS ADMIN VISIBILITY LOGIN RETURN',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.71.2 - STUDENT DOCUMENT REQUESTS FIXES'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
