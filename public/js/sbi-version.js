/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.194',
  branch: 'main',
  channel: 'COURSE EDITOR V2 BLOCK REWORKS',
  stage: 'PEDAGOGIC BLOCKS RESOURCE ASSIGNMENT CHECKPOINT CASE STUDY',
  updatedAt: '2026-05-23',
  label: 'SBI 8.0P.167.194 - Course Editor V2 pedagogic block reworks'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
