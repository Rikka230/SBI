/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.209',
  branch: 'main',
  channel: 'LIVE ROOM',
  stage: 'PINNED TEST LIVE PER PROMOTION',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.209 - pinned Live test on every promotion'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
