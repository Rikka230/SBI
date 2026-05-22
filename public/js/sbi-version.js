/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.185',
  branch: 'main',
  channel: 'COURSE WORKFLOW HOTFIX',
  stage: 'COURSEPLAN STUDENT NOTIFICATIONS QUILL CURSUS FILTERS',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.185 - Course workflow hotfix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
