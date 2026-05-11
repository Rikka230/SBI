/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.79',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile home formation section cut restore',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.79 - MOBILE HOME FORMATION SECTION CUT RESTORE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
