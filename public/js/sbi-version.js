/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.224',
  branch: 'main',
  channel: 'STUDENT LIVES',
  stage: 'SAFE STUDENT SHELL AFTER REFRESH',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.224 - safe student shell after refresh'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
