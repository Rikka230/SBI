/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.78',
  branch: 'main',
  channel: 'P2I.5-A LMS FIELDS BASELINE',
  stage: 'LMS NON-DESTRUCTIVE COURSE FIELDS',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.78 - P2I.5-A LMS FIELDS BASELINE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
