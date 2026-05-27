/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.201',
  branch: 'main',
  channel: 'CURSUS LIVE',
  stage: 'LIVE RENAME FUTURE BLOCKS',
  updatedAt: '2026-05-27',
  label: 'SBI 8.0P.167.201 - live rename and future blocks'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
