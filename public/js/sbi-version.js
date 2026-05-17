/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.62',
  branch: 'main',
  channel: 'P2I.1 PROMOTIONS COHORTES UX BASELINE',
  stage: 'ADMIN PROFILE PJAX TARGET LOCK NO HARD RELOAD',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.62 - ADMIN PROFILE PJAX TARGET LOCK'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
