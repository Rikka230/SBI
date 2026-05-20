/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.116',
  branch: 'main',
  channel: 'P2I.7 RESPONSIVE PANELS LOGIN QUALIOPI',
  stage: 'RESPONSIVE PANELS LOGIN QUALIOPI',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.116 - RESPONSIVE PANELS LOGIN QUALIOPI'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
