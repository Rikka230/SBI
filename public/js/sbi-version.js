/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.192',
  branch: 'main',
  channel: 'COURSE BLOCKS REFERENCE INDEX',
  stage: 'P2J4 SHARED COURSEBLOCKS BOOTSTRAP',
  updatedAt: '2026-05-23',
  label: 'SBI 8.0P.167.192 - CourseBlocks shared reference bootstrap'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
