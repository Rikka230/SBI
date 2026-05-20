/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.122',
  branch: 'main',
  channel: 'P2I.10 CURSUS track counters fixed QA access',
  stage: 'CURSUS TRACK COUNTERS FIXED AND QA BUTTON ADDED',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.122 - CURSUS track counters fixed and QA button'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
