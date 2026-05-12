/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.119',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'SEO foundation + PJAX head sync + admin SEO fields',
  updatedAt: '2026-05-12',
  label: 'SBI 8.0P.119 - SEO FOUNDATION + PJAX HEAD SYNC + ADMIN SEO FIELDS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
