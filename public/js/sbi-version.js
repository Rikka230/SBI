/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.96.1-GPT2.1',
  branch: 'main',
  channel: 'P2I-GPT2 STUDENT DOCUMENT NOTIFY EMAIL',
  stage: 'STUDENT VISIBLE DOCUMENT NOTIFICATION AND BREVO EMAIL',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.96.1-GPT2.1 - STUDENT DOCUMENT NOTIFY EMAIL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
