/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.114',
  branch: 'main',
  channel: 'P2I.5 CURSUS PROMOTION AUTO SYNC',
  stage: 'CURSUS PROMOTION AUTO SYNC',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.114 - CURSUS PROMOTION AUTO SYNC'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
