/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.63',
  branch: 'main',
  channel: 'P2I.1 PROMOTIONS COHORTES UX BASELINE',
  stage: 'ADMIN PROFILE SYNTAX FIX AND PJAX TARGET STABILIZED',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.63 - ADMIN PROFILE SYNTAX FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
