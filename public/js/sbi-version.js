/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.83',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Newsletter mobile spacing and checkbox polish',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.83 - NEWSLETTER MOBILE POLISH'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
