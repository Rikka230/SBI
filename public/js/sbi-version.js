/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.61',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'About hero founder centered bronze ghost cleanup',
  updatedAt: '2026-05-10',
  label: 'SBI 8.0P.61 - ABOUT HERO CENTER + BRONZE CLEANUP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
