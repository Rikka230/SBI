/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.60',
  branch: 'main',
  channel: 'P2I.1 PROMOTIONS COHORTES UX BASELINE',
  stage: 'PROMOTIONS UX PROFILE ASSIGNMENT AND ROSTER',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.60 - PROMOTIONS PROFILE NAVIGATION FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
