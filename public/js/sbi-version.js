/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.177',
  branch: 'main',
  channel: 'P2J.3D COURSE EDITOR V2 NAVIGATION SAFETY',
  stage: 'EDITOR V2 BACK TO LIBRARY FREEZE FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.177 - Course editor V2 back navigation freeze fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
