/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.244',
  branch: 'main',
  channel: 'LIVE V2 RENDER CRASH FIX',
  stage: 'DEFINE TEST ROOM OPEN STATE',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.244 - fix live v2 test room render crash'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
