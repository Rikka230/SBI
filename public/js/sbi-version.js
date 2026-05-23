/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.193',
  branch: 'main',
  channel: 'COURSE EDITOR V2 PRIORITY UI',
  stage: 'P1 FILL BLANK RESIZE QUALIOPI LEGEND',
  updatedAt: '2026-05-23',
  label: 'SBI 8.0P.167.193 - Course Editor V2 priority UI fixes'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
