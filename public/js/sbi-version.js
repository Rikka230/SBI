/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.230',
  branch: 'main',
  channel: 'STUDENT LIVES',
  stage: 'LIVES F5 SHELL ISOLATION',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.230 - isolate lives F5 from global shell'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
