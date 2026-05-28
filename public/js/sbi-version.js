/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.231',
  branch: 'main',
  channel: 'LIVE SCHEDULER UX',
  stage: 'CURSUS LIVE TITLES AND REPORT UX',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.231 - live scheduler ux refresh'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
