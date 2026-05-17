/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.71.4',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT REQUESTS FIXES',
  stage: 'REQUEST HIDE CLOSED NOTIFY ADMIN FIX',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.71.4 - STUDENT DOCUMENT REQUESTS NOTIFY FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
