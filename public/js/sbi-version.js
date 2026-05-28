/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.206',
  branch: 'main',
  channel: 'LIVE ROOM MVP',
  stage: 'DAILY CONFERENCE ROOM FUNCTIONAL MVP',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.206 - Daily conference room MVP with secure tokens'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
