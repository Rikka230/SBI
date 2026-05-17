/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.51',
  branch: 'main',
  channel: 'ADMIN CANONICAL SURFACE',
  stage: 'ONE ADMIN BACKGROUND BASED ON PROFILE',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.51 - ONE ADMIN BACKGROUND BASED ON PROFILE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
