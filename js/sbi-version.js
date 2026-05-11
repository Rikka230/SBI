/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.92',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Formation sheet scroll lock cleanup hotfix',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.92 - FORMATION SHEET SCROLL LOCK HOTFIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
