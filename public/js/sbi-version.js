/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.82',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Newsletter mobile cleanup and email social links',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.82 - NEWSLETTER MOBILE + EMAIL SOCIAL LINKS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
