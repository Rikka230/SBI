/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.183',
  branch: 'main',
  channel: 'COURSE VIEWER FILL BLANK FIX',
  stage: 'FILL BLANK ANSWERS HIDDEN UNTIL VALIDATION',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.183 - Course viewer fill blank answers hidden'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
