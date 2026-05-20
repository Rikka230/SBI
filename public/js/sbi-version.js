/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.127',
  branch: 'main',
  channel: 'P2I.15 FINALIZATION ANY NON FINALIZED STATE',
  stage: 'DURABLE FINALIZATION FOR EVERY NON FINALIZED ACCOUNT STATE',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.127 - Durable finalization for every non-finalized account state'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
