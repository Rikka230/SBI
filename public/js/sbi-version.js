/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.11',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Hero video Firebase recovery and founder HD responsive fix',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.11 - HERO VIDEO FIREBASE RECOVERY + FOUNDER HD RESPONSIVE FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
