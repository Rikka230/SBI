/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.94-GPT2.1',
  branch: 'main',
  channel: 'P2I.5-E-GPT2.1 STUDENT NOTICE PER LOGIN',
  stage: 'STUDENT CONSTRUCTION NOTICE EVERY NEW LOGIN',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.94-GPT2.1 - STUDENT NOTICE PER LOGIN'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
