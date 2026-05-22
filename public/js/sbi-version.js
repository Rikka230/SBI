/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.187',
  branch: 'main',
  channel: 'COURSE WORKFLOW HOTFIX',
  stage: 'STUDENT COURSEPLAN NOTIFICATIONS ADMIN RIGHT PANEL',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.187 - Student notifications and admin editor panel'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
