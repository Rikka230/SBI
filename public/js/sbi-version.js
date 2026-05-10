/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.59',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'About hero rebuilt for mockup fidelity and blended founder stage',
  updatedAt: '2026-05-10',
  label: 'SBI 8.0P.59 - ABOUT HERO MOCKUP FIDELITY REBUILD'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
