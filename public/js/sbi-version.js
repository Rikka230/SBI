/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.128',
  branch: 'main',
  channel: 'P2I.16 DIRECT DURABLE FINALIZATION LINKS',
  stage: 'DIRECT DURABLE FINALIZATION LINKS IN FUNCTIONS INDEX',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.128 - Direct durable finalization links in Functions index'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
