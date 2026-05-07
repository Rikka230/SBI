/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.33',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Desktop wide stats grid alignment without mobile changes',
  updatedAt: '2026-05-08',
  label: 'SBI 8.0P.33 - DESKTOP STATS WIDTH ALIGNMENT'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
