/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.8',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public homepage responsive foundation',
  updatedAt: '2026-05-06',
  label: 'SBI 8.0P.8 - PUBLIC HOMEPAGE RESPONSIVE FOUNDATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
