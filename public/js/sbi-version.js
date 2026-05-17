/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.70',
  branch: 'main',
  channel: 'P2I.3 STUDENT DOCUMENT VAULT ACTIONS',
  stage: 'DIRECT DOWNLOAD DELETE RENAME AND IMAGE COMPRESSION',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.70 - STUDENT DOCUMENT VAULT ACTIONS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
