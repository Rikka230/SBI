/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.98-GPT2.3',
  branch: 'main',
  channel: 'P2I-GPT2 PROFILE BADGE WHITE ZONE',
  stage: 'TEACHER PROFILE NAME AND BADGE WHITE ZONE POSITION',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.98-GPT2.3 - PROFILE BADGE WHITE ZONE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
