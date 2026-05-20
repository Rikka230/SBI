/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.121',
  branch: 'main',
  channel: 'P2I.9 CURSUS track counter alignment',
  stage: 'CURSUS TIMELINE TRACK COUNTERS ALIGNED',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.121 - CURSUS track counter alignment'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
