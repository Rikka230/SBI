/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.236',
  branch: 'main',
  channel: 'STUDENT LIVE ORDER',
  stage: 'STUDENT LIVES CHRONOLOGICAL ORDER',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.236 - student lives chronological order'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
