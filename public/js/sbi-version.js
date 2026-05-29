/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.251',
  branch: 'main',
  channel: 'AUDIT FIX LOT 2D - SAFE LIVE ROOM ITEM',
  stage: 'HOST UPLOAD CLIENT-SIDE VALIDATION (2C + shell 2D items deferred)',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.251 - audit fix lot 2D (host upload validation)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
