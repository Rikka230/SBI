/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.239',
  branch: 'main',
  channel: 'LIVE V2 ROOM AND F5 FIXES',
  stage: 'LIVE TEST STUDENT VISIBILITY AND ROOM DOCUMENT CLEANUP',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.239 - live v2 room documents and test visibility fixes'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
