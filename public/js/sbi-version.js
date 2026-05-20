/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.132',
  branch: 'main',
  channel: 'P2I.20 ACCOUNT LINK DIAGNOSTICS',
  stage: 'VISIBLE AND SERVER DIAGNOSTICS FOR FINALIZATION LINKS',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.132 - Account link diagnostics for finalization emails'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
