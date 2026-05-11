/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.77',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Legal pages mobile polish',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.77 - LEGAL PAGES MOBILE POLISH'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
