/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.243',
  branch: 'main',
  channel: 'LIVE V2 NAVIGATION REPAIR',
  stage: 'TEACHER LIVES HARD RELOAD AND STANDALONE PANEL NAV',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.243 - teacher lives navigation repair'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
