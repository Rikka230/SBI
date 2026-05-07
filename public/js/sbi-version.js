/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.10b',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public mobile performance safe pass',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.10b - PUBLIC MOBILE PERFORMANCE SAFE PASS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
