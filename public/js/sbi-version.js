/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.48',
  branch: 'main',
  channel: 'PROFILE ACTIVITY RENDER CONTRAST FIX',
  stage: 'FIX ACTIVITY TEXT AT PROFILE RENDERER SOURCE',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.48 - FIX ACTIVITY TEXT AT PROFILE RENDERER SOURCE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
