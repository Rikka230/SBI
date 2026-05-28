/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.217',
  branch: 'main',
  channel: 'LIVE REPLAY',
  stage: 'REPLAY PLAYER WATERMARK + REFRESH',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.217 - replay player layout watermark and refresh fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
