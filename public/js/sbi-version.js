/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.55',
  branch: 'main',
  channel: 'ADMIN ACCOUNT DETAILED STATES RESTORE',
  stage: 'RESTORE DASHBOARD STATUS LOGIC WITHOUT MUTATION OBSERVER',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.55 - RESTORE DASHBOARD STATUS LOGIC WITHOUT MUTATION OBSERVER'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
