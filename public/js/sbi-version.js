/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.51',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Brevo valid sender and contact email fix',
  updatedAt: '2026-05-08',
  label: 'SBI 8.0P.51 - BREVO EMAIL TEMPLATE + CONTACT POLISH'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
