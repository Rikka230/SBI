/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.71.3',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT REQUESTS FIXES',
  stage: 'REQUEST PAGE LOAD CANCEL REQUESTS LOGIN RETURN',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.71.3 - STUDENT DOCUMENT REQUESTS FLOW HOTFIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
