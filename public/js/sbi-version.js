/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.123',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Hero YouTube overlay body-layer fix',
  updatedAt: '2026-05-12',
  label: 'SBI 8.0P.123 - HERO YOUTUBE OVERLAY BODY LAYER FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
