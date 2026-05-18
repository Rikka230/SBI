/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.96.1-GPT2.2',
  branch: 'main',
  channel: 'P2I-GPT2 STUDENT VISIBLE DOCUMENTS UI',
  stage: 'STUDENT DOCUMENTS PROFILE PANEL AND MOBILE FIRST LOGIN FIX',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.96.1-GPT2.2 - STUDENT VISIBLE DOCUMENTS UI'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
