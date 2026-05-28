/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.227',
  branch: 'main',
  channel: 'STUDENT LIVES',
  stage: 'PANEL RETRACTION DEDUP',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.227 - dedupe student lives panel retraction handlers'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
