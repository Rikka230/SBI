/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.237',
  branch: 'main',
  channel: 'LIVE V2 FUNCTIONAL MERGE',
  stage: 'TEACHER LIVE V2 SCHEDULING ACTIONS',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.237 - teacher live v2 functional merge'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
