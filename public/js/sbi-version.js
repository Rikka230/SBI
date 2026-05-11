/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.74',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Login background + contact feedback scroll',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.74 - LOGIN BACKGROUND + CONTACT FEEDBACK SCROLL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
