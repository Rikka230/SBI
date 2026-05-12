/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.103',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Rollback 8.0P.101 and restore index state',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.103 - MOBILE CUT MARGIN QUALIOPI ALIGNMENT'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
