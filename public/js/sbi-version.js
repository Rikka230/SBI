/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.219',
  branch: 'main',
  channel: 'LIVE REPLAY',
  stage: 'WATERMARK FULLSCREEN + NO DOWNLOAD',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.219 - replay watermark fullscreen and no-download UI'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
