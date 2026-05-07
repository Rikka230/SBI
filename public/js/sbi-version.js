/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.31',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Fix Qualiopi background layer clipping and restore bottom corner lights',
  updatedAt: '2026-05-08',
  label: 'SBI 8.0P.31 - QUALIOPI LIGHT LAYER FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
