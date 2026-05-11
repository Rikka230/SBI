/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.78',
  branch: 'legal-pages-footer',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Diagonals restore without legal artefacts',
  updatedAt: '2026-05-11',
  label: 'SBI 8.0P.78 - DIAGONALS RESTORE WITHOUT LEGAL ARTEFACTS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
