/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.68',
  branch: 'main',
  channel: 'P2I.3 STUDENT DOCUMENT VAULT BASELINE',
  stage: 'ADMIN STUDENT DOCUMENTS VAULT BASELINE',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.68 - STUDENT DOCUMENT VAULT BASELINE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
