/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.249',
  branch: 'main',
  channel: 'AUDIT FIX LOT 2A - PERF & A11Y',
  stage: 'PRECONNECT FONTS + FONT-WEIGHT 900 + CROPPER DEFER + LABELS/LAZY',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.249 - audit fix lot 2A (perf & a11y sweeps)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
