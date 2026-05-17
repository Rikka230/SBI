/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.53',
  branch: 'main',
  channel: 'ADMIN ACCOUNTS CACHE AND LIST PERFORMANCE',
  stage: 'LONG CACHE WITH SERVER INVALIDATION FOR ACCOUNTS LIST',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.53 - ADMIN ACCOUNTS CACHE AND LIST PERFORMANCE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
