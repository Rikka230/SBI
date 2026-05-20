/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.130',
  branch: 'main',
  channel: 'P2I.18 ACCOUNT CREATION LOCK RECOVERY',
  stage: 'RESTORE FUNCTION ENTRY AND GUARD ACCOUNT CREATION SUBMIT',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.130 - Account creation lock recovery'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
