/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.123',
  branch: 'main',
  channel: 'P2I.11 CURSUS track counters outside text flow',
  stage: 'CURSUS TRACK COUNTERS ALIGNED OUTSIDE TEXT AND QA BUTTON SIZED',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.123 - CURSUS counters outside text and QA button size'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
