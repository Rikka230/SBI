/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.140',
  branch: 'main',
  channel: 'P2I.28 PROMOTION CONTEXT STRICT FIX',
  stage: 'TEACHER PROMOTION FILTER STRICT + STUDENT PROMOTION COURSE OPEN FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.140 - Strict promotion context for course libraries'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
