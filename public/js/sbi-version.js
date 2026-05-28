/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.218',
  branch: 'main',
  channel: 'LIVE REPLAY',
  stage: 'REPLAY LOADER + REFRESH HARDENING',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.218 - replay loader cleanup and refresh hardening'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
