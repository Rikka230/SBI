/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.94-GPT2.2',
  branch: 'main',
  channel: 'P2I.5-E-GPT2.2 STUDENT NOTICE ROUTE TRIGGER',
  stage: 'STUDENT CONSTRUCTION NOTICE ON STUDENT ROUTES',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.94-GPT2.2 - STUDENT NOTICE ROUTE TRIGGER'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
