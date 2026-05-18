/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.83',
  branch: 'main',
  channel: 'P2I.5-A TEACHER LIBRARY REBUILD',
  stage: 'DEDICATED TEACHER COURSE LIBRARY',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.83 - P2I.5-A TEACHER LIBRARY REBUILD'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
