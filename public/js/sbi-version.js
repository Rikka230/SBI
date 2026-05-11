/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.65',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile header alignment and contact mobile structure cleanup',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.65 - MOBILE HEADER AND CONTACT STRUCTURE ALIGNMENT'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
