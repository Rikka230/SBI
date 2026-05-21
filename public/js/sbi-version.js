/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.173',
  branch: 'main',
  channel: 'P2J.3D COURSE EDITOR V2 UX PATCH',
  stage: 'EDITOR V2 FIXED BANK SETTINGS PICKER PREVIEW AND NEW COURSE BRIDGE',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.173 - Course editor V2 bank fixed picker preview and bridge fixes'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
