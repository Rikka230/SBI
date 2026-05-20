/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.129',
  branch: 'main',
  channel: 'P2I.17 RESTORE ACCOUNT EMAIL FLOWS',
  stage: 'ROLLBACK DIRECT FINALIZATION PATCH AND RESTORE FUNCTIONS ENTRY',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.129 - Restore account email flows'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
