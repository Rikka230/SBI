/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.212',
  branch: 'main',
  channel: 'LIVE REPLAY',
  stage: 'REPLAY ACCESS LINKS',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.212 - resolve Daily replay links for students'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
