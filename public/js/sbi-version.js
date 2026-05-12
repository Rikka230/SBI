/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.111',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile public spark lines and slider cleanup',
  updatedAt: '2026-05-12',
  label: 'SBI 8.0P.111 - MOBILE PUBLIC SPARK LINES AND SLIDER CLEANUP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
