/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.158',
  branch: 'main',
  channel: 'P2J.2 SHARED COURSE BLOCKS',
  stage: 'COURSE AUTHORING SHARED BLOCKS BY FORMATION',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.158 - Shared course blocks by formation'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
