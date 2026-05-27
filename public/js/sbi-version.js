/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.204',
  branch: 'main',
  channel: 'PRIVACY + VIEWER',
  stage: 'PROFILE ACCESS HOTFIX',
  updatedAt: '2026-05-27',
  label: 'SBI 8.0P.167.204 - viewer downloads, live loading and profile privacy'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
