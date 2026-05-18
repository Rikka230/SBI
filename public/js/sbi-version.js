/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.95-GPT2.1',
  branch: 'main',
  channel: 'P2I-GPT2 STUDENT DOCUMENT VISIBILITY ADMIN',
  stage: 'ADMIN CONTROL FOR STUDENT VISIBLE DOCUMENTS',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.95-GPT2.1 - STUDENT DOCUMENT VISIBILITY ADMIN'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
