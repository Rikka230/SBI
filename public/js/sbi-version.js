/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.24',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Desktop lower-page corner lights moved to main background layer',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.24 - DESKTOP LOWER-PAGE CORNER LIGHTS FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
