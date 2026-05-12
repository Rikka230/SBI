/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.97',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Formations hero and CTA strict correction',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.97 - FORMATIONS HERO CTA STRICT CORRECTION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
