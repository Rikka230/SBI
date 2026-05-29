/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.242',
  branch: 'main',
  channel: 'LIVE V2 ISOLATED F5 AND TEST FLOW',
  stage: 'TEACHER LIVES STANDALONE TEST LIVE AND ROOM ROLES',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.242 - isolated teacher lives f5 and live test flow'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
