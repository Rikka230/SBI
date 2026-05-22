/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.184',
  branch: 'main',
  channel: 'COURSE VALIDATION WORKFLOW',
  stage: 'TEACHER LOCK ADMIN PUBLISH NOTIFICATIONS',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.184 - Course validation workflow'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
