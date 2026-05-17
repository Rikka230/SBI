/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.73',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT ADMIN REVIEW',
  stage: 'PARTIAL REVIEW RESUBMIT VALIDATION EMAIL ADMIN ALERT',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.73 - STUDENT DOCUMENT ADMIN REVIEW'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
