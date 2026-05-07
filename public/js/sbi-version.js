/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.25',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Restore P23 mobile diagonals and fix Qualiopi desktop light clipping',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.25 - RESTORE DIAGONALS + QUALIOPI LIGHT CLIP FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
