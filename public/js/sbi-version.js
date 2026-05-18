/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.94-GPT2',
  branch: 'main',
  channel: 'P2I.5-E-GPT2 STUDENT CONSTRUCTION NOTICE',
  stage: 'STUDENT POST-LOGIN NOTICE AND PATCH NOTES',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.94-GPT2 - STUDENT CONSTRUCTION NOTICE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
