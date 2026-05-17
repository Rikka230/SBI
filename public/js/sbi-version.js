/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.44',
  branch: 'main',
  channel: 'ROLE PERMISSIONS BASELINE',
  stage: 'CENTRALIZED ROLE AND PERMISSION HELPERS',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.44 - CENTRALIZED ROLE AND PERMISSION HELPERS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
