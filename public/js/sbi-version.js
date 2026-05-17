/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.49',
  branch: 'main',
  channel: 'PJAX SCROLLBAR STABILITY',
  stage: 'RESERVE MAIN SCROLLBAR GUTTER',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.49 - RESERVE MAIN SCROLLBAR GUTTER'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
