/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.210',
  branch: 'main',
  channel: 'LIVE ROOM',
  stage: 'LIVE ROOM SYNTAX HOTFIX',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.210 - fix live room syntax error'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
