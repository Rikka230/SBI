/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.186',
  branch: 'main',
  channel: 'COURSE WORKFLOW HOTFIX 2',
  stage: 'CORE CURSUS FILTERS PJAX V2 QUILL NOTIFICATIONS',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.186 - Core course workflow hotfix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
