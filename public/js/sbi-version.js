/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.221',
  branch: 'main',
  channel: 'LIVE REPLAY',
  stage: 'STUDENT LIVES REFRESH + BACK RETURN',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.221 - student lives refresh and replay back return'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
