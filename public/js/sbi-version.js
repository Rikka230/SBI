/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.234',
  branch: 'main',
  channel: 'LIVE SCHEDULER V2 DATA',
  stage: 'CHRONOLOGICAL LIVE V2 LIST',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.234 - chronological lives v2 list'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
