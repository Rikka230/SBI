/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.75',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Legal pages + footer links',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.75 - LEGAL PAGES + FOOTER LINKS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
