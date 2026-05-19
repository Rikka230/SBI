/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.112',
  branch: 'main',
  channel: 'P2I.5 CURSUS QUALIOPI EVIDENCE VALUE',
  stage: 'CURSUS QUALIOPI EVIDENCE VALUE',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.112 - CURSUS QUALIOPI EVIDENCE VALUE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
