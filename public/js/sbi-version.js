/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.55',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'About page index background and video panels fix',
  updatedAt: '2026-05-10',
  label: 'SBI 8.0P.55 - ABOUT INDEX BACKGROUND + VIDEO PANELS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
