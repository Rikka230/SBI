/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.121',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'PJAX admin resource tab sync + no static placeholders',
  updatedAt: '2026-05-12',
  label: 'SBI 8.0P.121 - PJAX ADMIN RESOURCE TAB SYNC + NO STATIC PLACEHOLDERS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
