/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.120',
  branch: 'main',
  channel: 'P2I.8 CURSUS placeholder replacement memory refresh',
  stage: 'COURSE FUTURE BLOCK REPLACEMENT SAVES AS REAL COURSE',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.120 - CURSUS placeholder replacement memory refresh'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
