/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.81',
  branch: 'main',
  channel: 'P2I.5-A TEACHER DIRECT COURSE TARGETING',
  stage: 'TEACHER COURSES VIA TARGET TEACHER IDS',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.81 - P2I.5-A TEACHER DIRECT COURSE TARGETING'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
