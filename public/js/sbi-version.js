/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.172',
  branch: 'main',
  channel: 'P2J.3D COURSE EDITOR V2 UX CLEANUP',
  stage: 'EDITOR V2 BLOCK PICKER PREVIEW BANK QUILL PRESETS',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.172 - Course editor V2 shared block picker and SBI Quill presets'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
