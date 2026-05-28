/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.226',
  branch: 'main',
  channel: 'STUDENT LIVES',
  stage: 'FIX STUDENT LIVES F5 WITHOUT GLOBAL PANEL PATCH',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.226 - fix student lives refresh without touching global panel'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
