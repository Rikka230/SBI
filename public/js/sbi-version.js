/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.54',
  branch: 'main',
  channel: 'ADMIN ACCOUNTS STATUS AND SCROLL FIX',
  stage: 'RESTORE DETAILED ACCOUNT STATES AND REDUCE ROW REPAINTS',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.54 - RESTORE DETAILED ACCOUNT STATES AND REDUCE ROW REPAINTS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
