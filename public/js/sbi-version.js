/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.2',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public shell boot fallback - global diagnostics available before Firebase module fallback',
  updatedAt: '2026-05-02',
  label: 'SBI 8.0P.2 - PUBLIC PJAX APP SHELL BOOT FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
