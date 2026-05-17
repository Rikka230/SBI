/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.67',
  branch: 'main',
  channel: 'P2I.2 STUDENT PEDAGOGICAL FOLLOWUP INTEGRATED',
  stage: 'MERGE STUDENT FOLLOWUP INTO PEDAGOGICAL TRACKING',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.67 - STUDENT FOLLOWUP FORMATION LINK FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
