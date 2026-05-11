/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.88',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public formations hotfix admin tab, unsaved guard, card overlays, login background',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.88 - PUBLIC FORMATIONS FULL PAGE DETAIL HOTFIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
