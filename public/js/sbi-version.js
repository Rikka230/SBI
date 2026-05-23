/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.190',
  branch: 'main',
  channel: 'SEO REDIRECTS AND 404 CLEANUP',
  stage: 'WIX LEGACY URL REDIRECTS + CLEAN 404 PAGE',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.190 - SEO redirects and 404 cleanup'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
