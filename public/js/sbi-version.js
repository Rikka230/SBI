/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.62',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'About hero overlay layer / ungrid hero visual',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.62 - ABOUT HERO OVERLAY LAYER PATCH'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
