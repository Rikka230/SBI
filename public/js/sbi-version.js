/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.124',
  branch: 'main',
  channel: 'P2I.12 CURSUS count bubbles replace icons',
  stage: 'CURSUS TRACK ICONS REMOVED COUNTERS USED AS LEFT MARKERS',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.124 - CURSUS count bubbles replace track icons'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
