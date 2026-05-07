/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.27',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Rollback 8.0P.26 and restore previous stable base before new light fix',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.27 - ROLLBACK P26 RESTORE PREVIOUS BASE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
