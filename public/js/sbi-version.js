/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.207',
  branch: 'main',
  channel: 'LIVE ROOM MVP',
  stage: 'LIVE TEST ROOM MVP',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.207 - live test room per promotion with Daily MVP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
