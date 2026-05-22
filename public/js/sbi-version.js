/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.188',
  branch: 'main',
  channel: 'COURSE STUDENT NOTIFICATIONS RESET',
  stage: 'SERVER NOTIFICATION ROUTING AND EDITOR CLEANUP',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.188 - Student notifications reset and editor cleanup'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
