/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.5',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public pages foundation without live public route',
  updatedAt: '2026-05-02',
  label: 'SBI 8.0P.5 - PUBLIC PAGES FOUNDATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
