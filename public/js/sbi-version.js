/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.84',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Newsletter desktop checkbox square lock',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.84 - NEWSLETTER DESKTOP CHECKBOX SQUARE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
