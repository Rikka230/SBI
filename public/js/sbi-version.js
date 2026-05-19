/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.110',
  branch: 'main',
  channel: 'P2I.5 CURSUS QA FINAL',
  stage: 'CURSUS QA FINAL',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.110 - CURSUS QA FINAL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
