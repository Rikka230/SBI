/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.248',
  branch: 'main',
  channel: 'FULL SITE AUDIT FIX LOT 1',
  stage: 'SECURITY S1-S5 + BUGS B1-B3 + SAFE A11Y/PERF/RELIABILITY',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.248 - audit fix lot 1 (security, bugs, a11y)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
