/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.23',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile diagonal overlay alignment fix',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.23 - MOBILE DIAGONAL ALIGNMENT FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
