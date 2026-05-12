/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.114',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile public slider grid specificity cleanup',
  updatedAt: '2026-05-12',
  label: 'SBI 8.0P.114 - MOBILE PUBLIC SLIDER GRID SPECIFICITY CLEANUP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
