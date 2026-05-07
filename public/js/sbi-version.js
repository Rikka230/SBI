/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.40',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Index hero PJAX fade and calculator stylesheet-ready render',
  updatedAt: '2026-05-08',
  label: 'SBI 8.0P.40 - DESKTOP HERO BAND SPACING AND LOGO CONTAINMENT'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
