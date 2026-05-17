/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.71.1',
  branch: 'main',
  channel: 'P2I.4 STUDENT DOCUMENT REQUESTS ACCESS FIX',
  stage: 'STUDENT DOCUMENT REQUEST PAGE ACCESS AND REOPEN FIX',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.71.1 - STUDENT DOCUMENT REQUESTS ACCESS FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
