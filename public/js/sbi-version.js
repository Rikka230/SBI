/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.191',
  branch: 'main',
  channel: 'SEO STATIC META AND CANONICALS',
  stage: 'PUBLIC PAGES META DESCRIPTION CANONICAL OG TWITTER JSONLD',
  updatedAt: '2026-05-23',
  label: 'SBI 8.0P.167.191 - SEO static meta and canonicals'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
