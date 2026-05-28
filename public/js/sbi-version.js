/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.220',
  branch: 'main',
  channel: 'LIVE REPLAY',
  stage: 'DIRECT REFRESH HARDENING',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.220 - stable direct refresh for live and replay pages'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
