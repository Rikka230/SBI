/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.196',
  branch: 'main',
  channel: 'COURSE EDITOR V2 ACTIVITIES',
  stage: 'QCM RESOURCE CHECKPOINT OBJECTIVES VIEWER',
  updatedAt: '2026-05-23',
  label: 'SBI 8.0P.167.196 - editor module duplicate cleanup'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
