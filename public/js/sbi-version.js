/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.70',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Contact low-height overflow fix',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.70 - CONTACT LOW HEIGHT FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
