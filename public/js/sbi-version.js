/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.200',
  branch: 'main',
  channel: 'CURSUS TIMELINE',
  stage: 'STACK APPEND FREE SLOT',
  updatedAt: '2026-05-27',
  label: 'SBI 8.0P.167.200 - cursus stack append uses free slot'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
