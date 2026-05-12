/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.94',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Formations and resources true visual implementation',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.94 - FORMATIONS RESSOURCES TRUE VISUAL IMPLEMENTATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
