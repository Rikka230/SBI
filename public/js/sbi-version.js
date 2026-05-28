/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.223',
  branch: 'main',
  channel: 'STUDENT LIVES',
  stage: 'STANDALONE NAV AFTER REFRESH',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.223 - fix student lives standalone navigation after refresh'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
