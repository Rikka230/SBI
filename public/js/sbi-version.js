/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.216',
  branch: 'main',
  channel: 'LIVE',
  stage: 'REPLAY URL + ATTENDANCE GATE FIX',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.216 - replay URL fallback, attendance callable and join gate fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
