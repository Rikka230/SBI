/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.90',
  branch: 'main',
  channel: 'P2I.5-B PROMOTIONS FORMATION SOURCE FIX',
  stage: 'PROMOTIONS USE PRIVATE FORMATIONS DELETE CSS CLEANUP',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.90 - PROMOTIONS FORMATION SOURCE FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
