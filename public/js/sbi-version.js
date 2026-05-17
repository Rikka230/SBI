/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.74',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT ADMIN REVIEW',
  stage: 'RESUBMIT ALERT PROFILE ROUTE REVIEW LOCK',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.74 - STUDENT DOCUMENT REVIEW RESUBMIT ALERT FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
