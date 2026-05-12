/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.101',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile diagonal spacing and Qualiopi alignment hotfix',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.101 - MOBILE DIAGONAL SPACING HOTFIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
