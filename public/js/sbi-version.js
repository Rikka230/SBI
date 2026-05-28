/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.232',
  branch: 'main',
  channel: 'LIVE SCHEDULER V2',
  stage: 'ISOLATED LIVE V2 PAGE',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.232 - isolated live scheduler v2'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
