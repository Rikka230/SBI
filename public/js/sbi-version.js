/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.189',
  branch: 'main',
  channel: 'CURSUS DIRECT STUDENT NOTIFICATIONS',
  stage: 'COURSEPLAN SAVE TRIGGERS STUDENT NOTIFICATIONS',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.189 - Cursus direct student notifications'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
