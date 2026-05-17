/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.42',
  branch: 'main',
  channel: 'FIRST LOGIN CHECKLIST',
  stage: 'MANDATORY FIRST LOGIN VALIDATION',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.42 - MANDATORY FIRST LOGIN VALIDATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
