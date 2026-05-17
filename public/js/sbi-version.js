/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.61',
  branch: 'main',
  channel: 'P2I.1 PROMOTIONS COHORTES UX BASELINE',
  stage: 'ADMIN PROFILE PJAX TARGET LOCK AND EDIT REBINDING',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.61 - ADMIN PROFILE PJAX TARGET LOCK'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
